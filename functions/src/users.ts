// Admin-only callable functions that manage portal users (grooms / drivers /
// other admins). The client never creates or deletes users directly — that
// would bypass our role + claim + index bookkeeping.
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getAuth }      from "firebase-admin/auth";
import { getDatabase }  from "firebase-admin/database";
import { writeAudit }   from "./audit";
import { allow }        from "./rateLimit";
import {
  assertAdmin, isE164, isRole, isUsername,
  phoneIndexKey, syntheticEmail,
} from "./helpers";

interface CreateInput {
  username: string;
  password: string;
  phoneE164: string;
  role: "groom" | "driver" | "admin";
  displayName?: string;
}

// ── createPortalUser ──────────────────────────────────────────────────────────
export const createPortalUser = onCall(
  { enforceAppCheck: true },
  async (req) => {
    const callerUid = assertAdmin(req);
    if (!allow(`createUser:${callerUid}`, 30, 60 * 60 * 1000)) {
      throw new HttpsError("resource-exhausted", "Too many user-creation attempts.");
    }

    const input = req.data as Partial<CreateInput>;
    if (!isUsername(input.username))       throw new HttpsError("invalid-argument", "Invalid username.");
    if (typeof input.password !== "string" || input.password.length < 8) {
      throw new HttpsError("invalid-argument", "Password must be at least 8 characters.");
    }
    if (!isE164(input.phoneE164))          throw new HttpsError("invalid-argument", "Invalid phone (must be E.164).");
    if (!isRole(input.role))               throw new HttpsError("invalid-argument", "Invalid role.");

    const username  = input.username.toLowerCase();
    const email     = syntheticEmail(username);
    const phoneIdx  = phoneIndexKey(input.phoneE164);

    const db = getDatabase();
    // Uniqueness checks (in addition to Firebase Auth's own email + phone uniqueness).
    if ((await db.ref(`usernameIndex/${username}`).get()).exists()) {
      throw new HttpsError("already-exists", "Username is taken.");
    }
    if ((await db.ref(`phoneIndex/${phoneIdx}`).get()).exists()) {
      throw new HttpsError("already-exists", "Phone is already registered.");
    }

    const userRecord = await getAuth().createUser({
      email,
      password: input.password,
      phoneNumber: input.phoneE164,
      displayName: input.displayName?.slice(0, 120),
      disabled: false,
    });

    // Custom claim for admins so security rules can check auth.token.admin === true.
    if (input.role === "admin") {
      await getAuth().setCustomUserClaims(userRecord.uid, { admin: true });
    }

    const profile = {
      username,
      role: input.role,
      phoneE164: input.phoneE164,
      displayName: input.displayName ?? null,
      createdAt: Date.now(),
      createdBy: callerUid,
    };
    const updates: Record<string, unknown> = {};
    updates[`users/${userRecord.uid}`]      = profile;
    updates[`usernameIndex/${username}`]    = userRecord.uid;
    updates[`phoneIndex/${phoneIdx}`]       = userRecord.uid;
    await db.ref().update(updates);

    await writeAudit(callerUid, "createPortalUser", { uid: userRecord.uid, role: input.role });
    return { uid: userRecord.uid };
  },
);

// ── deletePortalUser ──────────────────────────────────────────────────────────
export const deletePortalUser = onCall(
  { enforceAppCheck: true },
  async (req) => {
    const callerUid = assertAdmin(req);
    const uid = req.data?.uid;
    if (typeof uid !== "string" || uid.length === 0) {
      throw new HttpsError("invalid-argument", "Missing uid.");
    }
    if (uid === callerUid) {
      throw new HttpsError("failed-precondition", "Admins can't delete themselves.");
    }
    if (!allow(`deleteUser:${callerUid}`, 30, 60 * 60 * 1000)) {
      throw new HttpsError("resource-exhausted", "Too many user-deletions.");
    }

    const db = getDatabase();
    const profileSnap = await db.ref(`users/${uid}`).get();
    if (!profileSnap.exists()) {
      throw new HttpsError("not-found", "User not found.");
    }
    const profile = profileSnap.val() as { username: string; phoneE164: string };

    await getAuth().deleteUser(uid).catch(() => { /* may already be gone */ });

    const updates: Record<string, null> = {};
    updates[`users/${uid}`]                                  = null;
    updates[`usernameIndex/${profile.username}`]             = null;
    updates[`phoneIndex/${phoneIndexKey(profile.phoneE164)}`] = null;
    updates[`driverAssignments/${uid}`]                      = null;
    // If they were a groom, blow away their entire data subtree.
    updates[`guestsByGroom/${uid}`]                          = null;
    updates[`liveLocationsByGroom/${uid}`]                   = null;
    await db.ref().update(updates);

    await writeAudit(callerUid, "deletePortalUser", { uid });
    return { ok: true };
  },
);

// ── setAdminClaim ─────────────────────────────────────────────────────────────
// Allows an existing admin to promote / demote another user without deleting
// and re-creating them.
export const setAdminClaim = onCall(
  { enforceAppCheck: true },
  async (req) => {
    const callerUid = assertAdmin(req);
    const uid     = req.data?.uid;
    const isAdmin = req.data?.isAdmin === true;
    if (typeof uid !== "string" || uid.length === 0) {
      throw new HttpsError("invalid-argument", "Missing uid.");
    }
    if (uid === callerUid && !isAdmin) {
      throw new HttpsError("failed-precondition", "Admins can't demote themselves.");
    }

    const existing = (await getAuth().getUser(uid)).customClaims ?? {};
    await getAuth().setCustomUserClaims(uid, { ...existing, admin: isAdmin || undefined });
    await getDatabase().ref(`users/${uid}/role`).set(isAdmin ? "admin" : "groom");

    await writeAudit(callerUid, "setAdminClaim", { uid, isAdmin });
    return { ok: true };
  },
);
