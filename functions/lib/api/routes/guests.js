"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.guestsRouter = void 0;
const express_1 = require("express");
const database_1 = require("firebase-admin/database");
const auth_1 = require("../middleware/auth");
const limits_1 = require("../../constants/limits");
// ─── Schema constants (mirror database.rules.json) ────────────────────────────
const MAX_NAME_LEN = limits_1.MAX_LEN.NAME;
const MAX_PHONE_LEN = limits_1.MAX_LEN.PHONE;
const MAX_AREA_LEN = limits_1.MAX_LEN.AREA;
const MAX_GROOM_USERNAME_LEN = limits_1.MAX_LEN.GROOM_USERNAME;
const MAX_PROOF_PATH_LEN = limits_1.MAX_LEN.PATH;
const MAX_INVITE_TOKEN_LEN = 64;
const MAX_DELIVERED_BY_LEN = limits_1.MAX_LEN.NAME;
const ALLOWED_STATUS = new Set(["pending", "enroute", "delivered"]);
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
exports.guestsRouter = (0, express_1.Router)();
// ─── GET /guests ──────────────────────────────────────────────────────────────
/**
 * Admin-only flat list of every guest across every groom.
 * Each item shape: `{ id, groomUid, ...guestFields }`.
 */
exports.guestsRouter.get("/", auth_1.requireAuth, async (req, res) => {
    if (req.caller.claims.role !== "admin") {
        res.status(403).json({ error: "admins_only" });
        return;
    }
    try {
        const snap = await (0, database_1.getDatabase)().ref("guestsByGroom").get();
        const out = [];
        snap.forEach((groomBucket) => {
            const groomUid = groomBucket.key;
            if (!groomUid)
                return;
            groomBucket.forEach((g) => {
                out.push({ id: g.key, groomUid, ...g.val() });
            });
        });
        res.json(out);
    }
    catch (err) {
        res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
    }
});
// ─── GET /guests/:groomUid ────────────────────────────────────────────────────
/**
 * List one groom's guests. Authorized for:
 *   - admins (any groomUid)
 *   - the groom themselves (req.caller.uid === groomUid)
 *   - drivers with `assignedGrooms[groomUid] === true` in their claims
 */
exports.guestsRouter.get("/:groomUid", auth_1.requireAuth, async (req, res) => {
    const { groomUid } = req.params;
    if (!canReadGroom(req, groomUid)) {
        res.status(403).json({ error: "forbidden" });
        return;
    }
    try {
        const snap = await (0, database_1.getDatabase)().ref(`guestsByGroom/${groomUid}`).get();
        const out = [];
        snap.forEach((g) => {
            out.push({ id: g.key, groomUid, ...g.val() });
        });
        res.json(out);
    }
    catch (err) {
        res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
    }
});
// ─── POST /guests/:groomUid ───────────────────────────────────────────────────
/**
 * Add a new guest under a groom. Authorized for admins and the owning groom.
 * Drivers cannot create guests — they only deliver to existing ones.
 *
 * The server stamps `createdAt` if absent. Returns `{ id }` where `id` is
 * the RTDB push key.
 */
exports.guestsRouter.post("/:groomUid", auth_1.requireAuth, async (req, res) => {
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
    if (typeof guest.createdAt !== "number")
        guest.createdAt = Date.now();
    try {
        const newRef = (0, database_1.getDatabase)().ref(`guestsByGroom/${groomUid}`).push();
        await newRef.set(guest);
        res.json({ id: newRef.key, ...guest });
    }
    catch (err) {
        res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
});
// ─── PATCH /guests/:groomUid/:guestId ─────────────────────────────────────────
/**
 * Patch an existing guest. Authorized for admins, the owning groom, and
 * drivers who have this groom in their `assignedGrooms` claim.
 *
 * Validation is lenient on PATCH (the rules' `.validate: hasChildren(...)`
 * applies to the full record, not deltas) — we only validate the values
 * of fields actually being changed.
 */
exports.guestsRouter.patch("/:groomUid/:guestId", auth_1.requireAuth, async (req, res) => {
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
        await (0, database_1.getDatabase)()
            .ref(`guestsByGroom/${groomUid}/${guestId}`)
            .update(sanitized.value);
        res.json({ ok: true });
    }
    catch (err) {
        res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
});
// ─── DELETE /guests/:groomUid/:guestId ────────────────────────────────────────
/**
 * Remove a guest. Authorized for admins and the owning groom.
 * Drivers cannot delete — their write permission is for updating existing
 * records only (delivery status, proof, etc.).
 */
exports.guestsRouter.delete("/:groomUid/:guestId", auth_1.requireAuth, async (req, res) => {
    const { groomUid, guestId } = req.params;
    if (!canWriteGroomAsOwnerOrAdmin(req, groomUid)) {
        res.status(403).json({ error: "forbidden" });
        return;
    }
    try {
        await (0, database_1.getDatabase)().ref(`guestsByGroom/${groomUid}/${guestId}`).remove();
        res.json({ ok: true });
    }
    catch (err) {
        res.status(500).json({ error: "delete_failed", detail: errorMessage(err) });
    }
});
// ─── Authorization helpers ────────────────────────────────────────────────────
/**
 * Read access: admin OR owning-groom OR assigned-driver.
 * Mirrors `database.rules.json` $groomUid `.read`.
 */
function canReadGroom(req, groomUid) {
    const claims = req.caller.claims;
    if (claims.role === "admin")
        return true;
    if (req.caller.uid === groomUid)
        return true;
    if (claims.assignedGrooms && claims.assignedGrooms[groomUid] === true)
        return true;
    return false;
}
/**
 * Write access for create / delete: admin OR owning groom.
 * Drivers explicitly excluded — their permission is for updating existing
 * records, not creating new ones (matches the rules' `data.exists()`
 * predicate that limits drivers to existing-only writes).
 */
function canWriteGroomAsOwnerOrAdmin(req, groomUid) {
    const claims = req.caller.claims;
    if (claims.role === "admin")
        return true;
    if (req.caller.uid === groomUid && claims.role === "groom")
        return true;
    return false;
}
/**
 * Write access for PATCH: admin OR owning groom OR assigned driver.
 * Mirrors `database.rules.json` $guestId `.write` (which allows driver
 * writes when `data.exists()` — PATCH always targets an existing record).
 */
function canPatchGuest(req, groomUid) {
    if (canWriteGroomAsOwnerOrAdmin(req, groomUid))
        return true;
    const claims = req.caller.claims;
    if (claims.role === "driver" &&
        claims.assignedGrooms &&
        claims.assignedGrooms[groomUid] === true) {
        return true;
    }
    return false;
}
/**
 * Coerce + validate a guest payload. Drops unknown keys, validates each
 * known field against the RTDB schema. When `requireRequired` is true,
 * `name`, `phone`, `status`, `inviteType` must all be present.
 */
function sanitizeGuest(body, opts) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return { ok: false, error: "invalid_body" };
    }
    const input = body;
    const out = {};
    for (const key of Object.keys(input)) {
        if (!KNOWN_FIELDS.has(key))
            continue;
        const value = input[key];
        if (value === undefined)
            continue;
        const v = validateField(key, value);
        if (!v.ok)
            return v;
        if (v.value !== undefined)
            out[key] = v.value;
    }
    if (opts.requireRequired) {
        for (const required of ["name", "phone", "status", "inviteType"]) {
            if (typeof out[required] !== "string") {
                return { ok: false, error: "missing_required", field: required };
            }
        }
    }
    return { ok: true, value: out };
}
/**
 * Validate a single key/value pair against the per-field schema mirror.
 * Returns the (possibly normalized) value or an error code.
 */
function validateField(key, value) {
    switch (key) {
        case "name":
            if (typeof value !== "string" || value.length === 0 || value.length > MAX_NAME_LEN) {
                return { ok: false, error: "invalid_name", field: key };
            }
            return { ok: true, value };
        case "phone":
            if (typeof value !== "string" || value.length > MAX_PHONE_LEN) {
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
            if (typeof value !== "string" || value.length > MAX_GROOM_USERNAME_LEN) {
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
            if (typeof value !== "string") {
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
            if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100000) {
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
function errorMessage(err) {
    if (err instanceof Error)
        return err.message;
    if (typeof err === "string")
        return err;
    return "unknown";
}
//# sourceMappingURL=guests.js.map