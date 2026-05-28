// Per-guest invite-link endpoints (physical + digital).
//
// Replaces four onCall functions and a public RTDB read:
//   POST /invites                 groom/admin (60/hr): mint physical invite
//   POST /invites/submit          PUBLIC (5/hr/IP):    submit physical reply
//   POST /invites/digital         groom/admin (60/hr): mint digital invite
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
  requireAnyRole,
} from "../middleware/auth";
import { ipRateLimit, uidRateLimit } from "../middleware/rateLimit";
import { isFiniteInRange, normalisePhone } from "../../helpers";
import { writeAudit } from "../../audit";
import { MAX_LEN } from "../../constants/limits";
import { HOUR_MS } from "../../constants/time";
import { RATE } from "../../constants/rateLimits";
import { TOKEN_BYTES, TOKEN_HEX_RE, TOKEN_TTL_MS } from "../../constants/tokens";
import { ADDRESS_JOINER } from "../../constants/format";

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

const MIN_LAT = -90;
const MAX_LAT = 90;
const MIN_LNG = -180;
const MAX_LNG = 180;
const MIN_ACCURACY_M = 0;
const MAX_ACCURACY_M = 100_000;

const ARABIC_ADDRESS_SEPARATOR = ADDRESS_JOINER;
const RSVP_VALUES = new Set(["attending", "absent"]);

export const invitesRouter = Router();

// ─── GET /invites/token/:token ────────────────────────────────────────────────

/**
 * Public read of a token record. Used by the InviteForm page to pre-fill
 * the guest's name/phone and to detect expired/used tokens before showing
 * the form. Returns 404 on missing tokens so the page can render an
 * "invalid invitation" message.
 */
invitesRouter.get("/token/:token", async (req: Request, res: Response) => {
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
    res.json(snap.val());
  } catch (err) {
    res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
  }
});

// ─── POST /invites (physical) ─────────────────────────────────────────────────

/**
 * Mint a physical-invite token for a specific guest under a groom. Allowed
 * for groom (own guests only) and admin (any groom). Stamps the guest
 * record with `inviteLinkToken` + `inviteLinkSentAt` so the groom's UI can
 * show the "sent" pill.
 *
 * Body: `{ groomUid, guestId }`
 * Returns: `{ token, expiresAt }`.
 */
invitesRouter.post(
  "/",
  requireAuth,
  requireAnyRole("admin", "groom"),
  uidRateLimit("createInvite", CREATE_INVITE_MAX_PER_HOUR, HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    const callerUid = req.caller!.uid;
    const role = req.caller!.claims.role;

    const groomUid = (req.body?.groomUid ?? "").toString();
    const guestId = (req.body?.guestId ?? "").toString();
    if (!groomUid || !guestId) {
      res.status(400).json({ error: "missing_required" });
      return;
    }
    if (role === "groom" && groomUid !== callerUid) {
      res.status(403).json({ error: "groom_can_only_invite_own_guests" });
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

      res.json({ token, expiresAt });
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
      const tokenSnap = await db.ref(`inviteTokens/${submission.token}`).get();
      if (!tokenSnap.exists()) {
        res.status(404).json({ error: "token_not_found" });
        return;
      }
      const tk = tokenSnap.val() as TokenRecord;
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
      const area = joinAddress(
        submission.submittedCity,
        submission.submittedStreet,
        submission.submittedHouse
      );
      const guestPatch = buildPhysicalGuestPatch(submission, area, now);
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
      await db.ref(`inviteTokens/${submission.token}/usedAt`).set(now);

      res.json({ ok: true });
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
 * Body: `{ groomUid, guestId }`
 * Returns: `{ token, expiresAt }`.
 */
invitesRouter.post(
  "/digital",
  requireAuth,
  requireAnyRole("admin", "groom"),
  uidRateLimit("createDigitalInvite", CREATE_INVITE_MAX_PER_HOUR, HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    const callerUid = req.caller!.uid;
    const role = req.caller!.claims.role;

    const groomUid = (req.body?.groomUid ?? "").toString();
    const guestId = (req.body?.guestId ?? "").toString();
    if (!groomUid || !guestId) {
      res.status(400).json({ error: "missing_required" });
      return;
    }
    if (role === "groom" && groomUid !== callerUid) {
      res.status(403).json({ error: "groom_can_only_invite_own_guests" });
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
      // Gate: minting requires an approved design. The admin's Send tab
      // surfaces this as a localized toast.
      const invData = invDocSnap.exists ? invDocSnap.data() ?? {} : {};
      if (invData.designStatus !== "approved") {
        res.status(403).json({ error: "design_not_approved" });
        return;
      }
      const guest = guestSnap.data() as
        | { name?: string; phone?: string }
        | undefined;

      const groomUsername = await resolveGroomUsername(undefined, groomUid);
      if (!groomUsername) {
        res.status(409).json({ error: "groom_username_unavailable" });
        return;
      }

      // Snapshot the approved design at mint time so later groom edits
      // never alter invitations already sent to guests.
      const designSnapshot = {
        brideName: invData.brideName ?? "",
        groomDisplayName: invData.groomDisplayName ?? "",
        weddingDate: invData.weddingDate ?? null,
        venue: invData.venue ?? "",
        venueAddress: invData.venueAddress ?? "",
        customMessage: invData.customMessage ?? "",
        themeColor: invData.themeColor ?? "gold",
        fontFamily: invData.fontFamily ?? "amiri",
        media: Array.isArray(invData.media) ? invData.media : [],
        designVersion: invData.designVersion ?? 1,
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

      res.json({ token, expiresAt });
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
    const { token, rsvp, note } = parsed.value;

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
      };
      if (note) patch.note = note;
      await guestRef.update(patch);
      await db.ref(`inviteTokens/${token}/usedAt`).set(now);

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
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
 * Always sets name/phone/area/confirmedAt; conditionally sets coords
 * and delivery note based on what the guest provided.
 */
function buildPhysicalGuestPatch(
  s: ParsedPhysical,
  area: string,
  now: number
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    name: s.submittedName,
    phone: s.submittedPhone,
    area,
    confirmedAt: now,
  };
  if (s.deliveryNote) patch.deliveryNote = s.deliveryNote;
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
  return {
    ok: true,
    value: {
      token,
      rsvp: rsvpRaw as "attending" | "absent",
      note,
    },
  };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function clampStr(v: unknown, max: number): string {
  return (typeof v === "string" ? v.trim() : "").slice(0, max);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "unknown";
}
