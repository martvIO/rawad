"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePortalUser = void 0;
// Admin-only callable for patching an existing user's profile. Supports
// changing displayName, phoneE164, role, and username. Each field is
// validated, indices (/usernameIndex, /phoneIndex) are kept in sync, and
// Firebase Auth records (email when username changes; phone number; admin
// custom claim when role changes) are updated atomically with the RTDB
// profile so the two sources of truth never diverge.
const https_1 = require("firebase-functions/v2/https");
const auth_1 = require("firebase-admin/auth");
const database_1 = require("firebase-admin/database");
const audit_1 = require("./audit");
const rateLimit_1 = require("./rateLimit");
const helpers_1 = require("./helpers");
const limits_1 = require("./constants/limits");
const rateLimits_1 = require("./constants/rateLimits");
// App Check is OFF — admin-only callable already gated by assertAdmin +
// rate limit + audit log. See users.ts for the policy rationale.
exports.updatePortalUser = (0, https_1.onCall)({ enforceAppCheck: false }, async (req) => {
    const callerUid = (0, helpers_1.assertAdmin)(req);
    if (!(0, rateLimit_1.allow)(`updateUser:${callerUid}`, rateLimits_1.RATE.UPDATE_USER_PER_ADMIN.limit, rateLimits_1.RATE.UPDATE_USER_PER_ADMIN.windowMs)) {
        throw new https_1.HttpsError("resource-exhausted", "Too many user updates.");
    }
    const input = (req.data ?? {});
    const uid = input.uid;
    if (typeof uid !== "string" || uid.length === 0) {
        throw new https_1.HttpsError("invalid-argument", "Missing uid.");
    }
    const db = (0, database_1.getDatabase)();
    const profileSnap = await db.ref(`users/${uid}`).get();
    if (!profileSnap.exists()) {
        throw new https_1.HttpsError("not-found", "User not found.");
    }
    const profile = profileSnap.val();
    // Validate each field that's being changed.
    if (input.username !== undefined && !(0, helpers_1.isUsername)(input.username)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid username.");
    }
    if (input.phoneE164 !== undefined && !(0, helpers_1.isE164)(input.phoneE164)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid phone (must be E.164).");
    }
    if (input.role !== undefined && !(0, helpers_1.isRole)(input.role)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid role.");
    }
    if (input.displayName !== undefined &&
        input.displayName !== null &&
        (typeof input.displayName !== "string" || input.displayName.length > limits_1.MAX_LEN.NAME)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid displayName.");
    }
    // Self-demotion guard — keeps at least the caller as admin.
    if (uid === callerUid && input.role !== undefined && input.role !== "admin") {
        throw new https_1.HttpsError("failed-precondition", "Admins can't demote themselves.");
    }
    const newUsername = input.username !== undefined
        ? input.username.toLowerCase()
        : null;
    const newPhone = input.phoneE164 !== undefined ? input.phoneE164 : null;
    const newRole = input.role !== undefined ? input.role : null;
    const newDisplayName = input.displayName !== undefined ? input.displayName : undefined;
    // Uniqueness checks for changed unique fields.
    if (newUsername !== null && newUsername !== profile.username) {
        if ((await db.ref(`usernameIndex/${newUsername}`).get()).exists()) {
            throw new https_1.HttpsError("already-exists", "Username is taken.");
        }
    }
    if (newPhone !== null && newPhone !== profile.phoneE164) {
        const newIdx = (0, helpers_1.phoneIndexKey)(newPhone);
        const claimedBy = (await db.ref(`phoneIndex/${newIdx}`).get()).val();
        if (claimedBy && claimedBy !== uid) {
            throw new https_1.HttpsError("already-exists", "Phone is already registered.");
        }
    }
    // ── Firebase Auth side ───────────────────────────────────────────────
    const authPatch = {};
    if (newUsername !== null && newUsername !== profile.username) {
        authPatch.email = (0, helpers_1.syntheticEmail)(newUsername);
    }
    if (newPhone !== null && newPhone !== profile.phoneE164) {
        authPatch.phoneNumber = newPhone;
    }
    if (newDisplayName !== undefined) {
        authPatch.displayName = (newDisplayName ?? "").slice(0, limits_1.MAX_LEN.NAME) || null;
    }
    if (Object.keys(authPatch).length > 0) {
        await (0, auth_1.getAuth)().updateUser(uid, authPatch);
    }
    // Custom-claim sync when role and/or username changes. We always carry
    // `role` and `username` in claims; the rule layer reads them as
    // auth.token.role / auth.token.username. The legacy `admin: true` field
    // is stripped so it can't be relied on going forward.
    if ((newRole !== null && newRole !== profile.role) ||
        (newUsername !== null && newUsername !== profile.username)) {
        const existing = (await (0, auth_1.getAuth)().getUser(uid)).customClaims ?? {};
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { admin: _legacyAdmin, ...rest } = existing;
        await (0, auth_1.getAuth)().setCustomUserClaims(uid, {
            ...rest,
            role: newRole ?? profile.role,
            username: newUsername ?? profile.username,
        });
    }
    // ── RTDB side ────────────────────────────────────────────────────────
    const updates = {};
    if (newUsername !== null && newUsername !== profile.username) {
        updates[`users/${uid}/username`] = newUsername;
        updates[`usernameIndex/${profile.username}`] = null;
        updates[`usernameIndex/${newUsername}`] = uid;
    }
    if (newPhone !== null && newPhone !== profile.phoneE164) {
        updates[`users/${uid}/phoneE164`] = newPhone;
        updates[`phoneIndex/${(0, helpers_1.phoneIndexKey)(profile.phoneE164)}`] = null;
        updates[`phoneIndex/${(0, helpers_1.phoneIndexKey)(newPhone)}`] = uid;
    }
    if (newRole !== null && newRole !== profile.role) {
        updates[`users/${uid}/role`] = newRole;
    }
    if (newDisplayName !== undefined) {
        updates[`users/${uid}/displayName`] = newDisplayName ?? null;
    }
    if (Object.keys(updates).length > 0) {
        await db.ref().update(updates);
    }
    await (0, audit_1.writeAudit)(callerUid, "updatePortalUser", {
        uid,
        changes: Object.keys(input).filter(k => k !== "uid"),
    });
    return { ok: true };
});
//# sourceMappingURL=updateUser.js.map