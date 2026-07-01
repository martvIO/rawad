// Guest CRUD under /guestsByGroom/{groomUid}/*.
//
// Mirrors the legacy `src/services/guests.js` SDK calls and the access model
// from `database.rules.json` (the Admin SDK bypasses rules, so each handler
// MUST enforce authz explicitly).
//
//   GET    /guests                       admin: flat list of all guests
//   GET    /guests/:groomUid             admin / owning groom / assigned driver
//   POST   /guests/:groomUid             admin / owning groom         (drivers cannot create)
//   PATCH  /guests/:groomUid/:guestId    admin / owning groom / assigned driver
//   DELETE /guests/:groomUid/:guestId    admin / owning groom         (drivers cannot delete)
//
// Validation echoes the RTDB schema rules (required name/phone/status/inviteType
// on insert; strict allowlists on enum fields). Unknown keys are stripped to
// keep RTDB clean, matching the `.validate: false` $other rule.

import { Router, Response } from "express";
import { AuthRequest, requireAuth } from "../middleware/auth";
import { uidRateLimit } from "../middleware/rateLimit";
import { MAX_LEN } from "../../constants/limits";
import { HOUR_MS } from "../../constants/time";
import { RATE } from "../../constants/rateLimits";
import { isUsername } from "../../helpers";
import { firebaseGuestStore } from "../../domain/guests/firebaseGuestStore";
import { sendDomainError } from "../../domain/httpError";

// ─── Schema constants (mirror database.rules.json) ────────────────────────────

const MAX_NAME_LEN = MAX_LEN.NAME;
const MAX_PHONE_LEN = MAX_LEN.PHONE;
const MAX_AREA_LEN = MAX_LEN.AREA;
const MAX_GROOM_USERNAME_LEN = MAX_LEN.GROOM_USERNAME;
const MAX_PROOF_PATH_LEN = MAX_LEN.PATH;
const MAX_INVITE_TOKEN_LEN = 64;
const MAX_DELIVERED_BY_LEN = MAX_LEN.NAME;
/** ISO-8601 timestamps are ~30 chars; 64 is a safe upper bound. */
const MAX_DELIVERED_AT_LEN = 64;

const ALLOWED_STATUS = new Set([
  "pending", "enroute", "delivered",
  // Non-delivery outcomes a driver can record (Phase 6).
  "no_answer", "wrong_address", "refused",
]);
const ALLOWED_INVITE_TYPE = new Set(["premium", "vip"]);
const ALLOWED_LOCATION_SOURCE = new Set(["gps", "manual"]);

// Whitelist of fields a client may send. Anything outside this set is silently
// dropped (defense in depth — the legacy code never wrote anything else).
const KNOWN_FIELDS = new Set([
  "groomUsername",
  "name",
  "phone",
  "area",
  "status",
  "inviteType",
  "proofPhotoPath",
  "deliveredAt",
  "deliveredBy",
  "deliveryNote",
  "createdAt",
  "lat",
  "lng",
  "locationAccuracy",
  "locationSource",
  "locationUpdatedAt",
  "inviteLinkToken",
  "inviteLinkSentAt",
  "confirmedAt",
]);

export const guestsRouter = Router();

// The guest domain raises no DomainError (field validation lives in the route's
// sanitizeGuest), so this {code → status} table is empty: every store failure is
// an infra error that falls through to each handler's 500 fallback slug via
// sendDomainError — byte-identical output to the pre-extraction handlers.
const GUEST_STATUS: Record<string, number> = {};

// ─── GET /guests ──────────────────────────────────────────────────────────────

/**
 * Admin-only flat list of every guest across every groom.
 * Each item shape: `{ id, groomUid, ...guestFields }`.
 */
guestsRouter.get("/", requireAuth, uidRateLimit("guestsListAll", RATE.GUESTS_READ_PER_USER.limit, HOUR_MS), async (req: AuthRequest, res: Response) => {
  if (req.caller!.claims.role !== "admin") {
    res.status(403).json({ error: "admins_only" });
    return;
  }
  try {
    res.json(await firebaseGuestStore().listAll());
  } catch (err) {
    sendDomainError(res, err, GUEST_STATUS, "read_failed");
  }
});

// ─── GET /guests/:groomUid ────────────────────────────────────────────────────

/**
 * List one groom's guests. Authorized for:
 *   - admins (any groomUid)
 *   - the groom themselves (req.caller.uid === groomUid)
 *   - drivers with `assignedGrooms[groomUid] === true` in their claims
 */
guestsRouter.get(
  "/:groomUid",
  requireAuth,
  uidRateLimit("guestsRead", RATE.GUESTS_READ_PER_USER.limit, HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    const { groomUid } = req.params;
    if (!canReadGroom(req, groomUid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    // Drivers (assigned, but neither admin nor the owning groom) receive the
    // guest list for delivery, but MUST NOT get each guest's `inviteLinkToken` —
    // that token is a bearer credential for the guest's invite/RSVP and is not
    // needed to deliver. Admin and the owning groom still see it (they manage
    // invites).
    const claims = req.caller!.claims;
    const stripToken = claims.role !== "admin" && req.caller!.uid !== groomUid;
    try {
      const guests = await firebaseGuestStore().listByGroom(groomUid);
      // Shallow-copy before stripping so we never mutate the store's record.
      const out = guests.map((g) => {
        if (!stripToken) return g;
        const copy = { ...g };
        delete copy.inviteLinkToken;
        return copy;
      });
      res.json(out);
    } catch (err) {
      sendDomainError(res, err, GUEST_STATUS, "read_failed");
    }
  }
);

// ─── POST /guests/:groomUid ───────────────────────────────────────────────────

/**
 * Add a new guest under a groom. Authorized for admins and the owning groom.
 * Drivers cannot create guests — they only deliver to existing ones.
 *
 * The server stamps `createdAt` if absent. Returns `{ id }` where `id` is
 * the RTDB push key.
 */
guestsRouter.post(
  "/:groomUid",
  requireAuth,
  uidRateLimit("guestsWrite", RATE.GUESTS_WRITE_PER_USER.limit, HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    const { groomUid } = req.params;
    if (!canWriteGroomAsOwnerOrAdmin(req, groomUid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const sanitized = sanitizeGuest(req.body, { requireRequired: true });
    if (!sanitized.ok) {
      res.status(400).json({ error: sanitized.error, field: sanitized.field });
      return;
    }
    const guest = sanitized.value;
    if (typeof guest.createdAt !== "number") guest.createdAt = Date.now();

    try {
      const created = await firebaseGuestStore().create(groomUid, guest);
      res.json({ id: created.id, ...guest });
    } catch (err) {
      sendDomainError(res, err, GUEST_STATUS, "write_failed");
    }
  }
);

// ─── PATCH /guests/:groomUid/:guestId ─────────────────────────────────────────

/**
 * Patch an existing guest. Authorized for admins, the owning groom, and
 * drivers who have this groom in their `assignedGrooms` claim.
 *
 * Validation is lenient on PATCH (the rules' `.validate: hasChildren(...)`
 * applies to the full record, not deltas) — we only validate the values
 * of fields actually being changed.
 */
guestsRouter.patch(
  "/:groomUid/:guestId",
  requireAuth,
  uidRateLimit("guestsWrite", RATE.GUESTS_WRITE_PER_USER.limit, HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    const { groomUid, guestId } = req.params;
    if (!canPatchGuest(req, groomUid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const sanitized = sanitizeGuest(req.body, { requireRequired: false });
    if (!sanitized.ok) {
      res.status(400).json({ error: sanitized.error, field: sanitized.field });
      return;
    }
    if (Object.keys(sanitized.value).length === 0) {
      res.status(400).json({ error: "empty_patch" });
      return;
    }
    try {
      await firebaseGuestStore().patch(groomUid, guestId, sanitized.value);
      res.json({ ok: true });
    } catch (err) {
      sendDomainError(res, err, GUEST_STATUS, "write_failed");
    }
  }
);

// ─── DELETE /guests/:groomUid/:guestId ────────────────────────────────────────

/**
 * Remove a guest. Authorized for admins and the owning groom.
 * Drivers cannot delete — their write permission is for updating existing
 * records only (delivery status, proof, etc.).
 */
guestsRouter.delete(
  "/:groomUid/:guestId",
  requireAuth,
  uidRateLimit("guestsWrite", RATE.GUESTS_WRITE_PER_USER.limit, HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    const { groomUid, guestId } = req.params;
    if (!canWriteGroomAsOwnerOrAdmin(req, groomUid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      await firebaseGuestStore().remove(groomUid, guestId);
      res.json({ ok: true });
    } catch (err) {
      sendDomainError(res, err, GUEST_STATUS, "delete_failed");
    }
  }
);

// ─── Authorization helpers ────────────────────────────────────────────────────

/**
 * Read access: admin OR owning-groom OR assigned-driver.
 * Mirrors `database.rules.json` $groomUid `.read`.
 */
function canReadGroom(req: AuthRequest, groomUid: string): boolean {
  const claims = req.caller!.claims;
  if (claims.role === "admin") return true;
  if (req.caller!.uid === groomUid) return true;
  if (claims.assignedGrooms && claims.assignedGrooms[groomUid] === true) return true;
  return false;
}

/**
 * Write access for create / delete: admin OR owning groom.
 * Drivers explicitly excluded — their permission is for updating existing
 * records, not creating new ones (matches the rules' `data.exists()`
 * predicate that limits drivers to existing-only writes).
 */
function canWriteGroomAsOwnerOrAdmin(req: AuthRequest, groomUid: string): boolean {
  const claims = req.caller!.claims;
  if (claims.role === "admin") return true;
  if (req.caller!.uid === groomUid && claims.role === "groom") return true;
  return false;
}

/**
 * Write access for PATCH: admin OR owning groom OR assigned driver.
 * Mirrors `database.rules.json` $guestId `.write` (which allows driver
 * writes when `data.exists()` — PATCH always targets an existing record).
 */
function canPatchGuest(req: AuthRequest, groomUid: string): boolean {
  if (canWriteGroomAsOwnerOrAdmin(req, groomUid)) return true;
  const claims = req.caller!.claims;
  if (
    claims.role === "driver" &&
    claims.assignedGrooms &&
    claims.assignedGrooms[groomUid] === true
  ) {
    return true;
  }
  return false;
}

// ─── Validation ───────────────────────────────────────────────────────────────

type Sanitized =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string; field?: string };

/**
 * Coerce + validate a guest payload. Drops unknown keys, validates each
 * known field against the RTDB schema. When `requireRequired` is true,
 * `name`, `phone`, `status`, `inviteType` must all be present.
 */
function sanitizeGuest(
  body: unknown,
  opts: { requireRequired: boolean }
): Sanitized {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }
  const input = body as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const key of Object.keys(input)) {
    if (!KNOWN_FIELDS.has(key)) continue;
    const value = input[key];
    if (value === undefined) continue;
    const v = validateField(key, value);
    if (!v.ok) return v;
    if (v.value !== undefined) out[key] = v.value;
  }

  if (opts.requireRequired) {
    for (const required of ["name", "phone", "status", "inviteType"] as const) {
      if (typeof out[required] !== "string") {
        return { ok: false, error: "missing_required", field: required };
      }
    }
  }
  return { ok: true, value: out };
}

type FieldResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string; field: string };

/**
 * Validate a single key/value pair against the per-field schema mirror.
 * Returns the (possibly normalized) value or an error code.
 */
function validateField(key: string, value: unknown): FieldResult {
  switch (key) {
    case "name":
      if (typeof value !== "string" || value.length === 0 || value.length > MAX_NAME_LEN) {
        return { ok: false, error: "invalid_name", field: key };
      }
      return { ok: true, value };
    case "phone":
      // Reject empty exactly like `name` does: the add-guest UI already requires
      // a complete phone (submit is disabled without one), phone drives the
      // confirmation auto-match + WhatsApp flows, and the prior length-only check
      // let an empty phone slip past the requireRequired guard (typeof "" is
      // still "string"), creating un-matchable guest records.
      if (typeof value !== "string" || value.length === 0 || value.length > MAX_PHONE_LEN) {
        return { ok: false, error: "invalid_phone", field: key };
      }
      return { ok: true, value };
    case "area":
    case "deliveryNote":
      if (typeof value !== "string" || value.length > MAX_AREA_LEN) {
        return { ok: false, error: "too_long", field: key };
      }
      return { ok: true, value };
    case "groomUsername":
      // Enforce the username FORMAT (not just length) for parity with
      // isUsername() used everywhere else (audit: format was unvalidated).
      if (typeof value !== "string" || value.length > MAX_GROOM_USERNAME_LEN || !isUsername(value)) {
        return { ok: false, error: "invalid_groom_username", field: key };
      }
      return { ok: true, value };
    case "status":
      if (typeof value !== "string" || !ALLOWED_STATUS.has(value)) {
        return { ok: false, error: "invalid_status", field: key };
      }
      return { ok: true, value };
    case "inviteType":
      if (typeof value !== "string" || !ALLOWED_INVITE_TYPE.has(value)) {
        return { ok: false, error: "invalid_invite_type", field: key };
      }
      return { ok: true, value };
    case "proofPhotoPath":
      if (typeof value !== "string" || value.length > MAX_PROOF_PATH_LEN) {
        return { ok: false, error: "invalid_proof_path", field: key };
      }
      return { ok: true, value };
    case "deliveredAt":
      // Cap length like every other string field (audit: was type-only).
      if (typeof value !== "string" || value.length > MAX_DELIVERED_AT_LEN) {
        return { ok: false, error: "invalid_delivered_at", field: key };
      }
      return { ok: true, value };
    case "deliveredBy":
      if (typeof value !== "string" || value.length > MAX_DELIVERED_BY_LEN) {
        return { ok: false, error: "invalid_delivered_by", field: key };
      }
      return { ok: true, value };
    case "createdAt":
    case "locationUpdatedAt":
    case "inviteLinkSentAt":
    case "confirmedAt":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return { ok: false, error: "invalid_timestamp", field: key };
      }
      return { ok: true, value };
    case "lat":
      if (typeof value !== "number" || !Number.isFinite(value) || value < -90 || value > 90) {
        return { ok: false, error: "invalid_lat", field: key };
      }
      return { ok: true, value };
    case "lng":
      if (typeof value !== "number" || !Number.isFinite(value) || value < -180 || value > 180) {
        return { ok: false, error: "invalid_lng", field: key };
      }
      return { ok: true, value };
    case "locationAccuracy":
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100_000) {
        return { ok: false, error: "invalid_accuracy", field: key };
      }
      return { ok: true, value };
    case "locationSource":
      if (typeof value !== "string" || !ALLOWED_LOCATION_SOURCE.has(value)) {
        return { ok: false, error: "invalid_location_source", field: key };
      }
      return { ok: true, value };
    case "inviteLinkToken":
      if (typeof value !== "string" || value.length > MAX_INVITE_TOKEN_LEN) {
        return { ok: false, error: "invalid_invite_token", field: key };
      }
      return { ok: true, value };
    default:
      // Unknown keys are dropped silently by sanitizeGuest; this branch
      // exists to keep the switch exhaustive for known-but-unhandled fields.
      return { ok: true, value };
  }
}

