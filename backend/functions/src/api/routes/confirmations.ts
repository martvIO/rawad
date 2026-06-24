// Guest-confirmation endpoints.
//
// Replaces two onCall Cloud Functions and exposes admin read/edit endpoints
// that used to be direct RTDB subscriptions from the admin client:
//
//   GET    /confirmations               admin: list all records
//   PATCH  /confirmations/:id           admin: edit a confirmation row
//   POST   /confirmations               PUBLIC (5/hr/IP): guest submits
//   POST   /confirmations/attach-location  admin (30/hr): manual attach
//
// Authorization mirrors `database.rules.json` /confirmations:
//   - `.read`  admin-only at the collection level
//   - `.write` admin-only AND only when `data.exists()` (no admin inserts)
//   - All new rows enter via POST / (server-only via the Admin SDK).
//
// What this file does NOT do:
//   - It does not stream / subscribe — the client polls REST for updates.
//   - It does not recompute groomUsername on PATCH; clients pass the new
//     submittedName/phone/address, but groomUid/groomUsername stay immutable.

import { Router, Response } from "express";
import { AuthRequest, requireAuth, requireAdmin } from "../middleware/auth";
import { uidRateLimit, keyedRateLimit } from "../middleware/rateLimit";
import {
  isUsername,
  normalisePhone,
  normalisePhoneForMatching,
  isFiniteInRange,
} from "../../helpers";
import { MAX_LEN } from "../../constants/limits";
import { HOUR_MS } from "../../constants/time";
import { RATE } from "../../constants/rateLimits";
import { firebaseConfirmationStore } from "../../domain/confirmations/firebaseConfirmationStore";
import { firebaseGuestStore } from "../../domain/guests/firebaseGuestStore";
import { firebaseUserIndex } from "../../domain/users/firebaseUserIndex";

// ─── Schema constants (mirror database.rules.json /confirmations) ─────────────

const MAX_NAME_LEN = MAX_LEN.NAME;
const MAX_PHONE_LEN = MAX_LEN.PHONE;
const MAX_CITY_LEN = MAX_LEN.CITY;
const MAX_STREET_LEN = MAX_LEN.STREET;
const MAX_HOUSE_LEN = MAX_LEN.HOUSE;
const MAX_ATTACHED_GUEST_ID_LEN = 64;
// `companions` = people attending besides the invited guest (0–20, default 0).
const MAX_COMPANIONS = 20;

const MIN_LAT = -90;
const MAX_LAT = 90;
const MIN_LNG = -180;
const MAX_LNG = 180;
const MIN_ACCURACY_M = 0;
const MAX_ACCURACY_M = 100_000;

const CONFIRM_PER_GROOM = RATE.CONFIRM_PER_GROOM.limit;
const CONFIRM_IP_BACKSTOP = RATE.CONFIRM_IP_BACKSTOP.limit;
const ATTACH_MAX_PER_HOUR = RATE.ATTACH_LOC_PER_ADMIN.limit;

const MIN_NAME_WORDS = 2;

/** Fields the admin PATCH endpoint may set. Mirrors the schema's $other:false. */
const KNOWN_PATCH_FIELDS = new Set([
  "submittedName",
  "submittedPhone",
  "submittedCity",
  "submittedStreet",
  "submittedHouse",
  "lat",
  "lng",
  "locationAccuracy",
  "locationCapturedAt",
  "attachedGuestId",
]);

export const confirmationsRouter = Router();

// ─── GET /confirmations ───────────────────────────────────────────────────────

/**
 * List every confirmation record (admin only). Returns a flat array
 * `[{ id, ...record }, ...]`. This replaces the RTDB `onValue` subscription
 * that `AdminConfirmationsTab` previously used.
 */
confirmationsRouter.get(
  "/",
  requireAuth,
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      res.json(await firebaseConfirmationStore().listAll());
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
    }
  }
);

// ─── PATCH /confirmations/:id ─────────────────────────────────────────────────

/**
 * Admin-only edit of an existing confirmation. RTDB rules forbid creating
 * new rows here (`data.exists()` predicate), so this handler verifies the
 * record exists before applying the patch.
 *
 * Only the fields in `KNOWN_PATCH_FIELDS` are accepted; unknown keys are
 * silently dropped, matching the `$other: false` schema rule.
 */
confirmationsRouter.patch(
  "/:id",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const sanitized = sanitizeConfirmationPatch(req.body);
    if (!sanitized.ok) {
      res.status(400).json({ error: sanitized.error, field: sanitized.field });
      return;
    }
    if (Object.keys(sanitized.value).length === 0) {
      res.status(400).json({ error: "empty_patch" });
      return;
    }
    try {
      const store = firebaseConfirmationStore();
      const existing = await store.get(id);
      if (!existing) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await store.patch(id, sanitized.value);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
  }
);

// ─── POST /confirmations (PUBLIC) ─────────────────────────────────────────────

/**
 * Public guest-confirmation endpoint. Unauthenticated by design — the guest
 * has no portal account. Abuse-gated by per-IP rate limit (5/hr) which is
 * the sole protection on this endpoint (App Check was retired project-wide).
 *
 * Behavior:
 *   1. Validate body (name 2+ words, phone normalizable, city present).
 *   2. Resolve groomUid via `/usernameIndex/{groomUsername}`.
 *   3. Push a new `/confirmations/{id}` record.
 *   4. Best-effort auto-attach: if exactly one guest under this groom has
 *      a matching normalized phone, stamp `confirmedAt` (+ `companions` when
 *      provided) on that guest and record `attachedGuestId` on the confirmation.
 *      Location is NOT written here — coordinates are only ever copied onto a
 *      guest via the admin-gated POST /confirmations/attach-location. Auto-attach
 *      failure is logged but never fails the submission.
 *
 * Returns `{ ok: true, id, attachedGuestId: string | null }`.
 */
confirmationsRouter.post(
  "/",
  // Key by target groom (not IP): a wedding venue NATs hundreds of guests behind
  // one IP, so an IP-only cap would 429 the party after the 5th confirmation.
  keyedRateLimit(
    "confirm",
    (req) => (req.body?.groomUsername ?? "").toString().trim().toLowerCase(),
    CONFIRM_PER_GROOM,
    HOUR_MS,
    CONFIRM_IP_BACKSTOP,
  ),
  async (req, res) => {
    const parsed = parseSubmitBody(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error, field: parsed.field });
      return;
    }
    const submission = parsed.value;

    try {
      const groomUid = await firebaseUserIndex().resolveUidByUsername(
        submission.groomUsername
      );
      if (!groomUid) {
        res.status(404).json({ error: "unknown_groom" });
        return;
      }

      const store = firebaseConfirmationStore();
      const created = await store.create(
        buildConfirmationRecord(groomUid, submission)
      );

      const attachedGuestId = await tryAutoAttach(groomUid, submission);
      if (attachedGuestId) {
        await store.patch(created.id, { attachedGuestId });
      }

      res.json({ ok: true, id: created.id, attachedGuestId });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
  }
);

// ─── POST /confirmations/attach-location (ADMIN) ──────────────────────────────

/**
 * Admin manual-attach. Used when auto-attach couldn't decide (ambiguous
 * phone match or no match at all) and the admin picks the correct guest
 * from the confirmations panel.
 *
 * Copies the confirmation's lat/lng/accuracy onto the target guest record
 * and stamps `attachedGuestId` on the confirmation. Both writes succeed or
 * both fail — a partial failure surfaces as 500 and leaves the prior state.
 *
 * Returns `{ ok: true, attachedGuestId }` on success.
 */
confirmationsRouter.post(
  "/attach-location",
  requireAuth,
  requireAdmin,
  uidRateLimit("attach", ATTACH_MAX_PER_HOUR, HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    const confirmationId = (req.body?.confirmationId ?? "").toString();
    const guestId = (req.body?.guestId ?? "").toString();
    if (!confirmationId || !guestId) {
      res.status(400).json({ error: "missing_required" });
      return;
    }
    // Validate the path-segment IDs before interpolating them into RTDB refs.
    // RTDB keys forbid `. # $ [ ] /` (the Admin SDK throws on them, surfacing as
    // a confusing 500), so constrain to the push-key charset and bound the
    // length to the same 64 chars the PATCH sanitizer enforces for
    // attachedGuestId. Returns a clean 400 instead of a 500 on bad input.
    const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
    if (!ID_RE.test(confirmationId) || !ID_RE.test(guestId)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    try {
      const confStore = firebaseConfirmationStore();
      const conf = await confStore.get(confirmationId);
      if (!conf) {
        res.status(404).json({ error: "confirmation_not_found" });
        return;
      }
      const groomUid = conf.groomUid;
      if (typeof groomUid !== "string" || !groomUid) {
        res.status(409).json({ error: "confirmation_has_no_groom" });
        return;
      }
      if (typeof conf.lat !== "number" || typeof conf.lng !== "number") {
        res.status(409).json({ error: "confirmation_has_no_location" });
        return;
      }

      const guestStore = firebaseGuestStore();
      const guest = await guestStore.get(groomUid, guestId);
      if (!guest) {
        res.status(404).json({ error: "guest_not_found" });
        return;
      }

      const guestPatch: Record<string, unknown> = {
        lat: conf.lat,
        lng: conf.lng,
        locationSource: "gps",
        locationUpdatedAt: Date.now(),
      };
      if (typeof conf.locationAccuracy === "number") {
        guestPatch.locationAccuracy = conf.locationAccuracy;
      }
      await guestStore.patch(groomUid, guestId, guestPatch);
      await confStore.patch(confirmationId, { attachedGuestId: guestId });

      res.json({ ok: true, attachedGuestId: guestId });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
  }
);

// ─── Submission helpers ───────────────────────────────────────────────────────

/**
 * Build the `/confirmations/{id}` record from the parsed submission.
 * Always sets the four schema-required fields plus the address triplet
 * (legacy behavior writes empty strings rather than omitting them).
 * GPS fields are included only when both lat AND lng were present.
 */
function buildConfirmationRecord(
  groomUid: string,
  s: ParsedSubmit
): Record<string, unknown> {
  const now = Date.now();
  const record: Record<string, unknown> = {
    groomUid,
    groomUsername: s.groomUsername,
    submittedName: s.submittedName,
    submittedPhone: s.submittedPhone,
    submittedCity: s.submittedCity,
    submittedStreet: s.submittedStreet,
    submittedHouse: s.submittedHouse,
    confirmedAt: now,
  };
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
 * Best-effort auto-attach: find the single guest under this groom whose
 * normalized phone matches the submission. Returns the matched guestId,
 * or `null` if zero/multiple matches or any error occurs. Never throws —
 * a failure here must not fail the confirmation write itself.
 *
 * Side effects on a single match:
 *   - Stamp `confirmedAt` (and `companions`) on the guest.
 *
 * Deliberately does NOT write map coordinates onto the guest record. This is
 * an UNAUTHENTICATED path (the only "secret" is the guest's phone, and the
 * groomUsername is semi-public), so letting it mutate a guest's GPS pin would
 * let anyone who guesses a phone drop a location on someone else's guest. The
 * submitted coords are still preserved on the immutable /confirmations record
 * for admin review, and the admin can apply them via POST
 * /confirmations/attach-location. The token-authenticated InviteForm path
 * (POST /invites/submit) is gated by possession of the per-guest token and
 * still sets coordinates directly.
 */
async function tryAutoAttach(
  groomUid: string,
  s: ParsedSubmit
): Promise<string | null> {
  try {
    const target = normalisePhoneForMatching(s.submittedPhone);
    if (!target) return null;

    const guestStore = firebaseGuestStore();
    const guests = await guestStore.listByGroom(groomUid);
    const matches = guests.filter((g) => {
      const phone = typeof g.phone === "string" ? g.phone : "";
      return normalisePhoneForMatching(phone) === target;
    });
    if (matches.length !== 1) return null;

    const guestId = matches[0].id;
    const now = Date.now();
    const guestPatch: Record<string, unknown> = { confirmedAt: now };
    if (s.companions !== null) guestPatch.companions = s.companions;
    await guestStore.patch(groomUid, guestId, guestPatch);
    return guestId;
  } catch (err) {
    // NOTE: Auto-attach is best-effort; surface to logs but never propagate.
    // eslint-disable-next-line no-console
    console.warn("[confirmations] auto-attach failed", err);
    return null;
  }
}

// ─── Submit-body validation ───────────────────────────────────────────────────

type ParsedSubmit = {
  groomUsername: string;
  submittedName: string;
  submittedPhone: string;
  submittedCity: string;
  submittedStreet: string;
  submittedHouse: string;
  companions: number | null;
  hasCoords: boolean;
  lat: number | null;
  lng: number | null;
  locationAccuracy: number | null;
};

type ParseResult =
  | { ok: true; value: ParsedSubmit }
  | { ok: false; error: string; field?: string };

/**
 * Validate and normalize the public POST body. Returns a typed
 * `ParsedSubmit` on success or an error code (always JSON-safe).
 */
function parseSubmitBody(body: unknown): ParseResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }
  const data = body as Record<string, unknown>;

  const groomUsername = (data.groomUsername ?? "").toString().toLowerCase();
  if (!isUsername(groomUsername)) {
    return { ok: false, error: "invalid_groom", field: "groomUsername" };
  }

  const submittedName = clampStr(data.submittedName, MAX_NAME_LEN);
  const submittedPhone = clampStr(data.submittedPhone, MAX_PHONE_LEN);
  const submittedCity = clampStr(data.submittedCity, MAX_CITY_LEN);
  const submittedStreet = clampStr(data.submittedStreet, MAX_STREET_LEN);
  const submittedHouse = clampStr(data.submittedHouse, MAX_HOUSE_LEN);

  if (!submittedName) {
    return { ok: false, error: "missing_required", field: "submittedName" };
  }
  if (!submittedPhone) {
    return { ok: false, error: "missing_required", field: "submittedPhone" };
  }
  if (!submittedCity) {
    return { ok: false, error: "missing_required", field: "submittedCity" };
  }
  const wordCount = submittedName.split(/\s+/).filter(Boolean).length;
  if (wordCount < MIN_NAME_WORDS) {
    return { ok: false, error: "name_must_be_full", field: "submittedName" };
  }
  if (!normalisePhone(submittedPhone)) {
    return { ok: false, error: "invalid_phone", field: "submittedPhone" };
  }

  const companions = parseCompanions(data.companions);
  if (companions === false) {
    return { ok: false, error: "invalid_companions", field: "companions" };
  }

  // GPS is all-or-nothing: both lat AND lng must be valid finite numbers in
  // range. Half-set coords (lat without lng) are silently dropped — matches
  // the legacy onCall behavior.
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

  return {
    ok: true,
    value: {
      groomUsername,
      submittedName,
      submittedPhone,
      submittedCity,
      submittedStreet,
      submittedHouse,
      companions,
      hasCoords,
      lat,
      lng,
      locationAccuracy,
    },
  };
}

/**
 * Parse the optional `companions` count (people attending besides the invited
 * guest). Returns `null` when absent, the clamped integer (0–MAX_COMPANIONS)
 * when valid, or `false` when present-but-invalid.
 */
function parseCompanions(v: unknown): number | null | false {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return false;
  return Math.min(MAX_COMPANIONS, Math.floor(n));
}

// ─── PATCH validation ─────────────────────────────────────────────────────────

type SanitizedPatch =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string; field?: string };

/**
 * Validate the admin PATCH body. Drops unknown keys silently, returns
 * field-level errors for malformed values. An empty (post-filter) patch
 * is allowed to reach the handler — the caller decides whether to reject.
 */
function sanitizeConfirmationPatch(body: unknown): SanitizedPatch {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }
  const input = body as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const key of Object.keys(input)) {
    if (!KNOWN_PATCH_FIELDS.has(key)) continue;
    const value = input[key];
    if (value === undefined) continue;

    const v = validatePatchField(key, value);
    if (!v.ok) return v;
    out[key] = v.value;
  }
  return { ok: true, value: out };
}

type PatchField =
  | { ok: true; value: unknown }
  | { ok: false; error: string; field: string };

/**
 * Per-field validator for the admin PATCH. Length / range / type rules
 * are a mirror of the `.validate` clauses in `database.rules.json`.
 */
function validatePatchField(key: string, value: unknown): PatchField {
  switch (key) {
    case "submittedName":
      if (
        typeof value !== "string" ||
        value.length === 0 ||
        value.length > MAX_NAME_LEN
      ) {
        return { ok: false, error: "invalid_name", field: key };
      }
      return { ok: true, value };
    case "submittedPhone":
      if (
        typeof value !== "string" ||
        value.length === 0 ||
        value.length > MAX_PHONE_LEN
      ) {
        return { ok: false, error: "invalid_phone", field: key };
      }
      return { ok: true, value };
    case "submittedCity":
      if (typeof value !== "string" || value.length > MAX_CITY_LEN) {
        return { ok: false, error: "too_long", field: key };
      }
      return { ok: true, value };
    case "submittedStreet":
      if (typeof value !== "string" || value.length > MAX_STREET_LEN) {
        return { ok: false, error: "too_long", field: key };
      }
      return { ok: true, value };
    case "submittedHouse":
      if (typeof value !== "string" || value.length > MAX_HOUSE_LEN) {
        return { ok: false, error: "too_long", field: key };
      }
      return { ok: true, value };
    case "lat":
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < MIN_LAT ||
        value > MAX_LAT
      ) {
        return { ok: false, error: "invalid_lat", field: key };
      }
      return { ok: true, value };
    case "lng":
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < MIN_LNG ||
        value > MAX_LNG
      ) {
        return { ok: false, error: "invalid_lng", field: key };
      }
      return { ok: true, value };
    case "locationAccuracy":
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < MIN_ACCURACY_M ||
        value > MAX_ACCURACY_M
      ) {
        return { ok: false, error: "invalid_accuracy", field: key };
      }
      return { ok: true, value };
    case "locationCapturedAt":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return { ok: false, error: "invalid_timestamp", field: key };
      }
      return { ok: true, value };
    case "attachedGuestId":
      if (
        typeof value !== "string" ||
        value.length > MAX_ATTACHED_GUEST_ID_LEN
      ) {
        return { ok: false, error: "invalid_attached_guest_id", field: key };
      }
      return { ok: true, value };
    default:
      // Unreachable because `KNOWN_PATCH_FIELDS` gates entry; keeps the
      // switch exhaustive for future field additions.
      return { ok: true, value };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Trim a (possibly non-string) input then clamp to `max` characters.
 * Non-string inputs become the empty string, which downstream validators
 * surface as `missing_required` errors when the field is required.
 */
function clampStr(v: unknown, max: number): string {
  return (typeof v === "string" ? v.trim() : "").slice(0, max);
}

// errorMessage (suppress-by-default 5xx detail) is now shared — see ../errorDetail.
import { errorMessage } from "../errorDetail";
