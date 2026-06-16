"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setAdminClaim = exports.deletePortalUser = exports.createPortalUser = void 0;
// Admin-only callable functions that manage portal users (grooms / drivers /
// other admins). The client never creates or deletes users directly — that
// would bypass our role + claim + index bookkeeping.
const https_1 = require("firebase-functions/v2/https");
const auth_1 = require("firebase-admin/auth");
const database_1 = require("firebase-admin/database");
const audit_1 = require("./audit");
const rateLimit_1 = require("./rateLimit");
const helpers_1 = require("./helpers");
const limits_1 = require("./constants/limits");
const rateLimits_1 = require("./constants/rateLimits");
// ── createPortalUser ──────────────────────────────────────────────────────────
// App Check is OFF for admin callables: they're already gated by the
// `admin: true` custom claim (assertAdmin) plus per-admin rate limiting
// and an audit log. App Check stays on the public submitConfirmation
// endpoint where it's the primary anti-abuse defense.
exports.createPortalUser = (0, https_1.onCall)({ enforceAppCheck: false }, async (req) => {
    const callerUid = (0, helpers_1.assertAdmin)(req);
    if (!(0, rateLimit_1.allow)(`createUser:${callerUid}`, rateLimits_1.RATE.CREATE_USER_PER_ADMIN.limit, rateLimits_1.RATE.CREATE_USER_PER_ADMIN.windowMs)) {
        throw new https_1.HttpsError("resource-exhausted", "Too many user-creation attempts.");
    }
    const input = req.data;
    if (!(0, helpers_1.isUsername)(input.username))
        throw new https_1.HttpsError("invalid-argument", "Invalid username.");
    if (!(0, helpers_1.isStrongPassword)(input.password)) {
        throw new https_1.HttpsError("invalid-argument", "Password must be at least 8 characters and include uppercase, lowercase, and a number.");
    }
    if (!(0, helpers_1.isRole)(input.role))
        throw new https_1.HttpsError("invalid-argument", "Invalid role.");
    // Phone is optional, but if provided it must be valid E.164.
    const hasPhone = typeof input.phoneE164 === "string" && input.phoneE164.length > 0;
    if (hasPhone && !(0, helpers_1.isE164)(input.phoneE164)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid phone (must be E.164).");
    }
    const username = input.username.toLowerCase();
    const email = (0, helpers_1.syntheticEmail)(username);
    const phoneIdx = hasPhone ? (0, helpers_1.phoneIndexKey)(input.phoneE164) : null;
    const db = (0, database_1.getDatabase)();
    // Uniqueness checks (in addition to Firebase Auth's own email + phone uniqueness).
    if ((await db.ref(`usernameIndex/${username}`).get()).exists()) {
        throw new https_1.HttpsError("already-exists", "Username is taken.");
    }
    if (phoneIdx && (await db.ref(`phoneIndex/${phoneIdx}`).get()).exists()) {
        throw new https_1.HttpsError("already-exists", "Phone is already registered.");
    }
    const createUserPayload = {
        email,
        password: input.password,
        displayName: input.displayName?.slice(0, limits_1.MAX_LEN.NAME),
        disabled: false,
    };
    if (hasPhone)
        createUserPayload.phoneNumber = input.phoneE164;
    const userRecord = await (0, auth_1.getAuth)().createUser(createUserPayload);
    // Custom claims: every user gets `role` and `username` so security rules
    // can branch on auth.token.role === 'admin' (etc.) and audit logs can
    // identify the actor by username without an extra lookup.
    await (0, auth_1.getAuth)().setCustomUserClaims(userRecord.uid, {
        role: input.role,
        username,
    });
    const profile = {
        username,
        role: input.role,
        displayName: input.displayName ?? null,
        createdAt: Date.now(),
        createdBy: callerUid,
    };
    if (hasPhone)
        profile.phoneE164 = input.phoneE164;
    const updates = {};
    updates[`users/${userRecord.uid}`] = profile;
    updates[`usernameIndex/${username}`] = userRecord.uid;
    if (phoneIdx)
        updates[`phoneIndex/${phoneIdx}`] = userRecord.uid;
    await db.ref().update(updates);
    await (0, audit_1.writeAudit)(callerUid, "createPortalUser", { uid: userRecord.uid, role: input.role });
    return { uid: userRecord.uid };
});
// ── deletePortalUser ──────────────────────────────────────────────────────────
exports.deletePortalUser = (0, https_1.onCall)({ enforceAppCheck: false }, async (req) => {
    const callerUid = (0, helpers_1.assertAdmin)(req);
    const uid = req.data?.uid;
    if (typeof uid !== "string" || uid.length === 0) {
        throw new https_1.HttpsError("invalid-argument", "Missing uid.");
    }
    if (uid === callerUid) {
        throw new https_1.HttpsError("failed-precondition", "Admins can't delete themselves.");
    }
    if (!(0, rateLimit_1.allow)(`deleteUser:${callerUid}`, rateLimits_1.RATE.DELETE_USER_PER_ADMIN.limit, rateLimits_1.RATE.DELETE_USER_PER_ADMIN.windowMs)) {
        throw new https_1.HttpsError("resource-exhausted", "Too many user-deletions.");
    }
    const db = (0, database_1.getDatabase)();
    const profileSnap = await db.ref(`users/${uid}`).get();
    if (!profileSnap.exists()) {
        throw new https_1.HttpsError("not-found", "User not found.");
    }
    const profile = profileSnap.val();
    await (0, auth_1.getAuth)().deleteUser(uid).catch(() => { });
    const updates = {};
    updates[`users/${uid}`] = null;
    updates[`usernameIndex/${profile.username}`] = null;
    // Phone index only exists if the profile actually stored one.
    if (profile.phoneE164) {
        updates[`phoneIndex/${(0, helpers_1.phoneIndexKey)(profile.phoneE164)}`] = null;
    }
    updates[`driverAssignments/${uid}`] = null;
    // If they were a groom, blow away their entire data subtree.
    updates[`guestsByGroom/${uid}`] = null;
    updates[`liveLocationsByGroom/${uid}`] = null;
    await db.ref().update(updates);
    await (0, audit_1.writeAudit)(callerUid, "deletePortalUser", { uid });
    return { ok: true };
});
// ── setAdminClaim ─────────────────────────────────────────────────────────────
// Allows an existing admin to promote / demote another user without deleting
// and re-creating them.
exports.setAdminClaim = (0, https_1.onCall)({ enforceAppCheck: false }, async (req) => {
    const callerUid = (0, helpers_1.assertAdmin)(req);
    const uid = req.data?.uid;
    const isAdmin = req.data?.isAdmin === true;
    if (typeof uid !== "string" || uid.length === 0) {
        throw new https_1.HttpsError("invalid-argument", "Missing uid.");
    }
    if (uid === callerUid && !isAdmin) {
        throw new https_1.HttpsError("failed-precondition", "Admins can't demote themselves.");
    }
    const existing = (await (0, auth_1.getAuth)().getUser(uid)).customClaims ?? {};
    // Drop the legacy `admin: true` field if present; the new shape uses
    // `role: "admin"|"groom"` as the single source of truth.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { admin: _legacyAdmin, ...rest } = existing;
    const newRole = isAdmin ? "admin" : "groom";
    await (0, auth_1.getAuth)().setCustomUserClaims(uid, { ...rest, role: newRole });
    await (0, database_1.getDatabase)().ref(`users/${uid}/role`).set(newRole);
    await (0, audit_1.writeAudit)(callerUid, "setAdminClaim", { uid, isAdmin });
    return { ok: true };
});
//# sourceMappingURL=users.js.map