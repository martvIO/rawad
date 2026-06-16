"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitConfirmation = void 0;
// Public guest-confirmation submission. Unauthenticated by design (the guest
// has no portal account), so abuse protection lives here:
//   - Per-IP rate limit (5/hr) — the sole abuse gate.
//   - Strict schema + length validation.
//   - Direct client writes to /confirmations are blocked by rules.
// App Check was removed project-wide; this endpoint stays open and is
// protected by the rate limit alone.
const https_1 = require("firebase-functions/v2/https");
const database_1 = require("firebase-admin/database");
const rateLimit_1 = require("./rateLimit");
const helpers_1 = require("./helpers");
const limits_1 = require("./constants/limits");
const rateLimits_1 = require("./constants/rateLimits");
function clampStr(v, max) {
    return (typeof v === "string" ? v.trim() : "").slice(0, max);
}
exports.submitConfirmation = (0, https_1.onCall)({ enforceAppCheck: false }, async (req) => {
    // Per-IP rate limit: 5 submissions per hour, per IP.
    const ip = (req.rawRequest?.ip ?? "unknown").toString();
    if (!(0, rateLimit_1.allow)(`confirm:${ip}`, rateLimits_1.RATE.CONFIRM_PER_IP.limit, rateLimits_1.RATE.CONFIRM_PER_IP.windowMs)) {
        throw new https_1.HttpsError("resource-exhausted", "Too many submissions; please try again later.");
    }
    const data = req.data ?? {};
    const groomUsername = (data.groomUsername ?? "").toString().toLowerCase();
    if (!(0, helpers_1.isUsername)(groomUsername)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid groom.");
    }
    const submittedName = clampStr(data.submittedName, limits_1.MAX_LEN.NAME);
    const submittedPhone = clampStr(data.submittedPhone, limits_1.MAX_LEN.PHONE);
    const submittedCity = clampStr(data.submittedCity, limits_1.MAX_LEN.CITY);
    const submittedStreet = clampStr(data.submittedStreet, limits_1.MAX_LEN.STREET);
    const submittedHouse = clampStr(data.submittedHouse, limits_1.MAX_LEN.HOUSE);
    if (!submittedName || !submittedPhone || !submittedCity) {
        throw new https_1.HttpsError("invalid-argument", "Name, phone and city are required.");
    }
    if (submittedName.split(/\s+/).filter(Boolean).length < 2) {
        throw new https_1.HttpsError("invalid-argument", "Please enter a full name.");
    }
    if (!(0, helpers_1.normalisePhone)(submittedPhone)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid phone number.");
    }
    // Optional GPS fields. Both lat AND lng must be valid finite numbers in
    // range to count; either-or is rejected to avoid half-set coords.
    const hasCoords = (0, helpers_1.isFiniteInRange)(data.lat, -90, 90) && (0, helpers_1.isFiniteInRange)(data.lng, -180, 180);
    const lat = hasCoords ? data.lat : null;
    const lng = hasCoords ? data.lng : null;
    const locationAccuracy = (0, helpers_1.isFiniteInRange)(data.locationAccuracy, 0, 100000)
        ? data.locationAccuracy : null;
    const db = (0, database_1.getDatabase)();
    const groomUidSnap = await db.ref(`usernameIndex/${groomUsername}`).get();
    if (!groomUidSnap.exists()) {
        // Don't leak whether the groom username exists — return success-ish.
        // Actually for a confirmation form pointed at a real link, a missing
        // groom is most likely a typo in the URL; surface a generic error.
        throw new https_1.HttpsError("not-found", "Unknown groom.");
    }
    const groomUid = groomUidSnap.val();
    const confRef = db.ref("confirmations").push();
    const confRecord = {
        groomUid,
        groomUsername, // denormed so the admin tab can show it without a users lookup
        submittedName, submittedPhone, submittedCity, submittedStreet, submittedHouse,
        confirmedAt: Date.now(),
    };
    if (hasCoords) {
        confRecord.lat = lat;
        confRecord.lng = lng;
        confRecord.locationCapturedAt = Date.now();
        if (locationAccuracy !== null)
            confRecord.locationAccuracy = locationAccuracy;
    }
    await confRef.set(confRecord);
    // Auto-attach: if exactly one guest under this groom matches the submitted
    // phone (after normalisation), mark it confirmed; opportunistically copy
    // GPS coords too when the submission included them and the guest has none.
    // Best-effort — failure here doesn't fail the overall submission.
    let attachedGuestId = null;
    try {
        const target = (0, helpers_1.normalisePhoneForMatching)(submittedPhone);
        if (target) {
            const guestsSnap = await db.ref(`guestsByGroom/${groomUid}`).get();
            const matches = [];
            guestsSnap.forEach((g) => {
                const v = g.val();
                if (v && (0, helpers_1.normalisePhoneForMatching)(v.phone ?? "") === target) {
                    if (g.key)
                        matches.push(g.key);
                }
                return false;
            });
            if (matches.length === 1) {
                const guestId = matches[0];
                const guestVal = guestsSnap.child(guestId).val();
                const now = Date.now();
                const guestPatch = {
                    confirmedAt: now,
                };
                if (hasCoords && guestVal && typeof guestVal.lat !== "number") {
                    guestPatch.lat = lat;
                    guestPatch.lng = lng;
                    guestPatch.locationSource = "gps";
                    guestPatch.locationUpdatedAt = now;
                    if (locationAccuracy !== null)
                        guestPatch.locationAccuracy = locationAccuracy;
                }
                await db.ref(`guestsByGroom/${groomUid}/${guestId}`).update(guestPatch);
                await confRef.update({ attachedGuestId: guestId });
                attachedGuestId = guestId;
            }
        }
    }
    catch (e) {
        console.warn("submitConfirmation: auto-attach failed", e);
    }
    return { ok: true, id: confRef.key, attachedGuestId };
});
//# sourceMappingURL=confirmations.js.map