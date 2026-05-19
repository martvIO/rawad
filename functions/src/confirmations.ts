// Public guest-confirmation submission. Unauthenticated by design (the guest
// has no portal account), so abuse protection lives here:
//   - Per-IP rate limit (5/hr) — the sole abuse gate.
//   - Strict schema + length validation.
//   - Direct client writes to /confirmations are blocked by rules.
// App Check was removed project-wide; this endpoint stays open and is
// protected by the rate limit alone.
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getDatabase } from "firebase-admin/database";
import { allow }       from "./rateLimit";
import {
  isUsername, normalisePhone, isFiniteInRange, normalisePhoneForMatching,
} from "./helpers";

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
  { enforceAppCheck: false },
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

    // Optional GPS fields. Both lat AND lng must be valid finite numbers in
    // range to count; either-or is rejected to avoid half-set coords.
    const hasCoords = isFiniteInRange(data.lat, -90, 90) && isFiniteInRange(data.lng, -180, 180);
    const lat = hasCoords ? (data.lat as number) : null;
    const lng = hasCoords ? (data.lng as number) : null;
    const locationAccuracy = isFiniteInRange(data.locationAccuracy, 0, 100000)
      ? (data.locationAccuracy as number) : null;

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
    const confRecord: Record<string, unknown> = {
      groomUid,
      groomUsername,   // denormed so the admin tab can show it without a users lookup
      submittedName, submittedPhone, submittedCity, submittedStreet, submittedHouse,
      confirmedAt: Date.now(),
    };
    if (hasCoords) {
      confRecord.lat = lat;
      confRecord.lng = lng;
      confRecord.locationCapturedAt = Date.now();
      if (locationAccuracy !== null) confRecord.locationAccuracy = locationAccuracy;
    }
    await confRef.set(confRecord);

    // Auto-attach: if exactly one guest under this groom matches the submitted
    // phone (after normalisation), mark it confirmed; opportunistically copy
    // GPS coords too when the submission included them and the guest has none.
    // Best-effort — failure here doesn't fail the overall submission.
    let attachedGuestId: string | null = null;
    try {
      const target = normalisePhoneForMatching(submittedPhone);
      if (target) {
        const guestsSnap = await db.ref(`guestsByGroom/${groomUid}`).get();
        const matches: string[] = [];
        guestsSnap.forEach((g) => {
          const v = g.val() as { phone?: string } | null;
          if (v && normalisePhoneForMatching(v.phone ?? "") === target) {
            if (g.key) matches.push(g.key);
          }
          return false;
        });
        if (matches.length === 1) {
          const guestId = matches[0];
          const guestVal = guestsSnap.child(guestId).val() as { lat?: unknown } | null;
          const now = Date.now();
          const guestPatch: Record<string, unknown> = {
            confirmedAt: now,
          };
          if (hasCoords && guestVal && typeof guestVal.lat !== "number") {
            guestPatch.lat = lat;
            guestPatch.lng = lng;
            guestPatch.locationSource    = "gps";
            guestPatch.locationUpdatedAt = now;
            if (locationAccuracy !== null) guestPatch.locationAccuracy = locationAccuracy;
          }
          await db.ref(`guestsByGroom/${groomUid}/${guestId}`).update(guestPatch);
          await confRef.update({ attachedGuestId: guestId });
          attachedGuestId = guestId;
        }
      }
    } catch (e) {
      console.warn("submitConfirmation: auto-attach failed", e);
    }

    return { ok: true, id: confRef.key, attachedGuestId };
  },
);
