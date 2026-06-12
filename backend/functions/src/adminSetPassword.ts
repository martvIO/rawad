// Admin-only callable for setting another user's password. Used when a
// driver / groom forgets their password and the phone-OTP self-service flow
// in resetPassword.ts is not an option (e.g. they no longer have the phone).
// Admins cannot use this on themselves — they should use the regular
// password-change flow from their own session.
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getAuth }    from "firebase-admin/auth";
import { writeAudit } from "./audit";
import { allow }      from "./rateLimit";
import { assertAdmin, isStrongPassword } from "./helpers";
import { RATE } from "./constants/rateLimits";

// App Check is OFF — admin-only callable already gated by assertAdmin +
// rate limit + audit log. See users.ts for the policy rationale.
export const adminSetPassword = onCall(
  { enforceAppCheck: false },
  async (req) => {
    const callerUid = assertAdmin(req);
    if (!allow(
      `adminSetPassword:${callerUid}`,
      RATE.SET_PASSWORD_PER_ADMIN.limit,
      RATE.SET_PASSWORD_PER_ADMIN.windowMs,
    )) {
      throw new HttpsError("resource-exhausted", "Too many password resets.");
    }

    const uid         = req.data?.uid;
    const newPassword = req.data?.newPassword;
    if (typeof uid !== "string" || uid.length === 0) {
      throw new HttpsError("invalid-argument", "Missing uid.");
    }
    if (!isStrongPassword(newPassword)) {
      throw new HttpsError(
        "invalid-argument",
        "Password must be at least 8 characters and include uppercase, lowercase, and a number.",
      );
    }
    if (uid === callerUid) {
      throw new HttpsError("failed-precondition", "Use the regular reset flow for your own password.");
    }

    // Confirm the target exists before we touch credentials.
    await getAuth().getUser(uid);
    await getAuth().updateUser(uid, { password: newPassword });
    // Force re-login on every other session — old tokens are no longer valid.
    await getAuth().revokeRefreshTokens(uid);

    await writeAudit(callerUid, "adminSetPassword", { uid });
    return { ok: true };
  },
);
