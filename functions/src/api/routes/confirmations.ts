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
import { getDatabase } from "firebase-admin/database";
import { AuthRequest, requireAuth, requireAdmin } from "../middleware/auth";
import { ipRateLimit, uidRateLimit } from "../middleware/rateLimit";
import {
  isUsername,
  normalisePhone,
  normalisePhoneForMatching,
  isFiniteInRange,
} from "../../helpers";

// ─── Schema constants (mirror database.rules.json /confirmations) ─────────────

const MAX_NAME_LEN = 120;
const MAX_PHONE_LEN = 30;
const MAX_CITY_LEN = 80;
const MAX_STREET_LEN = 120;
const MAX_HOUSE_LEN = 20;
const MAX_ATTACHED_GUEST_ID_LEN = 64;

const MIN_LAT = -90;
const MAX_LAT = 90;
const MIN_LNG = -180;
const MAX_LNG = 180;
const MIN_ACCURACY_M = 0;
const MAX_ACCURACY_M = 100_000;

const HOUR_MS = 60 * 60 * 1000;
const SUBMIT_MAX_PER_HOUR = 5;
const ATTACH_MAX_PER_HOUR = 30;

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
      const snap = await getDatabase().ref("confirmations").get();
      const out: ConfirmationRecord[] = [];
      snap.forEach((c) => {
        const id = c.key;
        if (!id) return;
        out.push({ id, ...(c.val() as Record<string, unknown>) });
      });
      res.json(out);
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
      const ref = getDatabase().ref(`confirmations/${id}`);
      const existing = await ref.get();
      if (!existing.exists()) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await ref.update(sanitized.value);
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
 *      a matching normalized phone, stamp `confirmedAt` (+ coords if the
 *      guest had none) and record `attachedGuestId` on the confirmation.
 *      Auto-attach failure is logged but never fails the submission.
 *
 * Returns `{ ok: true, id, attachedGuestId: string | null }`.
 */
confirmationsRouter.post(
  "/",
  ipRateLimit("confirm", SUBMIT_MAX_PER_HOUR, HOUR_MS),
  async (req, res) => {
    const parsed = parseSubmitBody(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error, field: parsed.field });
      return;
    }
    const submission = parsed.value;

    try {
      const db = getDatabase();
      const groomUidSnap = await db
        .ref(`usernameIndex/${submission.groomUsername}`)
        .get();
      if (!groomUidSnap.exists()) {
        res.status(404).json({ error: "unknown_groom" });
        return;
      }
      const groomUid = groomUidSnap.val() as string;

      const confRef = db.ref("confirmations").push();
      await confRef.set(buildConfirmationRecord(groomUid, submission));

      const attachedGuestId = await tryAutoAttach(groomUid, submission);
      if (attachedGuestId) {
        await confRef.update({ attachedGuestId });
      }

      res.json({ ok: true, id: confRef.key, attachedGuestId });
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

    try {
      const db = getDatabase();
      const confSnap = await db.ref(`confirmations/${confirmationId}`).get();
      if (!confSnap.exists()) {
        res.status(404).json({ error: "confirmation_not_found" });
        return;
      }
      const conf = confSnap.val() as {
        groomUid?: string;
        lat?: unknown;
        lng?: unknown;
        locationAccuracy?: unknown;
      };
      if (!conf?.groomUid) {
        res.status(409).json({ error: "confirmation_has_no_groom" });
        return;
      }
      if (typeof conf.lat !== "number" || typeof conf.lng !== "number") {
        res.status(409).json({ error: "confirmation_has_no_location" });
        return;
      }

      const guestRef = db.ref(`guestsByGroom/${conf.groomUid}/${guestId}`);
      const guestSnap = await guestRef.get();
      if (!guestSnap.exists()) {
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
      await guestRef.update(guestPatch);
      await db
        .ref(`confirmations/${confirmationId}`)
        .update({ attachedGuestId: guestId });

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
 *   - Stamp `confirmedAt` on the guest.
 *   - If submission has coords AND guest had none, copy lat/lng + accuracy
 *     and mark `locationSource: "gps"`.
 */
async function tryAutoAttach(
  groomUid: string,
  s: ParsedSubmit
): Promise<string | null> {
  try {
    const target = normalisePhoneForMatching(s.submittedPhone);
    if (!target) return null;

    const db = getDatabase();
    const guestsSnap = await db.ref(`guestsByGroom/${groomUid}`).get();
    const matches: string[] = [];
    guestsSnap.forEach((g) => {
      const v = g.val() as { phone?: string } | null;
      if (v && normalisePhoneForMatching(v.phone ?? "") === target) {
        if (g.key) matches.push(g.key);
      }
      return false;
    });
    if (matches.length !== 1) return null;

    const guestId = matches[0];
    const guestVal = guestsSnap.child(guestId).val() as { lat?: unknown } | null;
    const now = Date.now();
    const guestPatch: Record<string, unknown> = { confirmedAt: now };
    if (s.hasCoords && guestVal && typeof guestVal.lat !== "number") {
      guestPatch.lat = s.lat;
      guestPatch.lng = s.lng;
      guestPatch.locationSource = "gps";
      guestPatch.locationUpdatedAt = now;
      if (s.locationAccuracy !== null) {
        guestPatch.locationAccuracy = s.locationAccuracy;
      }
    }
    await db.ref(`guestsByGroom/${groomUid}/${guestId}`).update(guestPatch);
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
      hasCoords,
      lat,
      lng,
      locationAccuracy,
    },
  };
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

interface ConfirmationRecord extends Record<string, unknown> {
  id: string;
}

/**
 * Best-effort error-to-string conversion for JSON error responses.
 * Never returns a stack trace; we only surface the human-readable text.
 */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "unknown";
}
