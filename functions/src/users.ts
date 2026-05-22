// Admin-only callable functions that manage portal users (grooms / drivers /
// other admins). The client never creates or deletes users directly — that
// would bypass our role + claim + index bookkeeping.
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getAuth }      from "firebase-admin/auth";
import { getDatabase }  from "firebase-admin/database";
import { writeAudit }   from "./audit";
import { allow }        from "./rateLimit";
import {
  assertAdmin, isE164, isRole, isStrongPassword, isUsername,
  phoneIndexKey, syntheticEmail,
} from "./helpers";
import { MAX_LEN } from "./constants/limits";
import { RATE } from "./constants/rateLimits";

interface CreateInput {
  username: string;
  password: string;
  // Phone is optional for every role. Users without a phone can't do the
  // SMS-OTP password reset — an admin has to reset for them via adminSetPassword.
  phoneE164?: string;
  role: "groom" | "driver" | "admin";
  displayName?: string;
}

// ── createPortalUser ──────────────────────────────────────────────────────────
// App Check is OFF for admin callables: they're already gated by the
// `admin: true` custom claim (assertAdmin) plus per-admin rate limiting
// and an audit log. App Check stays on the public submitConfirmation
// endpoint where it's the primary anti-abuse defense.
export const createPortalUser = onCall(
  { enforceAppCheck: false },
  async (req) => {
    const callerUid = assertAdmin(req);
    if (!allow(`createUser:${callerUid}`, RATE.CREATE_USER_PER_ADMIN.limit, RATE.CREATE_USER_PER_ADMIN.windowMs)) {
      throw new HttpsError("resource-exhausted", "Too many user-creation attempts.");
    }

    const input = req.data as Partial<CreateInput>;
    if (!isUsername(input.username))       throw new HttpsError("invalid-argument", "Invalid username.");
    if (!isStrongPassword(input.password)) {
      throw new HttpsError(
        "invalid-argument",
        "Password must be at least 8 characters and include uppercase, lowercase, and a number.",
      );
    }
    if (!isRole(input.role))               throw new HttpsError("invalid-argument", "Invalid role.");
    // Phone is optional, but if provided it must be valid E.164.
    const hasPhone = typeof input.phoneE164 === "string" && input.phoneE164.length > 0;
    if (hasPhone && !isE164(input.phoneE164)) {
      throw new HttpsError("invalid-argument", "Invalid phone (must be E.164).");
    }

    const username  = input.username.toLowerCase();
    const email     = syntheticEmail(username);
    const phoneIdx  = hasPhone ? phoneIndexKey(input.phoneE164 as string) : null;

    const db = getDatabase();
    // Uniqueness checks (in addition to Firebase Auth's own email + phone uniqueness).
    if ((await db.ref(`usernameIndex/${username}`).get()).exists()) {
      throw new HttpsError("already-exists", "Username is taken.");
    }
    if (phoneIdx && (await db.ref(`phoneIndex/${phoneIdx}`).get()).exists()) {
      throw new HttpsError("already-exists", "Phone is already registered.");
    }

    const createUserPayload: Record<string, unknown> = {
      email,
      password: input.password,
      displayName: input.displayName?.slice(0, MAX_LEN.NAME),
      disabled: false,
    };
    if (hasPhone) createUserPayload.phoneNumber = input.phoneE164;
    const userRecord = await getAuth().createUser(createUserPayload as Parameters<ReturnType<typeof getAuth>["createUser"]>[0]);

    // Custom claims: every user gets `role` and `username` so security rules
    // can branch on auth.token.role === 'admin' (etc.) and audit logs can
    // identify the actor by username without an extra lookup.
    await getAuth().setCustomUserClaims(userRecord.uid, {
      role: input.role,
      username,
    });

    const profile: Record<string, unknown> = {
      username,
      role: input.role,
      displayName: input.displayName ?? null,
      createdAt: Date.now(),
      createdBy: callerUid,
    };
    if (hasPhone) profile.phoneE164 = input.phoneE164;
    const updates: Record<string, unknown> = {};
    updates[`users/${userRecord.uid}`]      = profile;
    updates[`usernameIndex/${username}`]    = userRecord.uid;
    if (phoneIdx) updates[`phoneIndex/${phoneIdx}`] = userRecord.uid;
    await db.ref().update(updates);

    await writeAudit(callerUid, "createPortalUser", { uid: userRecord.uid, role: input.role });
    return { uid: userRecord.uid };
  },
);

// ── deletePortalUser ──────────────────────────────────────────────────────────
export const deletePortalUser = onCall(
  { enforceAppCheck: false },
  async (req) => {
    const callerUid = assertAdmin(req);
    const uid = req.data?.uid;
    if (typeof uid !== "string" || uid.length === 0) {
      throw new HttpsError("invalid-argument", "Missing uid.");
    }
    if (uid === callerUid) {
      throw new HttpsError("failed-precondition", "Admins can't delete themselves.");
    }
    if (!allow(`deleteUser:${callerUid}`, RATE.DELETE_USER_PER_ADMIN.limit, RATE.DELETE_USER_PER_ADMIN.windowMs)) {
      throw new HttpsError("resource-exhausted", "Too many user-deletions.");
    }

    const db = getDatabase();
    const profileSnap = await db.ref(`users/${uid}`).get();
    if (!profileSnap.exists()) {
      throw new HttpsError("not-found", "User not found.");
    }
    const profile = profileSnap.val() as { username: string; phoneE164?: string };

    await getAuth().deleteUser(uid).catch(() => { /* may already be gone */ });

    const updates: Record<string, null> = {};
    updates[`users/${uid}`]                          = null;
    updates[`usernameIndex/${profile.username}`]     = null;
    // Phone index only exists if the profile actually stored one.
    if (profile.phoneE164) {
      updates[`phoneIndex/${phoneIndexKey(profile.phoneE164)}`] = null;
    }
    updates[`driverAssignments/${uid}`]              = null;
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
  { enforceAppCheck: false },
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
    // Drop the legacy `admin: true` field if present; the new shape uses
    // `role: "admin"|"groom"` as the single source of truth.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { admin: _legacyAdmin, ...rest } = existing as Record<string, unknown>;
    const newRole = isAdmin ? "admin" : "groom";
    await getAuth().setCustomUserClaims(uid, { ...rest, role: newRole });
    await getDatabase().ref(`users/${uid}/role`).set(newRole);

    await writeAudit(callerUid, "setAdminClaim", { uid, isAdmin });
    return { ok: true };
  },
);
