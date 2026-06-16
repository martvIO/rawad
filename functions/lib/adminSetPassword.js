"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminSetPassword = void 0;
// Admin-only callable for setting another user's password. Used when a
// driver / groom forgets their password and the phone-OTP self-service flow
// in resetPassword.ts is not an option (e.g. they no longer have the phone).
// Admins cannot use this on themselves — they should use the regular
// password-change flow from their own session.
const https_1 = require("firebase-functions/v2/https");
const auth_1 = require("firebase-admin/auth");
const audit_1 = require("./audit");
const rateLimit_1 = require("./rateLimit");
const helpers_1 = require("./helpers");
const rateLimits_1 = require("./constants/rateLimits");
// App Check is OFF — admin-only callable already gated by assertAdmin +
// rate limit + audit log. See users.ts for the policy rationale.
exports.adminSetPassword = (0, https_1.onCall)({ enforceAppCheck: false }, async (req) => {
    const callerUid = (0, helpers_1.assertAdmin)(req);
    if (!(0, rateLimit_1.allow)(`adminSetPassword:${callerUid}`, rateLimits_1.RATE.SET_PASSWORD_PER_ADMIN.limit, rateLimits_1.RATE.SET_PASSWORD_PER_ADMIN.windowMs)) {
        throw new https_1.HttpsError("resource-exhausted", "Too many password resets.");
    }
    const uid = req.data?.uid;
    const newPassword = req.data?.newPassword;
    if (typeof uid !== "string" || uid.length === 0) {
        throw new https_1.HttpsError("invalid-argument", "Missing uid.");
    }
    if (!(0, helpers_1.isStrongPassword)(newPassword)) {
        throw new https_1.HttpsError("invalid-argument", "Password must be at least 8 characters and include uppercase, lowercase, and a number.");
    }
    if (uid === callerUid) {
        throw new https_1.HttpsError("failed-precondition", "Use the regular reset flow for your own password.");
    }
    // Confirm the target exists before we touch credentials.
    await (0, auth_1.getAuth)().getUser(uid);
    await (0, auth_1.getAuth)().updateUser(uid, { password: newPassword });
    // Force re-login on every other session — old tokens are no longer valid.
    await (0, auth_1.getAuth)().revokeRefreshTokens(uid);
    await (0, audit_1.writeAudit)(callerUid, "adminSetPassword", { uid });
    return { ok: true };
});
//# sourceMappingURL=adminSetPassword.js.map