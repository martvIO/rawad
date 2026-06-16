"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitGuestInvite = exports.createGuestInvite = void 0;
// Per-guest invite-link callables.
//
//   createGuestInvite — admin generates a random 32-char token bound to one
//     guest. Writes /inviteTokens/{token} (90-day TTL) and stamps the guest
//     record with inviteLinkToken + inviteLinkSentAt. The admin Send tab then
//     opens WhatsApp with the resulting /invite/{token} URL. Sending invite
//     links is admin-only — grooms manage the list but never self-send.
//
//   submitGuestInvite — public/unauthenticated callable. The guest opens the
//     link, fills in city/location/note, and submits. We look up the token,
//     reject if expired, then patch the guest record directly (area, lat/lng,
//     deliveryNote) and mark the token used. No "admin attach" step needed.
const https_1 = require("firebase-functions/v2/https");
const database_1 = require("firebase-admin/database");
const crypto_1 = require("crypto");
const rateLimit_1 = require("./rateLimit");
const audit_1 = require("./audit");
const helpers_1 = require("./helpers");
const limits_1 = require("./constants/limits");
const rateLimits_1 = require("./constants/rateLimits");
const tokens_1 = require("./constants/tokens");
const format_1 = require("./constants/format");
function clampStr(v, max) {
    return (typeof v === "string" ? v.trim() : "").slice(0, max);
}
// Admin → mint a new token for a specific guest under a groom.
// Returns { token } so the client can build the /invite/{token} URL.
exports.createGuestInvite = (0, https_1.onCall)({ enforceAppCheck: false }, async (req) => {
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Sign in required.");
    const callerUid = req.auth.uid;
    if ((0, helpers_1.getClaims)(req).role !== "admin") {
        throw new https_1.HttpsError("permission-denied", "Admins only.");
    }
    // Per-caller rate limit — see RATE.CREATE_INVITE_PER_USER.
    if (!(0, rateLimit_1.allow)(`createInvite:${callerUid}`, rateLimits_1.RATE.CREATE_INVITE_PER_USER.limit, rateLimits_1.RATE.CREATE_INVITE_PER_USER.windowMs)) {
        throw new https_1.HttpsError("resource-exhausted", "Too many invites; please slow down.");
    }
    const data = req.data ?? {};
    const groomUid = (data.groomUid ?? "").toString();
    const guestId = (data.guestId ?? "").toString();
    if (!groomUid || !guestId) {
        throw new https_1.HttpsError("invalid-argument", "groomUid and guestId are required.");
    }
    const db = (0, database_1.getDatabase)();
    const guestSnap = await db.ref(`guestsByGroom/${groomUid}/${guestId}`).get();
    if (!guestSnap.exists()) {
        throw new https_1.HttpsError("not-found", "Guest not found.");
    }
    const guest = guestSnap.val();
    // Resolve groomUsername — denormalised on most guest records, but fall
    // back to /users/{uid}/username if missing so the invite page can show it.
    let groomUsername = (guest?.groomUsername ?? "").toString();
    if (!groomUsername) {
        const u = await db.ref(`users/${groomUid}/username`).get();
        groomUsername = (u.val() ?? "").toString();
    }
    if (!groomUsername) {
        throw new https_1.HttpsError("failed-precondition", "Groom username unavailable.");
    }
    const now = Date.now();
    const token = (0, crypto_1.randomBytes)(tokens_1.TOKEN_BYTES).toString("hex"); // 32 hex chars, 128 bits
    const expiresAt = now + tokens_1.TOKEN_TTL_MS;
    await db.ref(`inviteTokens/${token}`).set({
        groomUid,
        groomUsername,
        guestId,
        guestName: (guest?.name ?? "").toString().slice(0, limits_1.MAX_LEN.NAME),
        guestPhone: (guest?.phone ?? "").toString().slice(0, limits_1.MAX_LEN.PHONE),
        createdAt: now,
        expiresAt,
    });
    await db.ref(`guestsByGroom/${groomUid}/${guestId}`).update({
        inviteLinkToken: token,
        inviteLinkSentAt: now,
    });
    await (0, audit_1.writeAudit)(callerUid, "createGuestInvite", { groomUid, guestId });
    return { token, expiresAt };
});
// Public callable — the guest submits their details via the invite link.
// Validates the token, then patches the guest record with the new fields.
exports.submitGuestInvite = (0, https_1.onCall)({ enforceAppCheck: false }, async (req) => {
    const ip = (req.rawRequest?.ip ?? "unknown").toString();
    if (!(0, rateLimit_1.allow)(`invite:${ip}`, rateLimits_1.RATE.SUBMIT_INVITE_PER_IP.limit, rateLimits_1.RATE.SUBMIT_INVITE_PER_IP.windowMs)) {
        throw new https_1.HttpsError("resource-exhausted", "Too many submissions; please try again later.");
    }
    const data = req.data ?? {};
    const token = (data.token ?? "").toString();
    if (!tokens_1.TOKEN_HEX_RE.test(token)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid token.");
    }
    const db = (0, database_1.getDatabase)();
    const tokenSnap = await db.ref(`inviteTokens/${token}`).get();
    if (!tokenSnap.exists()) {
        throw new https_1.HttpsError("not-found", "Invite link not found.");
    }
    const tk = tokenSnap.val();
    if (Date.now() > tk.expiresAt) {
        throw new https_1.HttpsError("deadline-exceeded", "Invite link expired.");
    }
    const submittedName = clampStr(data.submittedName, limits_1.MAX_LEN.NAME);
    const submittedPhone = clampStr(data.submittedPhone, limits_1.MAX_LEN.PHONE);
    const submittedCity = clampStr(data.submittedCity, limits_1.MAX_LEN.CITY);
    const submittedStreet = clampStr(data.submittedStreet, limits_1.MAX_LEN.STREET);
    const submittedHouse = clampStr(data.submittedHouse, limits_1.MAX_LEN.HOUSE);
    const deliveryNote = clampStr(data.deliveryNote, limits_1.MAX_LEN.AREA);
    if (!submittedName || !submittedPhone || !submittedCity) {
        throw new https_1.HttpsError("invalid-argument", "Name, phone and city are required.");
    }
    if (!(0, helpers_1.normalisePhone)(submittedPhone)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid phone number.");
    }
    const hasCoords = (0, helpers_1.isFiniteInRange)(data.lat, -90, 90) && (0, helpers_1.isFiniteInRange)(data.lng, -180, 180);
    const lat = hasCoords ? data.lat : null;
    const lng = hasCoords ? data.lng : null;
    const locationAccuracy = (0, helpers_1.isFiniteInRange)(data.locationAccuracy, 0, 100000)
        ? data.locationAccuracy : null;
    const locationSourceRaw = (data.locationSource ?? "").toString();
    const locationSource = locationSourceRaw === "gps" || locationSourceRaw === "manual"
        ? locationSourceRaw : (hasCoords ? "gps" : "manual");
    // Build the human-readable address. Uses Arabic comma "، " to match the
    // rest of the app's joined-address conventions (see useConfirmationData).
    const area = [submittedCity, submittedStreet, submittedHouse]
        .filter(Boolean)
        .join(format_1.ADDRESS_JOINER);
    const guestRef = db.ref(`guestsByGroom/${tk.groomUid}/${tk.guestId}`);
    const guestSnap = await guestRef.get();
    if (!guestSnap.exists()) {
        throw new https_1.HttpsError("not-found", "Guest record missing.");
    }
    const now = Date.now();
    const guestPatch = {
        name: submittedName,
        phone: submittedPhone,
        area,
        confirmedAt: now,
    };
    if (deliveryNote)
        guestPatch.deliveryNote = deliveryNote;
    if (hasCoords) {
        guestPatch.lat = lat;
        guestPatch.lng = lng;
        guestPatch.locationSource = locationSource;
        guestPatch.locationUpdatedAt = now;
        if (locationAccuracy !== null)
            guestPatch.locationAccuracy = locationAccuracy;
    }
    await guestRef.update(guestPatch);
    // Mirror into /confirmations so the Admin Confirmations tab shows this
    // reply alongside ones submitted via the public /confirm/{groomUsername}
    // form. groomUsername is denormalised on the token; fall back to a users
    // lookup for older tokens that pre-date that field.
    let groomUsername = (tk.groomUsername ?? "").toString();
    if (!groomUsername) {
        const u = await db.ref(`users/${tk.groomUid}/username`).get();
        groomUsername = (u.val() ?? "").toString();
    }
    const confRecord = {
        groomUid: tk.groomUid,
        groomUsername,
        submittedName,
        submittedPhone,
        submittedCity,
        submittedStreet,
        submittedHouse,
        confirmedAt: now,
        attachedGuestId: tk.guestId,
    };
    if (hasCoords) {
        confRecord.lat = lat;
        confRecord.lng = lng;
        confRecord.locationCapturedAt = now;
        if (locationAccuracy !== null)
            confRecord.locationAccuracy = locationAccuracy;
    }
    await db.ref("confirmations").push(confRecord);
    await db.ref(`inviteTokens/${token}/usedAt`).set(now);
    return { ok: true };
});
//# sourceMappingURL=invite.js.map