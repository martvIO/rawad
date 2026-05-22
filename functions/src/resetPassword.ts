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
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getAuth }     from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { writeAudit }  from "./audit";
import { allow }       from "./rateLimit";
import { isStrongPassword, phoneIndexKey } from "./helpers";
import { RATE } from "./constants/rateLimits";

// App Check is OFF — the phone-OTP requirement is itself a strong gate
// (you need to receive an SMS at the phone registered to a portal user),
// and per-phone rate limiting (5/hr) is enforced below. App Check stays
// on the public submitConfirmation endpoint where it actually matters.
export const resetPassword = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Phone verification required.");

    // Throw-away phone-auth UID belongs to the SMS challenge, not the portal user.
    const phoneAuthUid = req.auth.uid;
    const phoneE164: string | undefined = req.auth.token.phone_number;
    if (!phoneE164) {
      throw new HttpsError("permission-denied", "Phone-verified session required.");
    }

    const newPassword = req.data?.newPassword;
    if (!isStrongPassword(newPassword)) {
      throw new HttpsError(
        "invalid-argument",
        "Password must be at least 8 characters and include uppercase, lowercase, and a number.",
      );
    }

    if (!allow(`reset:${phoneE164}`, RATE.RESET_PER_PHONE.limit, RATE.RESET_PER_PHONE.windowMs)) {
      throw new HttpsError("resource-exhausted", "Too many reset attempts; try again later.");
    }

    const db = getDatabase();
    const targetUidSnap = await db.ref(`phoneIndex/${phoneIndexKey(phoneE164)}`).get();
    if (!targetUidSnap.exists()) {
      throw new HttpsError("not-found", "No portal account linked to that phone.");
    }
    const targetUid = targetUidSnap.val();

    // Confirm the profile's recorded phone really matches (defense in depth).
    const profile = (await db.ref(`users/${targetUid}`).get()).val();
    if (!profile || profile.phoneE164 !== phoneE164) {
      throw new HttpsError("permission-denied", "Phone does not match account.");
    }

    await getAuth().updateUser(targetUid, { password: newPassword });
    // Invalidate refresh tokens so old sessions can't survive a password reset.
    await getAuth().revokeRefreshTokens(targetUid);

    // Clean up the throw-away phone-auth user so the phone isn't tied to two
    // accounts. Errors here are non-fatal — the password was still reset.
    try { await getAuth().deleteUser(phoneAuthUid); } catch { /* noop */ }

    await writeAudit(targetUid, "resetPassword", { via: "phone" });
    return { ok: true };
  },
);
