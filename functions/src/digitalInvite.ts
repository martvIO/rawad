// Per-guest digital invite-link callables.
//
//   createDigitalGuestInvite — groom (or admin) generates a random 32-char
//     token bound to one digital guest (stored in Firestore). Writes
//     /inviteTokens/{token} (90-day TTL) with guestType: "digital" and stamps
//     digitalGuests/{groomUid}/guests/{guestId}.inviteLinkSentAt. The groom-
//     side UI then opens WhatsApp with the resulting /invite/digital/{token}.
//
//   submitDigitalGuestInvite — public/unauthenticated callable. The guest
//     opens the link, picks attending|absent and optionally adds a note.
//     We validate the token then patch the Firestore guest document with
//     status + confirmedAt + note, and mark the token used.
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getDatabase } from "firebase-admin/database";
import { getFirestore } from "firebase-admin/firestore";
import { randomBytes } from "crypto";
import { allow } from "./rateLimit";
import { writeAudit } from "./audit";
import { getClaims } from "./helpers";

const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_NOTE_LEN = 500;

function clampStr(v: unknown, max: number): string {
  return (typeof v === "string" ? v.trim() : "").slice(0, max);
}

export const createDigitalGuestInvite = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    const callerUid = req.auth.uid;
    const role = getClaims(req).role;
    if (role !== "groom" && role !== "admin") {
      throw new HttpsError("permission-denied", "Groom or admin only.");
    }

    if (!allow(`createDigitalInvite:${callerUid}`, 60, 60 * 60 * 1000)) {
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

    const fs = getFirestore();
    const guestRef = fs.doc(`digitalGuests/${groomUid}/guests/${guestId}`);
    const guestSnap = await guestRef.get();
    if (!guestSnap.exists) {
      throw new HttpsError("not-found", "Guest not found.");
    }
    const guest = guestSnap.data() as { name?: string; phone?: string } | undefined;

    // Resolve groomUsername from RTDB (the user profile lives there).
    const db = getDatabase();
    const u = await db.ref(`users/${groomUid}/username`).get();
    const groomUsername = (u.val() ?? "").toString();
    if (!groomUsername) {
      throw new HttpsError("failed-precondition", "Groom username unavailable.");
    }

    const now = Date.now();
    const token = randomBytes(16).toString("hex");
    const expiresAt = now + TOKEN_TTL_MS;

    await db.ref(`inviteTokens/${token}`).set({
      groomUid,
      groomUsername,
      guestId,
      guestName:  (guest?.name  ?? "").toString().slice(0, 120),
      guestPhone: (guest?.phone ?? "").toString().slice(0, 30),
      guestType: "digital",
      createdAt: now,
      expiresAt,
    });

    await guestRef.update({
      inviteLinkToken:  token,
      inviteLinkSentAt: now,
    });

    await writeAudit(callerUid, "createDigitalGuestInvite", { groomUid, guestId });
    return { token, expiresAt };
  },
);

export const submitDigitalGuestInvite = onCall(
  { enforceAppCheck: false },
  async (req) => {
    const ip = (req.rawRequest?.ip ?? "unknown").toString();
    if (!allow(`digitalInvite:${ip}`, 10, 60 * 60 * 1000)) {
      throw new HttpsError("resource-exhausted", "Too many submissions; please try again later.");
    }

    const data = req.data ?? {};
    const token = (data.token ?? "").toString();
    if (!/^[a-f0-9]{32}$/.test(token)) {
      throw new HttpsError("invalid-argument", "Invalid token.");
    }

    const rsvpRaw = (data.rsvp ?? "").toString();
    if (rsvpRaw !== "attending" && rsvpRaw !== "absent") {
      throw new HttpsError("invalid-argument", "rsvp must be 'attending' or 'absent'.");
    }
    const rsvp: "attending" | "absent" = rsvpRaw;
    const note = clampStr(data.note, MAX_NOTE_LEN);

    const db = getDatabase();
    const tokenSnap = await db.ref(`inviteTokens/${token}`).get();
    if (!tokenSnap.exists()) {
      throw new HttpsError("not-found", "Invite link not found.");
    }
    const tk = tokenSnap.val() as {
      groomUid: string; guestId: string;
      guestType?: string; expiresAt: number; usedAt?: number;
    };
    if (tk.guestType !== "digital") {
      throw new HttpsError("failed-precondition", "Wrong invite type.");
    }
    if (Date.now() > tk.expiresAt) {
      throw new HttpsError("deadline-exceeded", "Invite link expired.");
    }
    if (tk.usedAt) {
      throw new HttpsError("already-exists", "Invite already submitted.");
    }

    const fs = getFirestore();
    const guestRef = fs.doc(`digitalGuests/${tk.groomUid}/guests/${tk.guestId}`);
    const guestSnap = await guestRef.get();
    if (!guestSnap.exists) {
      throw new HttpsError("not-found", "Guest record missing.");
    }

    const now = Date.now();
    const patch: Record<string, unknown> = {
      status: rsvp,
      confirmedAt: now,
    };
    if (note) patch.note = note;

    await guestRef.update(patch);
    await db.ref(`inviteTokens/${token}/usedAt`).set(now);

    return { ok: true };
  },
);
