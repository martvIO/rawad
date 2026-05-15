// Public guest-confirmation submission. Unauthenticated by design (the guest
// has no portal account), so abuse protection lives here:
//   - Firebase App Check (enforced) — only attested clients of THIS app can call.
//   - Per-IP rate limit.
//   - Strict schema + length validation.
//   - Direct client writes to /confirmations are blocked by rules.
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getDatabase } from "firebase-admin/database";
import { allow }       from "./rateLimit";
import { isUsername, normalisePhone } from "./helpers";

const MAX_LEN = {
  submittedName:   120,
  submittedPhone:  30,
  submittedCity:   80,
  submittedStreet: 120,
  submittedHouse:  20,
};

function clampStr(v: unknown, max: number): string {
  return (typeof v === "string" ? v.trim() : "").slice(0, max);
}

export const submitConfirmation = onCall(
  { enforceAppCheck: true },
  async (req) => {
    // Per-IP rate limit: 5 submissions per hour, per IP.
    const ip = (req.rawRequest?.ip ?? "unknown").toString();
    if (!allow(`confirm:${ip}`, 5, 60 * 60 * 1000)) {
      throw new HttpsError("resource-exhausted", "Too many submissions; please try again later.");
    }

    const data = req.data ?? {};
    const groomUsername = (data.groomUsername ?? "").toString().toLowerCase();
    if (!isUsername(groomUsername)) {
      throw new HttpsError("invalid-argument", "Invalid groom.");
    }
    const submittedName   = clampStr(data.submittedName,   MAX_LEN.submittedName);
    const submittedPhone  = clampStr(data.submittedPhone,  MAX_LEN.submittedPhone);
    const submittedCity   = clampStr(data.submittedCity,   MAX_LEN.submittedCity);
    const submittedStreet = clampStr(data.submittedStreet, MAX_LEN.submittedStreet);
    const submittedHouse  = clampStr(data.submittedHouse,  MAX_LEN.submittedHouse);

    if (!submittedName || !submittedPhone || !submittedCity) {
      throw new HttpsError("invalid-argument", "Name, phone and city are required.");
    }
    if (submittedName.split(/\s+/).filter(Boolean).length < 2) {
      throw new HttpsError("invalid-argument", "Please enter a full name.");
    }
    if (!normalisePhone(submittedPhone)) {
      throw new HttpsError("invalid-argument", "Invalid phone number.");
    }

    const db = getDatabase();
    const groomUidSnap = await db.ref(`usernameIndex/${groomUsername}`).get();
    if (!groomUidSnap.exists()) {
      // Don't leak whether the groom username exists — return success-ish.
      // Actually for a confirmation form pointed at a real link, a missing
      // groom is most likely a typo in the URL; surface a generic error.
      throw new HttpsError("not-found", "Unknown groom.");
    }
    const groomUid = groomUidSnap.val();

    const confRef = db.ref("confirmations").push();
    await confRef.set({
      groomUid,
      groomUsername,   // denormed so the admin tab can show it without a users lookup
      submittedName, submittedPhone, submittedCity, submittedStreet, submittedHouse,
      confirmedAt: Date.now(),
    });
    return { ok: true, id: confRef.key };
  },
);
