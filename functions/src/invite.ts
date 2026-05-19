// Per-guest invite-link callables.
//
//   createGuestInvite — groom (or admin) generates a random 32-char token
//     bound to one guest. Writes /inviteTokens/{token} (90-day TTL) and stamps
//     the guest record with inviteLinkToken + inviteLinkSentAt. The groom-side
//     UI then opens WhatsApp with the resulting /invite/{token} URL.
//
//   submitGuestInvite — public/unauthenticated callable. The guest opens the
//     link, fills in city/location/note, and submits. We look up the token,
//     reject if expired, then patch the guest record directly (area, lat/lng,
//     deliveryNote) and mark the token used. No "admin attach" step needed.
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getDatabase } from "firebase-admin/database";
import { randomBytes } from "crypto";
import { allow } from "./rateLimit";
import { writeAudit } from "./audit";
import { getClaims, isFiniteInRange, normalisePhone } from "./helpers";

const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const MAX_LEN = {
  submittedName:   120,
  submittedPhone:  30,
  submittedCity:   80,
  submittedStreet: 120,
  submittedHouse:  20,
  deliveryNote:    240,
};

function clampStr(v: unknown, max: number): string {
  return (typeof v === "string" ? v.trim() : "").slice(0, max);
}

// Groom/admin → mint a new token for a specific guest under this groom.
// Returns { token } so the client can build the /invite/{token} URL.
export const createGuestInvite = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    const callerUid = req.auth.uid;
    const role = getClaims(req).role;
    if (role !== "groom" && role !== "admin") {
      throw new HttpsError("permission-denied", "Groom or admin only.");
    }

    // Per-caller rate limit — 60 invite creations per hour.
    if (!allow(`createInvite:${callerUid}`, 60, 60 * 60 * 1000)) {
      throw new HttpsError("resource-exhausted", "Too many invites; please slow down.");
    }

    const data = req.data ?? {};
    const groomUid = (data.groomUid ?? "").toString();
    const guestId  = (data.guestId  ?? "").toString();
    if (!groomUid || !guestId) {
      throw new HttpsError("invalid-argument", "groomUid and guestId are required.");
    }
    if (role === "groom" && groomUid !== callerUid) {
      throw new HttpsError("permission-denied", "Grooms can only invite their own guests.");
    }

    const db = getDatabase();
    const guestSnap = await db.ref(`guestsByGroom/${groomUid}/${guestId}`).get();
    if (!guestSnap.exists()) {
      throw new HttpsError("not-found", "Guest not found.");
    }
    const guest = guestSnap.val() as {
      name?: string; phone?: string; groomUsername?: string;
    } | null;

    // Resolve groomUsername — denormalised on most guest records, but fall
    // back to /users/{uid}/username if missing so the invite page can show it.
    let groomUsername = (guest?.groomUsername ?? "").toString();
    if (!groomUsername) {
      const u = await db.ref(`users/${groomUid}/username`).get();
      groomUsername = (u.val() ?? "").toString();
    }
    if (!groomUsername) {
      throw new HttpsError("failed-precondition", "Groom username unavailable.");
    }

    const now = Date.now();
    const token = randomBytes(16).toString("hex"); // 32 hex chars, 128 bits
    const expiresAt = now + TOKEN_TTL_MS;

    await db.ref(`inviteTokens/${token}`).set({
      groomUid,
      groomUsername,
      guestId,
      guestName:  (guest?.name  ?? "").toString().slice(0, 120),
      guestPhone: (guest?.phone ?? "").toString().slice(0, 30),
      createdAt: now,
      expiresAt,
    });

    await db.ref(`guestsByGroom/${groomUid}/${guestId}`).update({
      inviteLinkToken:  token,
      inviteLinkSentAt: now,
    });

    await writeAudit(callerUid, "createGuestInvite", { groomUid, guestId });
    return { token, expiresAt };
  },
);

// Public callable — the guest submits their details via the invite link.
// Validates the token, then patches the guest record with the new fields.
export const submitGuestInvite = onCall(
  { enforceAppCheck: false },
  async (req) => {
    const ip = (req.rawRequest?.ip ?? "unknown").toString();
    if (!allow(`invite:${ip}`, 5, 60 * 60 * 1000)) {
      throw new HttpsError("resource-exhausted", "Too many submissions; please try again later.");
    }

    const data = req.data ?? {};
    const token = (data.token ?? "").toString();
    if (!/^[a-f0-9]{32}$/.test(token)) {
      throw new HttpsError("invalid-argument", "Invalid token.");
    }

    const db = getDatabase();
    const tokenSnap = await db.ref(`inviteTokens/${token}`).get();
    if (!tokenSnap.exists()) {
      throw new HttpsError("not-found", "Invite link not found.");
    }
    const tk = tokenSnap.val() as {
      groomUid: string; guestId: string;
      expiresAt: number; usedAt?: number;
    };
    if (Date.now() > tk.expiresAt) {
      throw new HttpsError("deadline-exceeded", "Invite link expired.");
    }

    const submittedName   = clampStr(data.submittedName,   MAX_LEN.submittedName);
    const submittedPhone  = clampStr(data.submittedPhone,  MAX_LEN.submittedPhone);
    const submittedCity   = clampStr(data.submittedCity,   MAX_LEN.submittedCity);
    const submittedStreet = clampStr(data.submittedStreet, MAX_LEN.submittedStreet);
    const submittedHouse  = clampStr(data.submittedHouse,  MAX_LEN.submittedHouse);
    const deliveryNote    = clampStr(data.deliveryNote,    MAX_LEN.deliveryNote);

    if (!submittedName || !submittedPhone || !submittedCity) {
      throw new HttpsError("invalid-argument", "Name, phone and city are required.");
    }
    if (!normalisePhone(submittedPhone)) {
      throw new HttpsError("invalid-argument", "Invalid phone number.");
    }

    const hasCoords = isFiniteInRange(data.lat, -90, 90) && isFiniteInRange(data.lng, -180, 180);
    const lat = hasCoords ? (data.lat as number) : null;
    const lng = hasCoords ? (data.lng as number) : null;
    const locationAccuracy = isFiniteInRange(data.locationAccuracy, 0, 100000)
      ? (data.locationAccuracy as number) : null;
    const locationSourceRaw = (data.locationSource ?? "").toString();
    const locationSource: "gps" | "manual" =
      locationSourceRaw === "gps" || locationSourceRaw === "manual"
        ? locationSourceRaw : (hasCoords ? "gps" : "manual");

    // Build the human-readable address. Uses Arabic comma "، " to match the
    // rest of the app's joined-address conventions (see useConfirmationData).
    const area = [submittedCity, submittedStreet, submittedHouse]
      .filter(Boolean)
      .join("، ");

    const guestRef = db.ref(`guestsByGroom/${tk.groomUid}/${tk.guestId}`);
    const guestSnap = await guestRef.get();
    if (!guestSnap.exists()) {
      throw new HttpsError("not-found", "Guest record missing.");
    }

    const guestPatch: Record<string, unknown> = {
      name:  submittedName,
      phone: submittedPhone,
      area,
    };
    if (deliveryNote) guestPatch.deliveryNote = deliveryNote;
    if (hasCoords) {
      guestPatch.lat = lat;
      guestPatch.lng = lng;
      guestPatch.locationSource    = locationSource;
      guestPatch.locationUpdatedAt = Date.now();
      if (locationAccuracy !== null) guestPatch.locationAccuracy = locationAccuracy;
    }

    await guestRef.update(guestPatch);
    await db.ref(`inviteTokens/${token}/usedAt`).set(Date.now());

    return { ok: true };
  },
);
