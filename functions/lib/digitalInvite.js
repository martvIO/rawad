"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitDigitalGuestInvite = exports.createDigitalGuestInvite = void 0;
// Per-guest digital invite-link callables.
//
//   createDigitalGuestInvite — admin generates a random 32-char token bound
//     to one digital guest (stored in Firestore). Writes /inviteTokens/{token}
//     (90-day TTL) with guestType: "digital" and stamps
//     digitalGuests/{groomUid}/guests/{guestId}.inviteLinkSentAt. The admin
//     Send tab then opens WhatsApp with the resulting /invite/digital/{token}.
//     Sending invite links is admin-only — grooms never self-send.
//
//   submitDigitalGuestInvite — public/unauthenticated callable. The guest
//     opens the link, picks attending|absent and optionally adds a note.
//     We validate the token then patch the Firestore guest document with
//     status + confirmedAt + note, and mark the token used.
const https_1 = require("firebase-functions/v2/https");
const database_1 = require("firebase-admin/database");
const firestore_1 = require("firebase-admin/firestore");
const crypto_1 = require("crypto");
const rateLimit_1 = require("./rateLimit");
const audit_1 = require("./audit");
const helpers_1 = require("./helpers");
const limits_1 = require("./constants/limits");
const rateLimits_1 = require("./constants/rateLimits");
const tokens_1 = require("./constants/tokens");
function clampStr(v, max) {
    return (typeof v === "string" ? v.trim() : "").slice(0, max);
}
exports.createDigitalGuestInvite = (0, https_1.onCall)({ enforceAppCheck: false }, async (req) => {
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Sign in required.");
    const callerUid = req.auth.uid;
    if ((0, helpers_1.getClaims)(req).role !== "admin") {
        throw new https_1.HttpsError("permission-denied", "Admins only.");
    }
    if (!(0, rateLimit_1.allow)(`createDigitalInvite:${callerUid}`, rateLimits_1.RATE.CREATE_DIGITAL_INVITE_PER_USER.limit, rateLimits_1.RATE.CREATE_DIGITAL_INVITE_PER_USER.windowMs)) {
        throw new https_1.HttpsError("resource-exhausted", "Too many invites; please slow down.");
    }
    const data = req.data ?? {};
    const groomUid = (data.groomUid ?? "").toString();
    const guestId = (data.guestId ?? "").toString();
    if (!groomUid || !guestId) {
        throw new https_1.HttpsError("invalid-argument", "groomUid and guestId are required.");
    }
    const fs = (0, firestore_1.getFirestore)();
    const guestRef = fs.doc(`digitalInvitations/${groomUid}/guests/${guestId}`);
    const guestSnap = await guestRef.get();
    if (!guestSnap.exists) {
        throw new https_1.HttpsError("not-found", "Guest not found.");
    }
    const guest = guestSnap.data();
    // Resolve groomUsername from RTDB (the user profile lives there).
    const db = (0, database_1.getDatabase)();
    const u = await db.ref(`users/${groomUid}/username`).get();
    const groomUsername = (u.val() ?? "").toString();
    if (!groomUsername) {
        throw new https_1.HttpsError("failed-precondition", "Groom username unavailable.");
    }
    const now = Date.now();
    const token = (0, crypto_1.randomBytes)(tokens_1.TOKEN_BYTES).toString("hex");
    const expiresAt = now + tokens_1.TOKEN_TTL_MS;
    await db.ref(`inviteTokens/${token}`).set({
        groomUid,
        groomUsername,
        guestId,
        guestName: (guest?.name ?? "").toString().slice(0, limits_1.MAX_LEN.NAME),
        guestPhone: (guest?.phone ?? "").toString().slice(0, limits_1.MAX_LEN.PHONE),
        guestType: "digital",
        createdAt: now,
        expiresAt,
    });
    await guestRef.update({
        inviteLinkToken: token,
        inviteLinkSentAt: now,
    });
    await (0, audit_1.writeAudit)(callerUid, "createDigitalGuestInvite", { groomUid, guestId });
    return { token, expiresAt };
});
exports.submitDigitalGuestInvite = (0, https_1.onCall)({ enforceAppCheck: false }, async (req) => {
    const ip = (req.rawRequest?.ip ?? "unknown").toString();
    if (!(0, rateLimit_1.allow)(`digitalInvite:${ip}`, rateLimits_1.RATE.SUBMIT_DIGITAL_INVITE_PER_IP.limit, rateLimits_1.RATE.SUBMIT_DIGITAL_INVITE_PER_IP.windowMs)) {
        throw new https_1.HttpsError("resource-exhausted", "Too many submissions; please try again later.");
    }
    const data = req.data ?? {};
    const token = (data.token ?? "").toString();
    if (!tokens_1.TOKEN_HEX_RE.test(token)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid token.");
    }
    const rsvpRaw = (data.rsvp ?? "").toString();
    if (rsvpRaw !== "attending" && rsvpRaw !== "absent") {
        throw new https_1.HttpsError("invalid-argument", "rsvp must be 'attending' or 'absent'.");
    }
    const rsvp = rsvpRaw;
    const note = clampStr(data.note, limits_1.MAX_LEN.NOTE);
    const db = (0, database_1.getDatabase)();
    const tokenSnap = await db.ref(`inviteTokens/${token}`).get();
    if (!tokenSnap.exists()) {
        throw new https_1.HttpsError("not-found", "Invite link not found.");
    }
    const tk = tokenSnap.val();
    if (tk.guestType !== "digital") {
        throw new https_1.HttpsError("failed-precondition", "Wrong invite type.");
    }
    if (Date.now() > tk.expiresAt) {
        throw new https_1.HttpsError("deadline-exceeded", "Invite link expired.");
    }
    if (tk.usedAt) {
        throw new https_1.HttpsError("already-exists", "Invite already submitted.");
    }
    const fs = (0, firestore_1.getFirestore)();
    const guestRef = fs.doc(`digitalInvitations/${tk.groomUid}/guests/${tk.guestId}`);
    const guestSnap = await guestRef.get();
    if (!guestSnap.exists) {
        throw new https_1.HttpsError("not-found", "Guest record missing.");
    }
    const now = Date.now();
    const patch = {
        status: rsvp,
        confirmedAt: now,
    };
    if (note)
        patch.note = note;
    await guestRef.update(patch);
    await db.ref(`inviteTokens/${token}/usedAt`).set(now);
    return { ok: true };
});
//# sourceMappingURL=digitalInvite.js.map