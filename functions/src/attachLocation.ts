// Admin-only callable: copy a confirmation's GPS coords onto a guest record.
// Used when auto-attach couldn't decide (ambiguous match or no match), so the
// admin manually picks the correct guest from the confirmations panel.
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getDatabase } from "firebase-admin/database";
import { assertAdmin } from "./helpers";
import { allow } from "./rateLimit";
import { RATE } from "./constants/rateLimits";

export const attachConfirmationLocationToGuest = onCall(async (req) => {
  const adminUid = assertAdmin(req);

  // Mirrors the limit on other admin mutations — 30 per hour per admin.
  if (!allow(
    `attach:${adminUid}`,
    RATE.ATTACH_LOC_PER_ADMIN.limit,
    RATE.ATTACH_LOC_PER_ADMIN.windowMs,
  )) {
    throw new HttpsError("resource-exhausted", "Too many attach operations; try again later.");
  }

  const confirmationId = (req.data?.confirmationId ?? "").toString();
  const guestId        = (req.data?.guestId        ?? "").toString();
  if (!confirmationId || !guestId) {
    throw new HttpsError("invalid-argument", "confirmationId and guestId are required.");
  }

  const db = getDatabase();
  const confSnap = await db.ref(`confirmations/${confirmationId}`).get();
  if (!confSnap.exists()) {
    throw new HttpsError("not-found", "Confirmation not found.");
  }
  const conf = confSnap.val() as {
    groomUid?: string;
    lat?: unknown;
    lng?: unknown;
    locationAccuracy?: unknown;
  };
  if (!conf?.groomUid) {
    throw new HttpsError("failed-precondition", "Confirmation has no groomUid.");
  }
  if (typeof conf.lat !== "number" || typeof conf.lng !== "number") {
    throw new HttpsError("failed-precondition", "Confirmation has no location to attach.");
  }

  const guestRef = db.ref(`guestsByGroom/${conf.groomUid}/${guestId}`);
  const guestSnap = await guestRef.get();
  if (!guestSnap.exists()) {
    throw new HttpsError("not-found", "Guest not found under this groom.");
  }

  const guestPatch: Record<string, unknown> = {
    lat: conf.lat,
    lng: conf.lng,
    locationSource: "gps",
    locationUpdatedAt: Date.now(),
  };
  if (typeof conf.locationAccuracy === "number") {
    guestPatch.locationAccuracy = conf.locationAccuracy;
  }
  await guestRef.update(guestPatch);
  await db.ref(`confirmations/${confirmationId}`).update({ attachedGuestId: guestId });

  return { ok: true, attachedGuestId: guestId };
});
