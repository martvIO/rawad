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

import { Router, Request, Response } from "express";
import { getDatabase } from "firebase-admin/database";
import { getFirestore } from "firebase-admin/firestore";
import { randomBytes } from "crypto";
import {
  AuthRequest,
  requireAuth,
  requireAdmin,
} from "../middleware/auth";
import { ipRateLimit, uidRateLimit, tokenRateLimit, keyedRateLimit } from "../middleware/rateLimit";
import { isFiniteInRange, normalisePhone } from "../../helpers";
import { writeAudit } from "../../audit";
import { MAX_LEN } from "../../constants/limits";
import { HOUR_MS } from "../../constants/time";
import { RATE } from "../../constants/rateLimits";
import { TOKEN_BYTES, TOKEN_HEX_RE, TOKEN_TTL_MS } from "../../constants/tokens";
import { ADDRESS_JOINER } from "../../constants/format";
import { loadPassContext, PassResult } from "../../wallet/passData";
import { renderMonogramPng } from "../../wallet/monogram";
import { isGroomFrozen, readGroomStatus } from "../../lifecycle/gate";
import { publicEventState } from "../../lifecycle/status";
import { WhatsAppSendResult } from "../../whatsapp";
import {
  deliverInvite,
  notifyGuestText,
  recordSent,
  recordFailed,
  inviteLocale,
  InviteType,
  InviteLocale,
} from "../../whatsappInvite";

// ─── Constants ────────────────────────────────────────────────────────────────

const CREATE_INVITE_MAX_PER_HOUR = RATE.CREATE_INVITE_PER_USER.limit;
const SUBMIT_PHYSICAL_MAX_PER_HOUR_IP = RATE.SUBMIT_INVITE_PER_IP.limit;
const SUBMIT_DIGITAL_MAX_PER_HOUR_IP = RATE.SUBMIT_DIGITAL_INVITE_PER_IP.limit;

const MAX_GUEST_NAME_LEN = MAX_LEN.NAME;
const MAX_GUEST_PHONE_LEN = MAX_LEN.PHONE;
const MAX_GUEST_USERNAME_LEN = MAX_LEN.USERNAME;
const MAX_NOTE_LEN = MAX_LEN.NOTE;
const MAX_CITY_LEN = MAX_LEN.CITY;
const MAX_STREET_LEN = MAX_LEN.STREET;
const MAX_HOUSE_LEN = MAX_LEN.HOUSE;
const MAX_NAME_LEN = MAX_LEN.NAME;
const MAX_PHONE_LEN = MAX_LEN.PHONE;
const MAX_DELIVERY_NOTE_LEN = MAX_LEN.AREA;
// Free-form WhatsApp message body for the text-fallback send path. Matches the
// adminSettings.messageBody / digitalMessage cap in database.rules.json.
const MAX_INVITE_MESSAGE_LEN = 4000;

const MIN_LAT = -90;
const MAX_LAT = 90;
const MIN_LNG = -180;
const MAX_LNG = 180;
const MIN_ACCURACY_M = 0;
const MAX_ACCURACY_M = 100_000;

const ARABIC_ADDRESS_SEPARATOR = ADDRESS_JOINER;
const RSVP_VALUES = new Set(["attending", "absent"]);
// Extra RSVP fields the luxury digital invitation collects from the guest.
// `companions` = people attending BESIDES the invited guest (0–20, default 0).
const MAX_COMPANIONS = 20;
const MAX_MEAL_PREF_LEN = 40;
const MAX_SONG_REQUEST_LEN = 120;
const MAX_WISH_LEN = 300;
/** Cap guestbook wishes per guest so one token can't flood the moderation queue. */
const MAX_WISHES_PER_GUEST = 5;

export const invitesRouter = Router();

// ─── GET /invites/token/:token ────────────────────────────────────────────────

/**
 * Public read of a token record. Used by the InviteForm page to pre-fill
 * the guest's name/phone and to detect expired/used tokens before showing
 * the form. Returns 404 on missing tokens so the page can render an
 * "invalid invitation" message.
 */
invitesRouter.get(
  "/token/:token",
  // Per-token bucket + per-IP backstop so token existence can't be enumerated
  // by status-code probing (audit: public token-lookup had no limiter).
  keyedRateLimit(
    "inviteLookup",
    (req) => (req.params.token ?? "").toString(),
    RATE.INVITE_LOOKUP_PER_TOKEN.limit,
    HOUR_MS,
    RATE.INVITE_LOOKUP_IP_BACKSTOP.limit,
  ),
  async (req: Request, res: Response) => {
  const { token } = req.params;
  if (!TOKEN_HEX_RE.test(token)) {
    res.status(400).json({ error: "invalid_token_format" });
    return;
  }
  try {
    const snap = await getDatabase().ref(`inviteTokens/${token}`).get();
    if (!snap.exists()) {
      res.status(404).json({ error: "token_not_found" });
      return;
    }
    // Project to only the fields the public forms / invitation page consume.
    // The raw record also holds internal identifiers (groomUid, guestId,
    // createdAt) that no client reads — there is no reason to expose them on an
    // unauthenticated endpoint. Pair this with the RTDB rule `inviteTokens.read:
    // false` so the path can't be read directly either. `res.json` drops any
    // undefined keys, so physical (no guestType/designSnapshot) and digital
    // tokens both serialize correctly.
    const rec = snap.val() as Record<string, unknown>;
    // Derive whether the groom may offer the wallet "boarding pass" — read the
    // groom profile flag (default OFF) so the unauthenticated invitation page
    // knows whether to show the Add-to-Wallet button. Only the derived boolean
    // is exposed, never the raw groom profile. Failures fall back to false.
    let boardingPassEnabled = false;
    if (rec.groomUid) {
      try {
        const flagSnap = await getDatabase()
          .ref(`users/${rec.groomUid}/canUseBoardingPass`)
          .get();
        boardingPassEnabled = flagSnap.val() === true;
      } catch {
        boardingPassEnabled = false;
      }
    }
    // Guest-facing lifecycle state: when the wedding is cancelled/postponed the
    // invitation page shows the notice instead of the RSVP form. `active` for a
    // healthy wedding, so existing invites are unaffected.
    const eventStatus = rec.groomUid
      ? publicEventState(await readGroomStatus(rec.groomUid as string))
      : "active";
    res.json({
      guestName: rec.guestName,
      guestPhone: rec.guestPhone,
      guestType: rec.guestType,
      groomUsername: rec.groomUsername,
      expiresAt: rec.expiresAt,
      usedAt: rec.usedAt,
      designId: rec.designId,
      designSnapshot: rec.designSnapshot,
      boardingPassEnabled,
      eventStatus,
    });
  } catch (err) {
    res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
  }
});

// ─── Wallet passes (Apple .pkpass + Google Wallet) ─────────────────────────────
//
// Public + token-gated. The guest's invitation page shows the Add-to-Wallet
// button only when the admin enabled `canUseBoardingPass` for the groom; these
// endpoints ALSO enforce that flag server-side (via loadPassContext → 403). Each
// platform degrades independently: until its signing secrets are configured the
// endpoint returns 503 *_unconfigured and the frontend simply omits that button.

/** Map a loadPassContext failure to a JSON error response. */
function sendPassError(res: Response, r: Extract<PassResult, { ok: false }>): void {
  res.status(r.status).json({ error: r.error });
}

// Themed monogram PNG — used as the Google Wallet logo (Google fetches it
// server-side) and, later, the Apple .pkpass images. Stable per design → cached.
invitesRouter.get(
  "/pass/:token/logo.png",
  ipRateLimit("walletPass", SUBMIT_DIGITAL_MAX_PER_HOUR_IP, HOUR_MS),
  async (req: Request, res: Response) => {
    try {
      const r = await loadPassContext(req.params.token, req.query.lang);
      if (!r.ok) { sendPassError(res, r); return; }
      const png = await renderMonogramPng(r.ctx.design, 660);
      res.set("Content-Type", "image/png");
      res.set("Cache-Control", "public, max-age=86400");
      res.send(png);
    } catch (err) {
      res.status(500).json({ error: "pass_failed", detail: errorMessage(err) });
    }
  },
);

// Apple Wallet .pkpass — Phase 2 (needs APPLE_PASS_* signing secrets + the
// buildApplePass() builder). Enforces token + flag now; 503 until configured.
invitesRouter.get(
  "/pass/:token/apple",
  ipRateLimit("walletPass", SUBMIT_DIGITAL_MAX_PER_HOUR_IP, HOUR_MS),
  async (req: Request, res: Response) => {
    try {
      const r = await loadPassContext(req.params.token, req.query.lang);
      if (!r.ok) { sendPassError(res, r); return; }
      res.status(503).json({ error: "apple_unconfigured" });
    } catch (err) {
      res.status(500).json({ error: "pass_failed", detail: errorMessage(err) });
    }
  },
);

// Google Wallet save link — Phase 1 (needs GOOGLE_WALLET_* secrets + the
// buildGoogleSaveUrl() signer). Enforces token + flag now; 503 until configured.
invitesRouter.get(
  "/pass/:token/google",
  ipRateLimit("walletPass", SUBMIT_DIGITAL_MAX_PER_HOUR_IP, HOUR_MS),
  async (req: Request, res: Response) => {
    try {
      const r = await loadPassContext(req.params.token, req.query.lang);
      if (!r.ok) { sendPassError(res, r); return; }
      res.status(503).json({ error: "google_unconfigured" });
    } catch (err) {
      res.status(500).json({ error: "pass_failed", detail: errorMessage(err) });
    }
  },
);

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
invitesRouter.post(
  "/",
  requireAuth,
  requireAdmin,
  uidRateLimit("createInvite", CREATE_INVITE_MAX_PER_HOUR, HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    const callerUid = req.caller!.uid;

    const groomUid = (req.body?.groomUid ?? "").toString();
    const guestId = (req.body?.guestId ?? "").toString();
    if (!groomUid || !guestId) {
      res.status(400).json({ error: "missing_required" });
      return;
    }

    try {
      const db = getDatabase();
      const guestSnap = await db
        .ref(`guestsByGroom/${groomUid}/${guestId}`)
        .get();
      if (!guestSnap.exists()) {
        res.status(404).json({ error: "guest_not_found" });
        return;
      }
      const guest = guestSnap.val() as {
        name?: string;
        phone?: string;
        groomUsername?: string;
      } | null;

      const groomUsername = await resolveGroomUsername(
        guest?.groomUsername,
        groomUid
      );
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
      await writeAudit(callerUid, "createGuestInvite", { groomUid, guestId });

      // Opt-in auto-send over WhatsApp (admin Send tab). Physical guests carry
      // no locale → Arabic. Failures here never undo the mint above.
      let send: WhatsAppSendResult | undefined;
      if (req.body?.deliver === "whatsapp") {
        send = await autoSendInvite({
          type: "physical",
          groomUid,
          guestId,
          groomUsername,
          token,
          phone: guest?.phone,
          guestName: guest?.name,
          locale: "ar",
          messageBody: clampStr(req.body?.messageBody, MAX_INVITE_MESSAGE_LEN),
          stampGuest: (patch) => db.ref(`guestsByGroom/${groomUid}/${guestId}`).update(patch),
        });
      }

      res.json({ token, expiresAt, ...(send ? { send } : {}) });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
  }
);

// ─── POST /invites/submit (physical, PUBLIC) ──────────────────────────────────

/**
 * Public submit for a physical invite. Validates the token, patches the
 * RTDB guest record, AND mirrors a row into /confirmations so the Admin
 * Confirmations tab shows the reply alongside the public form submissions.
 *
 * Marks the token `usedAt` to prevent re-submission.
 */
invitesRouter.post(
  "/submit",
  ipRateLimit("invite", SUBMIT_PHYSICAL_MAX_PER_HOUR_IP, HOUR_MS),
  async (req: Request, res: Response) => {
    const parsed = parsePhysicalSubmitBody(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error, field: parsed.field });
      return;
    }
    const submission = parsed.value;

    try {
      const db = getDatabase();
      const tokenRef = db.ref(`inviteTokens/${submission.token}`);
      const tokenSnap = await tokenRef.get();
      if (!tokenSnap.exists()) {
        res.status(404).json({ error: "token_not_found" });
        return;
      }
      const tk = tokenSnap.val() as TokenRecord;
      const now = Date.now();
      if (now > tk.expiresAt) {
        res.status(410).json({ error: "token_expired" });
        return;
      }
      // One-shot guard: a physical invite may be submitted only once. The
      // digital handler enforces this; the physical one historically did not,
      // so a leaked/forwarded token could be replayed for its full 90-day TTL —
      // each replay pushed a fresh /confirmations row and re-patched the guest
      // record. Fast-path the obvious replay here; the transaction below is the
      // authoritative guard against a concurrent double-submit.
      if (tk.usedAt) {
        res.status(409).json({ error: "already_submitted" });
        return;
      }
      // Freeze: a cancelled / postponed wedding rejects new RSVPs.
      if (await isGroomFrozen(tk.groomUid)) {
        res.status(403).json({ error: "event_unavailable" });
        return;
      }

      const guestRef = db.ref(`guestsByGroom/${tk.groomUid}/${tk.guestId}`);
      const guestSnap = await guestRef.get();
      if (!guestSnap.exists()) {
        res.status(404).json({ error: "guest_record_missing" });
        return;
      }

      // Atomically claim the token so two concurrent submits can't both pass
      // the check above and double-write. The transaction sets `usedAt` only
      // while it is still unset; a non-committed result means we lost the race.
      const claim = await tokenRef
        .child("usedAt")
        .transaction((cur) => (cur ? undefined : now));
      if (!claim.committed) {
        res.status(409).json({ error: "already_submitted" });
        return;
      }

      try {
        const area = joinAddress(
          submission.submittedCity,
          submission.submittedStreet,
          submission.submittedHouse
        );
        const guestPatch = buildPhysicalGuestPatch(submission, area, now);
        // The guest's own submission is authoritative for their location. A pin /
        // GPS already overwrites lat/lng above. If instead they entered a NEW
        // address WITHOUT a pin, drop any stale coordinates (e.g. a pin the groom
        // set earlier) so the map reflects the address the guest actually entered
        // (geocoded) rather than the old location.
        if (!submission.hasCoords) {
          const cur = guestSnap.val() as { area?: string; lat?: unknown } | null;
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

        const groomUsername = await resolveGroomUsername(
          tk.groomUsername,
          tk.groomUid
        );
        const confRecord = buildPhysicalConfirmationRecord(
          tk,
          groomUsername,
          submission,
          now
        );
        await db.ref("confirmations").push(confRecord);

        res.json({ ok: true });
      } catch (err) {
        // Roll back the claim so a transient write failure doesn't permanently
        // burn the guest's one-shot token.
        await tokenRef.child("usedAt").set(null).catch(() => undefined);
        throw err;
      }
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
  }
);

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
invitesRouter.post(
  "/digital",
  requireAuth,
  requireAdmin,
  uidRateLimit("createDigitalInvite", CREATE_INVITE_MAX_PER_HOUR, HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    const callerUid = req.caller!.uid;

    const groomUid = (req.body?.groomUid ?? "").toString();
    const guestId = (req.body?.guestId ?? "").toString();
    if (!groomUid || !guestId) {
      res.status(400).json({ error: "missing_required" });
      return;
    }

    try {
      const fs = getFirestore();
      const db = getDatabase();
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
      const guest = guestSnap.data() as
        | { name?: string; phone?: string; designId?: string; locale?: string }
        | undefined;
      const parentData = (invDocSnap.exists ? invDocSnap.data() ?? {} : {}) as Record<string, unknown>;

      // Resolve the design this guest receives: their assigned design, else the
      // groom's default. Un-migrated (v1) grooms still hold the single design on
      // the parent doc, so fall back to that.
      const designId =
        (guest?.designId as string) || (parentData.defaultDesignId as string) || "";
      let designData: Record<string, unknown>;
      if (designId) {
        const dSnap = await fs
          .doc(`digitalInvitations/${groomUid}/designs/${designId}`)
          .get();
        if (!dSnap.exists) {
          res.status(404).json({ error: "design_not_found" });
          return;
        }
        designData = (dSnap.data() ?? {}) as Record<string, unknown>;
      } else {
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
      const {
        photographerPublished: _pp,
        guestRanks: _gr,
        designStatus: _ds,
        designSubmittedAt: _dsa,
        designApprovedAt: _daa,
        designRejectedAt: _dra,
        designRejectionNote: _drn,
        schemaVersion: _sv,
        defaultDesignId: _ddi,
        designCount: _dc,
        title: _ti,
        order: _or,
        createdAt: _ca,
        ...designFields
      } = designData;
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
      await writeAudit(callerUid, "createDigitalGuestInvite", {
        groomUid,
        guestId,
      });

      // Opt-in auto-send over WhatsApp (admin Send tab). Locale = the language
      // the guest opened their invite in (stamped on first open); default ar.
      let send: WhatsAppSendResult | undefined;
      if (req.body?.deliver === "whatsapp") {
        send = await autoSendInvite({
          type: "digital",
          groomUid,
          guestId,
          groomUsername,
          token,
          phone: guest?.phone,
          guestName: guest?.name,
          locale: inviteLocale(guest?.locale),
          messageBody: clampStr(req.body?.messageBody, MAX_INVITE_MESSAGE_LEN),
          stampGuest: (patch) => guestRef.update(patch),
        });
      }

      res.json({ token, expiresAt, ...(send ? { send } : {}) });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
  }
);

// ─── POST /invites/notify ─────────────────────────────────────────────────────
//
// Admin-only free-form WhatsApp text to a DIGITAL guest with NO link — backs the
// "بدون تصميم / ללא עיצוב" (message only) Send-tab option that used to open a
// wa.me tab. Free-form text only delivers inside the 24h customer-service window
// (Meta rule), so this is a best-effort nudge, not a guaranteed business-initiated
// send. No-op (returns { send:{ ok:false, error:"not_configured" } }) until
// WhatsApp is configured, which the client treats as "fall back to wa.me".
//
// Body: `{ groomUid, guestId, message }`. Returns: `{ send: { ok, id?, error? } }`.
invitesRouter.post(
  "/notify",
  requireAuth,
  requireAdmin,
  uidRateLimit("notifyGuest", CREATE_INVITE_MAX_PER_HOUR, HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    const groomUid = (req.body?.groomUid ?? "").toString();
    const guestId = (req.body?.guestId ?? "").toString();
    const message = clampStr(req.body?.message, MAX_INVITE_MESSAGE_LEN);
    if (!groomUid || !guestId) {
      res.status(400).json({ error: "missing_required" });
      return;
    }
    try {
      const guestSnap = await getFirestore()
        .doc(`digitalInvitations/${groomUid}/guests/${guestId}`)
        .get();
      if (!guestSnap.exists) {
        res.status(404).json({ error: "guest_not_found" });
        return;
      }
      const phone = (guestSnap.data() as { phone?: string } | undefined)?.phone;
      const send = await notifyGuestText(phone, message);
      res.json({ send });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
  }
);

// ─── POST /invites/digital/submit (PUBLIC) ────────────────────────────────────

/**
 * Public submit for a digital invite. Validates the token, rejects
 * already-used tokens, then patches the Firestore guest doc with
 * status: "attending"|"absent" + optional note + confirmedAt.
 */
invitesRouter.post(
  "/digital/submit",
  ipRateLimit("digitalInvite", SUBMIT_DIGITAL_MAX_PER_HOUR_IP, HOUR_MS),
  async (req: Request, res: Response) => {
    const parsed = parseDigitalSubmitBody(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error, field: parsed.field });
      return;
    }
    const { token, rsvp, note, submittedPhone, companions, mealPreference, songRequest, wish } =
      parsed.value;

    try {
      const db = getDatabase();
      const tokenSnap = await db.ref(`inviteTokens/${token}`).get();
      if (!tokenSnap.exists()) {
        res.status(404).json({ error: "token_not_found" });
        return;
      }
      const tk = tokenSnap.val() as TokenRecord;
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
      // Freeze: a cancelled / postponed wedding rejects new RSVPs.
      if (await isGroomFrozen(tk.groomUid)) {
        res.status(403).json({ error: "event_unavailable" });
        return;
      }

      const fs = getFirestore();
      const guestRef = fs.doc(
        `digitalInvitations/${tk.groomUid}/guests/${tk.guestId}`
      );
      const guestSnap = await guestRef.get();
      if (!guestSnap.exists) {
        res.status(404).json({ error: "guest_record_missing" });
        return;
      }

      const now = Date.now();
      const patch: Record<string, unknown> = {
        status: rsvp,
        confirmedAt: now,
        phone: submittedPhone,
      };
      if (note) patch.note = note;
      if (rsvp === "attending") {
        if (companions !== null) patch.companions = companions;
        if (mealPreference) patch.mealPreference = mealPreference;
        if (songRequest) patch.songRequest = songRequest;
      }
      if (wish) patch.wish = wish;
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
          const record: Record<string, unknown> = {
            groomUid: tk.groomUid,
            groomUsername,
            submittedName: guestName,
            submittedPhone,
            confirmedAt: now,
            source: "digital",
            attachedGuestId: tk.guestId,
          };
          if (companions !== null) record.companions = companions;
          await confRef.set(record);
        } else {
          // Declined — drop any prior mirrored confirmation so the page stays
          // attendees-only.
          await confRef.remove();
        }
      } catch (mirrorErr) {
        console.error("[invites/digital/submit] confirmations mirror failed", mirrorErr);
      }

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
  }
);

// ─── POST /invites/digital/opened ──────────────────────────────────────────────
// PUBLIC: fire-and-forget "the guest opened their digital invite" ping. Stamps a
// first-party viewedAt (first open only) + the language they opened in (locale,
// used to localize the RSVP reminder) on the Firestore guest doc. First-party so
// it needs no cookie/consent banner, and (unlike the OG-preview function) it is
// triggered by the real browser, not WhatsApp link-preview crawlers. Best-effort:
// it never blocks or fails the invite page.
invitesRouter.post(
  "/digital/opened",
  tokenRateLimit(
    "inviteOpened",
    RATE.INVITE_OPEN_PER_TOKEN.limit,
    HOUR_MS,
    RATE.INVITE_OPEN_IP_BACKSTOP.limit,
  ),
  async (req: Request, res: Response) => {
    const token = (req.body?.token ?? "").toString();
    const lang = req.body?.lang === "he" ? "he" : "ar";
    if (!TOKEN_HEX_RE.test(token)) {
      res.status(400).json({ error: "invalid_token_format" });
      return;
    }
    try {
      const db = getDatabase();
      const tokenSnap = await db.ref(`inviteTokens/${token}`).get();
      if (!tokenSnap.exists()) {
        res.status(404).json({ error: "token_not_found" });
        return;
      }
      const tk = tokenSnap.val() as TokenRecord;
      if (tk.guestType !== "digital") {
        res.status(409).json({ error: "wrong_invite_type" });
        return;
      }
      const fs = getFirestore();
      const guestRef = fs.doc(`digitalInvitations/${tk.groomUid}/guests/${tk.guestId}`);
      const snap = await guestRef.get();
      if (snap.exists) {
        const patch: Record<string, unknown> = { locale: lang };
        if (!snap.data()?.viewedAt) patch.viewedAt = Date.now();
        await guestRef.update(patch);
      }
      res.json({ ok: true });
    } catch (err) {
      // Analytics signal only — degrade silently, never surface to the guest page.
      res.json({ ok: false, detail: errorMessage(err) });
    }
  }
);

// ─── POST /invites/digital/wish ────────────────────────────────────────────────
// PUBLIC: a guest submits a guestbook wish ("شاركونا"). Stored as PENDING under
// Firestore digitalInvitations/{groomUid}/wishes; the groom approves it (in the
// design editor) before it shows publicly.
invitesRouter.post(
  "/digital/wish",
  ipRateLimit("digitalWish", SUBMIT_DIGITAL_MAX_PER_HOUR_IP, HOUR_MS),
  async (req: Request, res: Response) => {
    const token = (req.body?.token ?? "").toString();
    if (!TOKEN_HEX_RE.test(token)) { res.status(400).json({ error: "invalid_token_format" }); return; }
    const who = clampStr(req.body?.who, 60).trim();
    const what = clampStr(req.body?.what, MAX_WISH_LEN).trim();
    if (!who || !what) { res.status(400).json({ error: "missing_required" }); return; }
    try {
      const tk = (await getDatabase().ref(`inviteTokens/${token}`).get()).val() as
        | { groomUid?: string; expiresAt?: number; guestId?: string } | null;
      if (!tk || !tk.groomUid) { res.status(404).json({ error: "token_not_found" }); return; }
      if (tk.expiresAt && Date.now() > tk.expiresAt) { res.status(410).json({ error: "token_expired" }); return; }
      const wishesCol = getFirestore().collection(`digitalInvitations/${tk.groomUid}/wishes`);
      // Cap wishes per guest so a single token can't flood the groom's pending
      // moderation queue (the per-IP limit alone is weak — see rate-limit notes).
      if (tk.guestId) {
        const existing = await wishesCol.where("guestId", "==", tk.guestId).count().get();
        if (existing.data().count >= MAX_WISHES_PER_GUEST) {
          res.status(429).json({ error: "wish_limit_reached" });
          return;
        }
      }
      await wishesCol.add({
        who, what, status: "pending", guestId: tk.guestId ?? null, submittedAt: Date.now(),
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
  }
);

// ─── GET /invites/digital/wishes/:token ────────────────────────────────────────
// PUBLIC: the APPROVED guestbook wishes for the token's groom — read live, so an
// approved wish appears on every guest's invitation regardless of their design.
invitesRouter.get(
  "/digital/wishes/:token",
  keyedRateLimit(
    "wishesRead",
    (req) => (req.params.token ?? "").toString(),
    RATE.WISHES_READ_PER_TOKEN.limit,
    HOUR_MS,
    RATE.WISHES_READ_IP_BACKSTOP.limit,
  ),
  async (req: Request, res: Response) => {
    const token = (req.params.token ?? "").toString();
    if (!TOKEN_HEX_RE.test(token)) { res.status(400).json({ error: "invalid_token_format" }); return; }
    try {
      const tk = (await getDatabase().ref(`inviteTokens/${token}`).get()).val() as { groomUid?: string } | null;
      if (!tk || !tk.groomUid) { res.json({ wishes: [] }); return; }
      const snap = await getFirestore()
        .collection(`digitalInvitations/${tk.groomUid}/wishes`)
        .where("status", "==", "approved")
        .get();
      const wishes = snap.docs
        .map((d) => d.data() as { who?: string; what?: string; submittedAt?: number })
        .sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0))
        .map((w) => ({ who: (w.who ?? "").toString(), what: (w.what ?? "").toString() }));
      res.set("Cache-Control", "public, max-age=30");
      res.json({ wishes });
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
    }
  }
);

// ─── Token helpers ────────────────────────────────────────────────────────────

interface TokenRecord {
  groomUid: string;
  groomUsername?: string;
  guestId: string;
  guestType?: string;
  expiresAt: number;
  usedAt?: number;
}

/**
 * Mint a new invite token. Returns the token, its expiry, and the
 * creation timestamp (used for both the token record and downstream
 * guest patches to keep timestamps consistent).
 */
function mintToken(): { token: string; expiresAt: number; now: number } {
  const now = Date.now();
  const token = randomBytes(TOKEN_BYTES).toString("hex");
  const expiresAt = now + TOKEN_TTL_MS;
  return { token, expiresAt, now };
}

/**
 * Auto-deliver a freshly-minted invite over WhatsApp (opt-in via `deliver:
 * "whatsapp"`). Stamps the guest record with the send status and indexes the
 * message id for delivery/read tracking. Returns the send result so the route
 * can echo it to the admin UI; the frontend falls back to opening a wa.me tab
 * when WhatsApp isn't configured yet ("not_configured"). Never throws — a send
 * failure must not undo a successful mint.
 */
async function autoSendInvite(params: {
  type: InviteType;
  groomUid: string;
  guestId: string;
  groomUsername: string;
  token: string;
  phone: string | undefined;
  guestName: string | undefined;
  locale: InviteLocale;
  messageBody: string;
  stampGuest: (patch: Record<string, unknown>) => Promise<unknown>;
}): Promise<WhatsAppSendResult> {
  const send = await deliverInvite({
    type: params.type,
    locale: params.locale,
    phone: params.phone,
    guestName: params.guestName,
    groomUsername: params.groomUsername,
    token: params.token,
    messageBody: params.messageBody,
  });
  if (send.ok && send.id) {
    await recordSent(
      { groomUid: params.groomUid, guestId: params.guestId, type: params.type },
      send.id,
      params.stampGuest,
    );
  } else if (!send.ok && send.error !== "not_configured") {
    // "not_configured" is the dormant pre-Meta state — the client falls back to
    // a wa.me tab, so don't brand the guest's send as failed.
    await recordFailed(params.stampGuest, send.error);
  }
  return send;
}

/**
 * Resolve a groom's username with a fallback chain:
 *   1. The denormalised value passed in (token record or guest record).
 *   2. /users/{groomUid}/username in RTDB (single source of truth).
 * Returns an empty string when both lookups miss, which callers must
 * treat as a failed-precondition (token rules require length > 0).
 */
async function resolveGroomUsername(
  denormalised: string | undefined,
  groomUid: string
): Promise<string> {
  const direct = (denormalised ?? "").toString();
  if (direct.length > 0) return direct.slice(0, MAX_GUEST_USERNAME_LEN);
  const u = await getDatabase().ref(`users/${groomUid}/username`).get();
  return (u.val() ?? "").toString().slice(0, MAX_GUEST_USERNAME_LEN);
}

// ─── Physical-submit helpers ──────────────────────────────────────────────────

type ParsedPhysical = {
  token: string;
  submittedName: string;
  submittedPhone: string;
  submittedCity: string;
  submittedStreet: string;
  submittedHouse: string;
  deliveryNote: string;
  companions: number | null;
  hasCoords: boolean;
  lat: number | null;
  lng: number | null;
  locationAccuracy: number | null;
  locationSource: "gps" | "manual";
};

type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; field?: string };

/**
 * Validate the public POST /invites/submit body. Mirrors the legacy
 * `submitGuestInvite` onCall validation exactly.
 */
function parsePhysicalSubmitBody(body: unknown): ParseResult<ParsedPhysical> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }
  const data = body as Record<string, unknown>;

  const token = (data.token ?? "").toString();
  if (!TOKEN_HEX_RE.test(token)) {
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
  if (!normalisePhone(submittedPhone)) {
    return { ok: false, error: "invalid_phone", field: "submittedPhone" };
  }

  const hasCoords =
    isFiniteInRange(data.lat, MIN_LAT, MAX_LAT) &&
    isFiniteInRange(data.lng, MIN_LNG, MAX_LNG);
  const lat = hasCoords ? (data.lat as number) : null;
  const lng = hasCoords ? (data.lng as number) : null;
  const locationAccuracy = isFiniteInRange(
    data.locationAccuracy,
    MIN_ACCURACY_M,
    MAX_ACCURACY_M
  )
    ? (data.locationAccuracy as number)
    : null;
  const locationSourceRaw = (data.locationSource ?? "").toString();
  const locationSource: "gps" | "manual" =
    locationSourceRaw === "gps" || locationSourceRaw === "manual"
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
function buildPhysicalGuestPatch(
  s: ParsedPhysical,
  area: string,
  now: number
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    area,
    confirmedAt: now,
  };
  if (s.deliveryNote) patch.deliveryNote = s.deliveryNote;
  if (s.companions !== null) patch.companions = s.companions;
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
function buildPhysicalConfirmationRecord(
  tk: TokenRecord,
  groomUsername: string,
  s: ParsedPhysical,
  now: number
): Record<string, unknown> {
  const record: Record<string, unknown> = {
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
  if (s.deliveryNote) record.deliveryNote = s.deliveryNote;
  if (s.companions !== null) record.companions = s.companions;
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
function joinAddress(city: string, street: string, house: string): string {
  return [city, street, house].filter(Boolean).join(ARABIC_ADDRESS_SEPARATOR);
}

// ─── Digital-submit helpers ───────────────────────────────────────────────────

type ParsedDigital = {
  token: string;
  rsvp: "attending" | "absent";
  note: string;
  submittedPhone: string;
  companions: number | null;
  mealPreference: string;
  songRequest: string;
  wish: string;
};

function parseDigitalSubmitBody(body: unknown): ParseResult<ParsedDigital> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }
  const data = body as Record<string, unknown>;
  const token = (data.token ?? "").toString();
  if (!TOKEN_HEX_RE.test(token)) {
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
  if (!normalisePhone(submittedPhone)) {
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
      rsvp: rsvpRaw as "attending" | "absent",
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
function parseCompanions(v: unknown): number | null | false {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return false;
  return Math.min(MAX_COMPANIONS, Math.floor(n));
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function clampStr(v: unknown, max: number): string {
  return (typeof v === "string" ? v.trim() : "").slice(0, max);
}

function errorMessage(err: unknown): string | undefined {
  // Public/admin 5xx responses must not echo raw error text in production — it
  // can leak Firestore paths / GCS bucket names. Suppressed by default; set
  // DAWA_DEBUG_ERRORS=1 (e.g. functions/.env.local) to see detail locally.
  if (process.env.DAWA_DEBUG_ERRORS !== "1") return undefined;
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "unknown";
}
