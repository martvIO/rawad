"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPassword = void 0;
// Password reset via phone-OTP.
//
// Client flow:
//   1. User enters their phone number.
//   2. Client calls signInWithPhoneNumber() (Firebase Phone Auth, invisible
//      reCAPTCHA). Firebase sends the SMS code.
//   3. User enters the code; client calls confirmationResult.confirm(code).
//      They are now signed in as a *phone-only* user — auth.token.phone_number
//      is populated.
//   4. Client calls this function with { newPassword }.
//
// This function:
//   - Verifies the caller is authenticated AND has a phone_number claim.
//   - Looks up the portal user that owns that phone number in /phoneIndex.
//   - Updates that user's password via the Admin SDK.
//   - Deletes the throw-away phone-auth user immediately afterwards so the
//     phone account doesn't linger.
const https_1 = require("firebase-functions/v2/https");
const auth_1 = require("firebase-admin/auth");
const database_1 = require("firebase-admin/database");
const audit_1 = require("./audit");
const rateLimit_1 = require("./rateLimit");
const helpers_1 = require("./helpers");
const rateLimits_1 = require("./constants/rateLimits");
// App Check is OFF — the phone-OTP requirement is itself a strong gate
// (you need to receive an SMS at the phone registered to a portal user),
// and per-phone rate limiting (5/hr) is enforced below. App Check stays
// on the public submitConfirmation endpoint where it actually matters.
exports.resetPassword = (0, https_1.onCall)({ enforceAppCheck: false }, async (req) => {
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Phone verification required.");
    // Throw-away phone-auth UID belongs to the SMS challenge, not the portal user.
    const phoneAuthUid = req.auth.uid;
    const phoneE164 = req.auth.token.phone_number;
    if (!phoneE164) {
        throw new https_1.HttpsError("permission-denied", "Phone-verified session required.");
    }
    const newPassword = req.data?.newPassword;
    if (!(0, helpers_1.isStrongPassword)(newPassword)) {
        throw new https_1.HttpsError("invalid-argument", "Password must be at least 8 characters and include uppercase, lowercase, and a number.");
    }
    if (!(0, rateLimit_1.allow)(`reset:${phoneE164}`, rateLimits_1.RATE.RESET_PER_PHONE.limit, rateLimits_1.RATE.RESET_PER_PHONE.windowMs)) {
        throw new https_1.HttpsError("resource-exhausted", "Too many reset attempts; try again later.");
    }
    const db = (0, database_1.getDatabase)();
    const targetUidSnap = await db.ref(`phoneIndex/${(0, helpers_1.phoneIndexKey)(phoneE164)}`).get();
    if (!targetUidSnap.exists()) {
        throw new https_1.HttpsError("not-found", "No portal account linked to that phone.");
    }
    const targetUid = targetUidSnap.val();
    // Confirm the profile's recorded phone really matches (defense in depth).
    const profile = (await db.ref(`users/${targetUid}`).get()).val();
    if (!profile || profile.phoneE164 !== phoneE164) {
        throw new https_1.HttpsError("permission-denied", "Phone does not match account.");
    }
    await (0, auth_1.getAuth)().updateUser(targetUid, { password: newPassword });
    // Invalidate refresh tokens so old sessions can't survive a password reset.
    await (0, auth_1.getAuth)().revokeRefreshTokens(targetUid);
    // Clean up the throw-away phone-auth user so the phone isn't tied to two
    // accounts. Errors here are non-fatal — the password was still reset.
    try {
        await (0, auth_1.getAuth)().deleteUser(phoneAuthUid);
    }
    catch { /* noop */ }
    await (0, audit_1.writeAudit)(targetUid, "resetPassword", { via: "phone" });
    return { ok: true };
});
//# sourceMappingURL=resetPassword.js.map