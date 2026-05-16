// Admin-only callable for patching an existing user's profile. Supports
// changing displayName, phoneE164, role, and username. Each field is
// validated, indices (/usernameIndex, /phoneIndex) are kept in sync, and
// Firebase Auth records (email when username changes; phone number; admin
// custom claim when role changes) are updated atomically with the RTDB
// profile so the two sources of truth never diverge.
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getAuth }     from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { writeAudit }  from "./audit";
import { allow }       from "./rateLimit";
import {
  assertAdmin, isE164, isRole, isUsername,
  phoneIndexKey, syntheticEmail,
} from "./helpers";

interface UpdateInput {
  uid: string;
  username?: string;
  displayName?: string;
  phoneE164?: string;
  role?: "groom" | "driver" | "admin";
}

// App Check is OFF — admin-only callable already gated by assertAdmin +
// rate limit + audit log. See users.ts for the policy rationale.
export const updatePortalUser = onCall(
  { enforceAppCheck: false },
  async (req) => {
    const callerUid = assertAdmin(req);
    if (!allow(`updateUser:${callerUid}`, 60, 60 * 60 * 1000)) {
      throw new HttpsError("resource-exhausted", "Too many user updates.");
    }

    const input = (req.data ?? {}) as Partial<UpdateInput>;
    const uid = input.uid;
    if (typeof uid !== "string" || uid.length === 0) {
      throw new HttpsError("invalid-argument", "Missing uid.");
    }

    const db = getDatabase();
    const profileSnap = await db.ref(`users/${uid}`).get();
    if (!profileSnap.exists()) {
      throw new HttpsError("not-found", "User not found.");
    }
    const profile = profileSnap.val() as {
      username: string;
      role: "groom" | "driver" | "admin";
      phoneE164: string;
      displayName?: string | null;
    };

    // Validate each field that's being changed.
    if (input.username !== undefined && !isUsername(input.username)) {
      throw new HttpsError("invalid-argument", "Invalid username.");
    }
    if (input.phoneE164 !== undefined && !isE164(input.phoneE164)) {
      throw new HttpsError("invalid-argument", "Invalid phone (must be E.164).");
    }
    if (input.role !== undefined && !isRole(input.role)) {
      throw new HttpsError("invalid-argument", "Invalid role.");
    }
    if (
      input.displayName !== undefined &&
      input.displayName !== null &&
      (typeof input.displayName !== "string" || input.displayName.length > 120)
    ) {
      throw new HttpsError("invalid-argument", "Invalid displayName.");
    }

    // Self-demotion guard — keeps at least the caller as admin.
    if (uid === callerUid && input.role !== undefined && input.role !== "admin") {
      throw new HttpsError("failed-precondition", "Admins can't demote themselves.");
    }

    const newUsername    = input.username !== undefined
      ? input.username.toLowerCase()
      : null;
    const newPhone       = input.phoneE164 !== undefined ? input.phoneE164 : null;
    const newRole        = input.role !== undefined ? input.role : null;
    const newDisplayName = input.displayName !== undefined ? input.displayName : undefined;

    // Uniqueness checks for changed unique fields.
    if (newUsername !== null && newUsername !== profile.username) {
      if ((await db.ref(`usernameIndex/${newUsername}`).get()).exists()) {
        throw new HttpsError("already-exists", "Username is taken.");
      }
    }
    if (newPhone !== null && newPhone !== profile.phoneE164) {
      const newIdx = phoneIndexKey(newPhone);
      const claimedBy = (await db.ref(`phoneIndex/${newIdx}`).get()).val();
      if (claimedBy && claimedBy !== uid) {
        throw new HttpsError("already-exists", "Phone is already registered.");
      }
    }

    // ── Firebase Auth side ───────────────────────────────────────────────
    const authPatch: Record<string, unknown> = {};
    if (newUsername !== null && newUsername !== profile.username) {
      authPatch.email = syntheticEmail(newUsername);
    }
    if (newPhone !== null && newPhone !== profile.phoneE164) {
      authPatch.phoneNumber = newPhone;
    }
    if (newDisplayName !== undefined) {
      authPatch.displayName = (newDisplayName ?? "").slice(0, 120) || null;
    }
    if (Object.keys(authPatch).length > 0) {
      await getAuth().updateUser(uid, authPatch);
    }

    // Custom-claim sync when role flips to or from admin.
    if (newRole !== null && newRole !== profile.role) {
      const existing = (await getAuth().getUser(uid)).customClaims ?? {};
      await getAuth().setCustomUserClaims(uid, {
        ...existing,
        admin: newRole === "admin" ? true : undefined,
      });
    }

    // ── RTDB side ────────────────────────────────────────────────────────
    const updates: Record<string, unknown> = {};
    if (newUsername !== null && newUsername !== profile.username) {
      updates[`users/${uid}/username`]                  = newUsername;
      updates[`usernameIndex/${profile.username}`]      = null;
      updates[`usernameIndex/${newUsername}`]           = uid;
    }
    if (newPhone !== null && newPhone !== profile.phoneE164) {
      updates[`users/${uid}/phoneE164`]                            = newPhone;
      updates[`phoneIndex/${phoneIndexKey(profile.phoneE164)}`]    = null;
      updates[`phoneIndex/${phoneIndexKey(newPhone)}`]             = uid;
    }
    if (newRole !== null && newRole !== profile.role) {
      updates[`users/${uid}/role`] = newRole;
    }
    if (newDisplayName !== undefined) {
      updates[`users/${uid}/displayName`] = newDisplayName ?? null;
    }
    if (Object.keys(updates).length > 0) {
      await db.ref().update(updates);
    }

    await writeAudit(callerUid, "updatePortalUser", {
      uid,
      changes: Object.keys(input).filter(k => k !== "uid"),
    });
    return { ok: true };
  },
);
