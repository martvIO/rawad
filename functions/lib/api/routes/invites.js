"use strict";
// Per-guest invite-link endpoints (physical + digital).
//
// Replaces four onCall functions and a public RTDB read:
//   POST /invites                 admin only (60/hr): mint physical invite
//   POST /invites/submit          PUBLIC (5/hr/IP):    submit physical reply
//   POST /invites/digital         admin only (60/hr): mint digital invite
//   POST /invites/digital/submit  PUBLIC (10/hr/IP):   submit digital reply
//   GET  /invites/token/:token    PUBLIC:              read the token record
//
// Token format: 32-char lowercase hex (128 bits of entropy via `randomBytes`).
// Token records live at /inviteTokens/{token} in RTDB and carry a 90-day TTL.
// Physical invites patch the RTDB guest record under /guestsByGroom/{groomUid};
// digital invites patch the Firestore doc digitalInvitations/{groomUid}/guests/
// {guestId}.
//
// What this file does NOT do:
//   - It does not subscribe to a token (real-time). The InviteForm page
//     polls GET /invites/token/:token once on load and treats `usedAt` as
//     a one-shot guard.
Object.defineProperty(exports, "__esModule", { value: true });
exports.invitesRouter = void 0;
const express_1 = require("express");
const database_1 = require("firebase-admin/database");
const firestore_1 = require("firebase-admin/firestore");
const crypto_1 = require("crypto");
const auth_1 = require("../middleware/auth");
const rateLimit_1 = require("../middleware/rateLimit");
const helpers_1 = require("../../helpers");
const audit_1 = require("../../audit");
const limits_1 = require("../../constants/limits");
const time_1 = require("../../constants/time");
const rateLimits_1 = require("../../constants/rateLimits");
const tokens_1 = require("../../constants/tokens");
const format_1 = require("../../constants/format");
// ─── Constants ────────────────────────────────────────────────────────────────
const CREATE_INVITE_MAX_PER_HOUR = rateLimits_1.RATE.CREATE_INVITE_PER_USER.limit;
const SUBMIT_PHYSICAL_MAX_PER_HOUR_IP = rateLimits_1.RATE.SUBMIT_INVITE_PER_IP.limit;
const SUBMIT_DIGITAL_MAX_PER_HOUR_IP = rateLimits_1.RATE.SUBMIT_DIGITAL_INVITE_PER_IP.limit;
const MAX_GUEST_NAME_LEN = limits_1.MAX_LEN.NAME;
const MAX_GUEST_PHONE_LEN = limits_1.MAX_LEN.PHONE;
const MAX_GUEST_USERNAME_LEN = limits_1.MAX_LEN.USERNAME;
const MAX_NOTE_LEN = limits_1.MAX_LEN.NOTE;
const MAX_CITY_LEN = limits_1.MAX_LEN.CITY;
const MAX_STREET_LEN = limits_1.MAX_LEN.STREET;
const MAX_HOUSE_LEN = limits_1.MAX_LEN.HOUSE;
const MAX_NAME_LEN = limits_1.MAX_LEN.NAME;
const MAX_PHONE_LEN = limits_1.MAX_LEN.PHONE;
const MAX_DELIVERY_NOTE_LEN = limits_1.MAX_LEN.AREA;
const MIN_LAT = -90;
const MAX_LAT = 90;
const MIN_LNG = -180;
const MAX_LNG = 180;
const MIN_ACCURACY_M = 0;
const MAX_ACCURACY_M = 100000;
const ARABIC_ADDRESS_SEPARATOR = format_1.ADDRESS_JOINER;
const RSVP_VALUES = new Set(["attending", "absent"]);
// Extra RSVP fields the luxury digital invitation collects from the guest.
// `companions` = people attending BESIDES the invited guest (0–20, default 0).
const MAX_COMPANIONS = 20;
const MAX_MEAL_PREF_LEN = 40;
const MAX_SONG_REQUEST_LEN = 120;
const MAX_WISH_LEN = 300;
exports.invitesRouter = (0, express_1.Router)();
// ─── GET /invites/token/:token ────────────────────────────────────────────────
/**
 * Public read of a token record. Used by the InviteForm page to pre-fill
 * the guest's name/phone and to detect expired/used tokens before showing
 * the form. Returns 404 on missing tokens so the page can render an
 * "invalid invitation" message.
 */
exports.invitesRouter.get("/token/:token", async (req, res) => {
    const { token } = req.params;
    if (!tokens_1.TOKEN_HEX_RE.test(token)) {
        res.status(400).json({ error: "invalid_token_format" });
        return;
    }
    try {
        const snap = await (0, database_1.getDatabase)().ref(`inviteTokens/${token}`).get();
        if (!snap.exists()) {
            res.status(404).json({ error: "token_not_found" });
            return;
        }
        res.json(snap.val());
    }
    catch (err) {
        res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
    }
});
// ─── POST /invites (physical) ─────────────────────────────────────────────────
/**
 * Mint a physical-invite token for a specific guest under a groom.
 * Admin only — sending invite links is an admin operation; grooms manage
 * the guest list but never self-send. Stamps the guest record with
 * `inviteLinkToken` + `inviteLinkSentAt` so the groom's UI can show the
 * "sent" pill.
 *
 * Body: `{ groomUid, guestId }`
 * Returns: `{ token, expiresAt }`.
 */
exports.invitesRouter.post("/", auth_1.requireAuth, auth_1.requireAdmin, (0, rateLimit_1.uidRateLimit)("createInvite", CREATE_INVITE_MAX_PER_HOUR, time_1.HOUR_MS), async (req, res) => {
    const callerUid = req.caller.uid;
    const groomUid = (req.body?.groomUid ?? "").toString();
    const guestId = (req.body?.guestId ?? "").toString();
    if (!groomUid || !guestId) {
        res.status(400).json({ error: "missing_required" });
        return;
    }
    try {
        const db = (0, database_1.getDatabase)();
        const guestSnap = await db
            .ref(`guestsByGroom/${groomUid}/${guestId}`)
            .get();
        if (!guestSnap.exists()) {
            res.status(404).json({ error: "guest_not_found" });
            return;
        }
        const guest = guestSnap.val();
        const groomUsername = await resolveGroomUsername(guest?.groomUsername, groomUid);
        if (!groomUsername) {
            res.status(409).json({ error: "groom_username_unavailable" });
            return;
        }
        const { token, expiresAt, now } = mintToken();
        const tokenRecord = {
            groomUid,
            groomUsername,
            guestId,
            guestName: clampStr(guest?.name, MAX_GUEST_NAME_LEN),
            guestPhone: clampStr(guest?.phone, MAX_GUEST_PHONE_LEN),
            createdAt: now,
            expiresAt,
        };
        await db.ref(`inviteTokens/${token}`).set(tokenRecord);
        await db.ref(`guestsByGroom/${groomUid}/${guestId}`).update({
            inviteLinkToken: token,
            inviteLinkSentAt: now,
        });
        await (0, audit_1.writeAudit)(callerUid, "createGuestInvite", { groomUid, guestId });
        res.json({ token, expiresAt });
    }
    catch (err) {
        res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
});
// ─── POST /invites/submit (physical, PUBLIC) ──────────────────────────────────
/**
 * Public submit for a physical invite. Validates the token, patches the
 * RTDB guest record, AND mirrors a row into /confirmations so the Admin
 * Confirmations tab shows the reply alongside the public form submissions.
 *
 * Marks the token `usedAt` to prevent re-submission.
 */
exports.invitesRouter.post("/submit", (0, rateLimit_1.ipRateLimit)("invite", SUBMIT_PHYSICAL_MAX_PER_HOUR_IP, time_1.HOUR_MS), async (req, res) => {
    const parsed = parsePhysicalSubmitBody(req.body);
    if (!parsed.ok) {
        res.status(400).json({ error: parsed.error, field: parsed.field });
        return;
    }
    const submission = parsed.value;
    try {
        const db = (0, database_1.getDatabase)();
        const tokenSnap = await db.ref(`inviteTokens/${submission.token}`).get();
        if (!tokenSnap.exists()) {
            res.status(404).json({ error: "token_not_found" });
            return;
        }
        const tk = tokenSnap.val();
        if (Date.now() > tk.expiresAt) {
            res.status(410).json({ error: "token_expired" });
            return;
        }
        const guestRef = db.ref(`guestsByGroom/${tk.groomUid}/${tk.guestId}`);
        const guestSnap = await guestRef.get();
        if (!guestSnap.exists()) {
            res.status(404).json({ error: "guest_record_missing" });
            return;
        }
        const now = Date.now();
        const area = joinAddress(submission.submittedCity, submission.submittedStreet, submission.submittedHouse);
        const guestPatch = buildPhysicalGuestPatch(submission, area, now);
        // The guest's own submission is authoritative for their location. A pin /
        // GPS already overwrites lat/lng above. If instead they entered a NEW
        // address WITHOUT a pin, drop any stale coordinates (e.g. a pin the groom
        // set earlier) so the map reflects the address the guest actually entered
        // (geocoded) rather than the old location.
        if (!submission.hasCoords) {
            const cur = guestSnap.val();
            const curArea = (cur?.area ?? "").toString().trim();
            if (area.trim() && area.trim() !== curArea && typeof cur?.lat === "number") {
                guestPatch.lat = null;
                guestPatch.lng = null;
                guestPatch.locationSource = null;
                guestPatch.locationAccuracy = null;
                guestPatch.locationUpdatedAt = now;
            }
        }
        await guestRef.update(guestPatch);
        const groomUsername = await resolveGroomUsername(tk.groomUsername, tk.groomUid);
        const confRecord = buildPhysicalConfirmationRecord(tk, groomUsername, submission, now);
        await db.ref("confirmations").push(confRecord);
        await db.ref(`inviteTokens/${submission.token}/usedAt`).set(now);
        res.json({ ok: true });
    }
    catch (err) {
        res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
});
// ─── POST /invites/digital ────────────────────────────────────────────────────
/**
 * Mint a digital-invite token for a specific guest under a groom. The
 * digital guest list lives in Firestore (not RTDB), so the read & stamp
 * happen against Firestore while the token record itself still lives in
 * RTDB (single source of truth for token lookups).
 *
 * Admin only — same rule as the physical route: grooms never self-send.
 *
 * Body: `{ groomUid, guestId }`
 * Returns: `{ token, expiresAt }`.
 */
exports.invitesRouter.post("/digital", auth_1.requireAuth, auth_1.requireAdmin, (0, rateLimit_1.uidRateLimit)("createDigitalInvite", CREATE_INVITE_MAX_PER_HOUR, time_1.HOUR_MS), async (req, res) => {
    const callerUid = req.caller.uid;
    const groomUid = (req.body?.groomUid ?? "").toString();
    const guestId = (req.body?.guestId ?? "").toString();
    if (!groomUid || !guestId) {
        res.status(400).json({ error: "missing_required" });
        return;
    }
    try {
        const fs = (0, firestore_1.getFirestore)();
        const db = (0, database_1.getDatabase)();
        const guestRef = fs.doc(`digitalInvitations/${groomUid}/guests/${guestId}`);
        const invDocRef = fs.doc(`digitalInvitations/${groomUid}`);
        const [guestSnap, invDocSnap] = await Promise.all([
            guestRef.get(),
            invDocRef.get(),
        ]);
        if (!guestSnap.exists) {
            res.status(404).json({ error: "guest_not_found" });
            return;
        }
        const guest = guestSnap.data();
        const parentData = (invDocSnap.exists ? invDocSnap.data() ?? {} : {});
        // Resolve the design this guest receives: their assigned design, else the
        // groom's default. Un-migrated (v1) grooms still hold the single design on
        // the parent doc, so fall back to that.
        const designId = guest?.designId || parentData.defaultDesignId || "";
        let designData;
        if (designId) {
            const dSnap = await fs
                .doc(`digitalInvitations/${groomUid}/designs/${designId}`)
                .get();
            if (!dSnap.exists) {
                res.status(404).json({ error: "design_not_found" });
                return;
            }
            designData = (dSnap.data() ?? {});
        }
        else {
            designData = parentData;
        }
        // Gate: minting requires the (assigned) design to be approved. The admin's
        // Send tab surfaces this as a localized toast.
        if (designData.designStatus !== "approved") {
            res.status(403).json({ error: "design_not_approved" });
            return;
        }
        const groomUsername = await resolveGroomUsername(undefined, groomUid);
        if (!groomUsername) {
            res.status(409).json({ error: "groom_username_unavailable" });
            return;
        }
        // Snapshot the approved design at mint time so later edits never alter
        // invitations already sent. Operational + state-machine + design-doc meta
        // keys are dropped; every other field (timeline, details, toggles, …) is kept.
        const { photographerPublished: _pp, guestRanks: _gr, designStatus: _ds, designSubmittedAt: _dsa, designApprovedAt: _daa, designRejectedAt: _dra, designRejectionNote: _drn, schemaVersion: _sv, defaultDesignId: _ddi, designCount: _dc, title: _ti, order: _or, createdAt: _ca, ...designFields } = designData;
        const designSnapshot = {
            ...designFields,
            brideName: designData.brideName ?? "",
            groomDisplayName: designData.groomDisplayName ?? "",
            weddingDate: designData.weddingDate ?? null,
            themeColor: designData.themeColor ?? "gold",
            fontFamily: designData.fontFamily ?? "amiri",
            media: Array.isArray(designData.media) ? designData.media : [],
            heroMedia: Array.isArray(designData.heroMedia) ? designData.heroMedia : [],
            designVersion: designData.designVersion ?? 1,
        };
        const { token, expiresAt, now } = mintToken();
        await db.ref(`inviteTokens/${token}`).set({
            groomUid,
            groomUsername,
            guestId,
            guestName: clampStr(guest?.name, MAX_GUEST_NAME_LEN),
            guestPhone: clampStr(guest?.phone, MAX_GUEST_PHONE_LEN),
            guestType: "digital",
            createdAt: now,
            expiresAt,
            designId: designId || null,
            designSnapshot,
        });
        await guestRef.update({
            inviteLinkToken: token,
            inviteLinkSentAt: now,
        });
        await (0, audit_1.writeAudit)(callerUid, "createDigitalGuestInvite", {
            groomUid,
            guestId,
        });
        res.json({ token, expiresAt });
    }
    catch (err) {
        res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
});
// ─── POST /invites/digital/submit (PUBLIC) ────────────────────────────────────
/**
 * Public submit for a digital invite. Validates the token, rejects
 * already-used tokens, then patches the Firestore guest doc with
 * status: "attending"|"absent" + optional note + confirmedAt.
 */
exports.invitesRouter.post("/digital/submit", (0, rateLimit_1.ipRateLimit)("digitalInvite", SUBMIT_DIGITAL_MAX_PER_HOUR_IP, time_1.HOUR_MS), async (req, res) => {
    const parsed = parseDigitalSubmitBody(req.body);
    if (!parsed.ok) {
        res.status(400).json({ error: parsed.error, field: parsed.field });
        return;
    }
    const { token, rsvp, note, submittedPhone, companions, mealPreference, songRequest, wish } = parsed.value;
    try {
        const db = (0, database_1.getDatabase)();
        const tokenSnap = await db.ref(`inviteTokens/${token}`).get();
        if (!tokenSnap.exists()) {
            res.status(404).json({ error: "token_not_found" });
            return;
        }
        const tk = tokenSnap.val();
        if (tk.guestType !== "digital") {
            res.status(409).json({ error: "wrong_invite_type" });
            return;
        }
        if (Date.now() > tk.expiresAt) {
            res.status(410).json({ error: "token_expired" });
            return;
        }
        if (tk.usedAt) {
            res.status(409).json({ error: "already_submitted" });
            return;
        }
        const fs = (0, firestore_1.getFirestore)();
        const guestRef = fs.doc(`digitalInvitations/${tk.groomUid}/guests/${tk.guestId}`);
        const guestSnap = await guestRef.get();
        if (!guestSnap.exists) {
            res.status(404).json({ error: "guest_record_missing" });
            return;
        }
        const now = Date.now();
        const patch = {
            status: rsvp,
            confirmedAt: now,
            phone: submittedPhone,
        };
        if (note)
            patch.note = note;
        if (rsvp === "attending") {
            if (companions !== null)
                patch.companions = companions;
            if (mealPreference)
                patch.mealPreference = mealPreference;
            if (songRequest)
                patch.songRequest = songRequest;
        }
        if (wish)
            patch.wish = wish;
        await guestRef.update(patch);
        await db.ref(`inviteTokens/${token}/usedAt`).set(now);
        // Mirror an ATTENDING digital RSVP into RTDB /confirmations so it appears
        // on the admin Confirmations page (with the headcount) exactly like the
        // public form + physical-invite RSVPs. Keyed deterministically per guest
        // so a re-sent invite upserts instead of duplicating. Best-effort: a
        // mirror hiccup must never fail the guest's RSVP (the Firestore patch and
        // token already succeeded).
        try {
            const confRef = db.ref(`confirmations/dg_${tk.guestId}`);
            if (rsvp === "attending") {
                const groomUsername = await resolveGroomUsername(tk.groomUsername, tk.groomUid);
                const guestName = (guestSnap.data()?.name ?? "").toString();
                const record = {
                    groomUid: tk.groomUid,
                    groomUsername,
                    submittedName: guestName,
                    submittedPhone,
                    confirmedAt: now,
                    source: "digital",
                    attachedGuestId: tk.guestId,
                };
                if (companions !== null)
                    record.companions = companions;
                await confRef.set(record);
            }
            else {
                // Declined — drop any prior mirrored confirmation so the page stays
                // attendees-only.
                await confRef.remove();
            }
        }
        catch (mirrorErr) {
            console.error("[invites/digital/submit] confirmations mirror failed", mirrorErr);
        }
        res.json({ ok: true });
    }
    catch (err) {
        res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
});
// ─── POST /invites/digital/wish ────────────────────────────────────────────────
// PUBLIC: a guest submits a guestbook wish ("شاركونا"). Stored as PENDING under
// Firestore digitalInvitations/{groomUid}/wishes; the groom approves it (in the
// design editor) before it shows publicly.
exports.invitesRouter.post("/digital/wish", (0, rateLimit_1.ipRateLimit)("digitalWish", SUBMIT_DIGITAL_MAX_PER_HOUR_IP, time_1.HOUR_MS), async (req, res) => {
    const token = (req.body?.token ?? "").toString();
    if (!tokens_1.TOKEN_HEX_RE.test(token)) {
        res.status(400).json({ error: "invalid_token_format" });
        return;
    }
    const who = clampStr(req.body?.who, 60).trim();
    const what = clampStr(req.body?.what, MAX_WISH_LEN).trim();
    if (!who || !what) {
        res.status(400).json({ error: "missing_required" });
        return;
    }
    try {
        const tk = (await (0, database_1.getDatabase)().ref(`inviteTokens/${token}`).get()).val();
        if (!tk || !tk.groomUid) {
            res.status(404).json({ error: "token_not_found" });
            return;
        }
        if (tk.expiresAt && Date.now() > tk.expiresAt) {
            res.status(410).json({ error: "token_expired" });
            return;
        }
        await (0, firestore_1.getFirestore)().collection(`digitalInvitations/${tk.groomUid}/wishes`).add({
            who, what, status: "pending", guestId: tk.guestId ?? null, submittedAt: Date.now(),
        });
        res.json({ ok: true });
    }
    catch (err) {
        res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
});
// ─── GET /invites/digital/wishes/:token ────────────────────────────────────────
// PUBLIC: the APPROVED guestbook wishes for the token's groom — read live, so an
// approved wish appears on every guest's invitation regardless of their design.
exports.invitesRouter.get("/digital/wishes/:token", async (req, res) => {
    const token = (req.params.token ?? "").toString();
    if (!tokens_1.TOKEN_HEX_RE.test(token)) {
        res.status(400).json({ error: "invalid_token_format" });
        return;
    }
    try {
        const tk = (await (0, database_1.getDatabase)().ref(`inviteTokens/${token}`).get()).val();
        if (!tk || !tk.groomUid) {
            res.json({ wishes: [] });
            return;
        }
        const snap = await (0, firestore_1.getFirestore)()
            .collection(`digitalInvitations/${tk.groomUid}/wishes`)
            .where("status", "==", "approved")
            .get();
        const wishes = snap.docs
            .map((d) => d.data())
            .sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0))
            .map((w) => ({ who: (w.who ?? "").toString(), what: (w.what ?? "").toString() }));
        res.set("Cache-Control", "public, max-age=30");
        res.json({ wishes });
    }
    catch (err) {
        res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
    }
});
/**
 * Mint a new invite token. Returns the token, its expiry, and the
 * creation timestamp (used for both the token record and downstream
 * guest patches to keep timestamps consistent).
 */
function mintToken() {
    const now = Date.now();
    const token = (0, crypto_1.randomBytes)(tokens_1.TOKEN_BYTES).toString("hex");
    const expiresAt = now + tokens_1.TOKEN_TTL_MS;
    return { token, expiresAt, now };
}
/**
 * Resolve a groom's username with a fallback chain:
 *   1. The denormalised value passed in (token record or guest record).
 *   2. /users/{groomUid}/username in RTDB (single source of truth).
 * Returns an empty string when both lookups miss, which callers must
 * treat as a failed-precondition (token rules require length > 0).
 */
async function resolveGroomUsername(denormalised, groomUid) {
    const direct = (denormalised ?? "").toString();
    if (direct.length > 0)
        return direct.slice(0, MAX_GUEST_USERNAME_LEN);
    const u = await (0, database_1.getDatabase)().ref(`users/${groomUid}/username`).get();
    return (u.val() ?? "").toString().slice(0, MAX_GUEST_USERNAME_LEN);
}
/**
 * Validate the public POST /invites/submit body. Mirrors the legacy
 * `submitGuestInvite` onCall validation exactly.
 */
function parsePhysicalSubmitBody(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return { ok: false, error: "invalid_body" };
    }
    const data = body;
    const token = (data.token ?? "").toString();
    if (!tokens_1.TOKEN_HEX_RE.test(token)) {
        return { ok: false, error: "invalid_token_format", field: "token" };
    }
    const submittedName = clampStr(data.submittedName, MAX_NAME_LEN);
    const submittedPhone = clampStr(data.submittedPhone, MAX_PHONE_LEN);
    const submittedCity = clampStr(data.submittedCity, MAX_CITY_LEN);
    const submittedStreet = clampStr(data.submittedStreet, MAX_STREET_LEN);
    const submittedHouse = clampStr(data.submittedHouse, MAX_HOUSE_LEN);
    const deliveryNote = clampStr(data.deliveryNote, MAX_DELIVERY_NOTE_LEN);
    const companions = parseCompanions(data.companions);
    if (companions === false) {
        return { ok: false, error: "invalid_companions", field: "companions" };
    }
    if (!submittedName) {
        return { ok: false, error: "missing_required", field: "submittedName" };
    }
    if (!submittedPhone) {
        return { ok: false, error: "missing_required", field: "submittedPhone" };
    }
    if (!submittedCity) {
        return { ok: false, error: "missing_required", field: "submittedCity" };
    }
    if (!(0, helpers_1.normalisePhone)(submittedPhone)) {
        return { ok: false, error: "invalid_phone", field: "submittedPhone" };
    }
    const hasCoords = (0, helpers_1.isFiniteInRange)(data.lat, MIN_LAT, MAX_LAT) &&
        (0, helpers_1.isFiniteInRange)(data.lng, MIN_LNG, MAX_LNG);
    const lat = hasCoords ? data.lat : null;
    const lng = hasCoords ? data.lng : null;
    const locationAccuracy = (0, helpers_1.isFiniteInRange)(data.locationAccuracy, MIN_ACCURACY_M, MAX_ACCURACY_M)
        ? data.locationAccuracy
        : null;
    const locationSourceRaw = (data.locationSource ?? "").toString();
    const locationSource = locationSourceRaw === "gps" || locationSourceRaw === "manual"
        ? locationSourceRaw
        : hasCoords
            ? "gps"
            : "manual";
    return {
        ok: true,
        value: {
            token,
            submittedName,
            submittedPhone,
            submittedCity,
            submittedStreet,
            submittedHouse,
            deliveryNote,
            companions,
            hasCoords,
            lat,
            lng,
            locationAccuracy,
            locationSource,
        },
    };
}
/**
 * Build the RTDB guest-record patch for a physical invite submission.
 * Sets area/confirmedAt; conditionally sets coords and delivery note.
 *
 * We deliberately do NOT overwrite the guest's name/phone here. Keeping the
 * originally-invited name/phone lets the admin Confirmations tab compare them
 * against what the guest actually entered (submittedName/submittedPhone) and
 * flag a different responder — a changed name shows as a red "name_differs"
 * mismatch, a changed phone fails the phone match and surfaces as "unknown".
 * The admin applies the entered values explicitly via "use guest data" when
 * the response is legitimate.
 */
function buildPhysicalGuestPatch(s, area, now) {
    const patch = {
        area,
        confirmedAt: now,
    };
    if (s.deliveryNote)
        patch.deliveryNote = s.deliveryNote;
    if (s.companions !== null)
        patch.companions = s.companions;
    if (s.hasCoords) {
        patch.lat = s.lat;
        patch.lng = s.lng;
        patch.locationSource = s.locationSource;
        patch.locationUpdatedAt = now;
        if (s.locationAccuracy !== null) {
            patch.locationAccuracy = s.locationAccuracy;
        }
    }
    return patch;
}
/**
 * Build the /confirmations mirror record for a physical invite submission.
 * Includes `attachedGuestId` so the admin UI can render the linked guest
 * row without re-running phone matching.
 */
function buildPhysicalConfirmationRecord(tk, groomUsername, s, now) {
    const record = {
        groomUid: tk.groomUid,
        groomUsername,
        submittedName: s.submittedName,
        submittedPhone: s.submittedPhone,
        submittedCity: s.submittedCity,
        submittedStreet: s.submittedStreet,
        submittedHouse: s.submittedHouse,
        confirmedAt: now,
        attachedGuestId: tk.guestId,
    };
    // Mirror the guest's note-to-driver onto the (immutable) confirmation so the
    // admin always sees it, even after the driver later overwrites the guest
    // record's deliveryNote with their own delivery note.
    if (s.deliveryNote)
        record.deliveryNote = s.deliveryNote;
    if (s.companions !== null)
        record.companions = s.companions;
    if (s.hasCoords) {
        record.lat = s.lat;
        record.lng = s.lng;
        record.locationCapturedAt = now;
        if (s.locationAccuracy !== null) {
            record.locationAccuracy = s.locationAccuracy;
        }
    }
    return record;
}
/**
 * Join city/street/house with the Arabic comma used throughout the app
 * for guest address rendering. Empty parts are dropped so trailing
 * separators don't appear in the rendered address.
 */
function joinAddress(city, street, house) {
    return [city, street, house].filter(Boolean).join(ARABIC_ADDRESS_SEPARATOR);
}
function parseDigitalSubmitBody(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return { ok: false, error: "invalid_body" };
    }
    const data = body;
    const token = (data.token ?? "").toString();
    if (!tokens_1.TOKEN_HEX_RE.test(token)) {
        return { ok: false, error: "invalid_token_format", field: "token" };
    }
    const rsvpRaw = (data.rsvp ?? "").toString();
    if (!RSVP_VALUES.has(rsvpRaw)) {
        return { ok: false, error: "invalid_rsvp", field: "rsvp" };
    }
    const note = clampStr(data.note, MAX_NOTE_LEN);
    // The digital RSVP now collects the guest's own phone (required) — see
    // DigitalInvitationView. Mirror the physical-submit validation.
    const submittedPhone = clampStr(data.submittedPhone, MAX_PHONE_LEN);
    if (!submittedPhone) {
        return { ok: false, error: "missing_required", field: "submittedPhone" };
    }
    if (!(0, helpers_1.normalisePhone)(submittedPhone)) {
        return { ok: false, error: "invalid_phone", field: "submittedPhone" };
    }
    const companions = parseCompanions(data.companions);
    if (companions === false) {
        return { ok: false, error: "invalid_companions", field: "companions" };
    }
    const mealPreference = clampStr(data.mealPreference, MAX_MEAL_PREF_LEN);
    const songRequest = clampStr(data.songRequest, MAX_SONG_REQUEST_LEN);
    const wish = clampStr(data.wish, MAX_WISH_LEN);
    return {
        ok: true,
        value: {
            token,
            rsvp: rsvpRaw,
            note,
            submittedPhone,
            companions,
            mealPreference,
            songRequest,
            wish,
        },
    };
}
/**
 * Parse the optional `companions` count (people attending besides the invited
 * guest). Returns `null` when absent, the clamped integer (0–MAX_COMPANIONS)
 * when valid, or `false` when present-but-invalid (negative / non-numeric).
 */
function parseCompanions(v) {
    if (v === undefined || v === null || v === "")
        return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0)
        return false;
    return Math.min(MAX_COMPANIONS, Math.floor(n));
}
// ─── Utility ──────────────────────────────────────────────────────────────────
function clampStr(v, max) {
    return (typeof v === "string" ? v.trim() : "").slice(0, max);
}
function errorMessage(err) {
    if (err instanceof Error)
        return err.message;
    if (typeof err === "string")
        return err;
    return "unknown";
}
//# sourceMappingURL=invites.js.map