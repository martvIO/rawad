"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachConfirmationLocationToGuest = void 0;
// Admin-only callable: copy a confirmation's GPS coords onto a guest record.
// Used when auto-attach couldn't decide (ambiguous match or no match), so the
// admin manually picks the correct guest from the confirmations panel.
const https_1 = require("firebase-functions/v2/https");
const database_1 = require("firebase-admin/database");
const helpers_1 = require("./helpers");
const rateLimit_1 = require("./rateLimit");
const rateLimits_1 = require("./constants/rateLimits");
exports.attachConfirmationLocationToGuest = (0, https_1.onCall)(async (req) => {
    const adminUid = (0, helpers_1.assertAdmin)(req);
    // Mirrors the limit on other admin mutations — 30 per hour per admin.
    if (!(0, rateLimit_1.allow)(`attach:${adminUid}`, rateLimits_1.RATE.ATTACH_LOC_PER_ADMIN.limit, rateLimits_1.RATE.ATTACH_LOC_PER_ADMIN.windowMs)) {
        throw new https_1.HttpsError("resource-exhausted", "Too many attach operations; try again later.");
    }
    const confirmationId = (req.data?.confirmationId ?? "").toString();
    const guestId = (req.data?.guestId ?? "").toString();
    if (!confirmationId || !guestId) {
        throw new https_1.HttpsError("invalid-argument", "confirmationId and guestId are required.");
    }
    const db = (0, database_1.getDatabase)();
    const confSnap = await db.ref(`confirmations/${confirmationId}`).get();
    if (!confSnap.exists()) {
        throw new https_1.HttpsError("not-found", "Confirmation not found.");
    }
    const conf = confSnap.val();
    if (!conf?.groomUid) {
        throw new https_1.HttpsError("failed-precondition", "Confirmation has no groomUid.");
    }
    if (typeof conf.lat !== "number" || typeof conf.lng !== "number") {
        throw new https_1.HttpsError("failed-precondition", "Confirmation has no location to attach.");
    }
    const guestRef = db.ref(`guestsByGroom/${conf.groomUid}/${guestId}`);
    const guestSnap = await guestRef.get();
    if (!guestSnap.exists()) {
        throw new https_1.HttpsError("not-found", "Guest not found under this groom.");
    }
    const guestPatch = {
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
//# sourceMappingURL=attachLocation.js.map