// User domain module — the deep interface behind which every /users invariant
// lives: that `/usernameIndex` and `/phoneIndex` stay consistent with
// `/users/{uid}`, that Firebase Auth custom claims (`role`, `username`) stay in
// sync, and that admins can't demote/delete/reset themselves. The five legacy
// onCall paths (create/update/delete/setAdminClaim/adminSetPassword) plus the
// direct-RTDB profile reads all funnel through here.
//
// It owns NO HTTP and NO Express types: it throws `DomainError(code)` with the
// exact tokens the handlers used to emit, and the route maps those to statuses.
// It owns NO Firebase SDK access: it takes narrow ports, so the whole module is
// unit-testable with in-memory fakes (see tests/functions/userStore.test.ts).
//
// Behaviour is a verbatim lift of the pre-extraction users.ts handlers. The one
// documented micro-change: a raw infra throw during the profile-existence read
// in updateUser/deleteUser now surfaces under the route's update_failed/
// delete_failed fallback instead of read_failed — the not_found (404) case is
// unchanged, only the 500 slug for an actual DB read failure mid-operation.

import {
  isE164,
  isRole,
  isStrongPassword,
  isUsername,
  phoneIndexKey,
  syntheticEmail,
} from "../../helpers";
import { MAX_LEN } from "../../constants/limits";
import { DomainError } from "../httpError";
import { AuditPort, AuthPort, Clock, DbPort } from "../ports";
import {
  CreateUserInput,
  ExistingUserProfile,
  UpdateUserInput,
} from "./types";

const MAX_DISPLAY_NAME_LEN = MAX_LEN.NAME;

export interface UserStore {
  // Reads
  listUsers(): Promise<Array<{ uid: string; id: string } & Record<string, unknown>>>;
  getUser(uid: string): Promise<Record<string, unknown> | null>;
  listGroomProfiles(): Promise<Array<{ uid: string; id: string } & Record<string, unknown>>>;

  // Privileged mutations (the duplicated invariant, now centralized)
  createUser(input: CreateUserInput, callerUid: string): Promise<{ uid: string }>;
  updateUser(uid: string, input: UpdateUserInput, callerUid: string): Promise<void>;
  deleteUser(uid: string, callerUid: string): Promise<void>;
  setRole(uid: string, isAdmin: boolean, callerUid: string): Promise<void>;
  setPassword(uid: string, newPassword: unknown, callerUid: string): Promise<void>;

  // Non-Auth-synced profile patch (the PATCH /:uid allowlist is parsed by the
  // route; this just persists the already-validated `safe` fields + audits).
  patchProfileFields(
    uid: string,
    safe: Record<string, unknown>,
    callerUid: string,
  ): Promise<void>;

  // Public groom-profile lookup table
  upsertGroomProfile(uid: string, username: unknown, displayName: unknown): Promise<void>;
  removeGroomProfile(uid: string): Promise<void>;
}

export function makeUserStore(deps: {
  db: DbPort;
  auth: AuthPort;
  audit: AuditPort;
  now: Clock;
}): UserStore {
  const { db, auth, audit, now } = deps;

  return {
    async listUsers() {
      const val = ((await db.get("users")) ?? {}) as Record<string, unknown>;
      return Object.entries(val).map(([uid, data]) => ({
        uid,
        id: uid,
        ...(data as Record<string, unknown>),
      }));
    },

    async getUser(uid) {
      return (await db.get(`users/${uid}`)) as Record<string, unknown> | null;
    },

    async listGroomProfiles() {
      const val = ((await db.get("groomProfiles")) ?? {}) as Record<string, unknown>;
      return Object.entries(val).map(([uid, data]) => ({
        uid,
        id: uid,
        ...(data as Record<string, unknown>),
      }));
    },

    async createUser(input, callerUid) {
      if (!isUsername(input.username)) throw new DomainError("invalid_username");
      if (!isStrongPassword(input.password)) throw new DomainError("weak_password");
      if (!isRole(input.role)) throw new DomainError("invalid_role");
      const hasPhone =
        typeof input.phoneE164 === "string" && input.phoneE164.length > 0;
      if (hasPhone && !isE164(input.phoneE164)) {
        throw new DomainError("invalid_phone");
      }

      const username = input.username.toLowerCase();
      const email = syntheticEmail(username);
      const phoneIdx = hasPhone ? phoneIndexKey(input.phoneE164 as string) : null;

      if ((await db.get(`usernameIndex/${username}`)) !== null) {
        throw new DomainError("username_taken");
      }
      if (phoneIdx && (await db.get(`phoneIndex/${phoneIdx}`)) !== null) {
        throw new DomainError("phone_taken");
      }

      const createUserPayload: {
        email: string;
        password: string;
        displayName?: string;
        disabled: boolean;
        phoneNumber?: string;
      } = {
        email,
        password: input.password,
        displayName: input.displayName?.slice(0, MAX_DISPLAY_NAME_LEN),
        disabled: false,
      };
      if (hasPhone) createUserPayload.phoneNumber = input.phoneE164;

      const userRecord = await auth.createUser(createUserPayload);

      await auth.setCustomUserClaims(userRecord.uid, {
        role: input.role,
        username,
      });

      const profile: Record<string, unknown> = {
        username,
        role: input.role,
        displayName: input.displayName ?? null,
        createdAt: now(),
        createdBy: callerUid,
      };
      if (hasPhone) profile.phoneE164 = input.phoneE164;
      // Per-groom feature flags — default ON for backward-compatibility.
      profile.canSeeAttendance = input.canSeeAttendance !== false;
      profile.canUsePhotographer = input.canUsePhotographer !== false;
      // Boarding-pass / wallet feature defaults OFF — needs Apple/Google
      // credentials the admin enables deliberately per groom.
      profile.canUseBoardingPass = input.canUseBoardingPass === true;

      const updates: Record<string, unknown> = {};
      updates[`users/${userRecord.uid}`] = profile;
      updates[`usernameIndex/${username}`] = userRecord.uid;
      if (phoneIdx) updates[`phoneIndex/${phoneIdx}`] = userRecord.uid;
      await db.update(updates);

      await audit(callerUid, "createPortalUser", {
        uid: userRecord.uid,
        role: input.role,
      });
      return { uid: userRecord.uid };
    },

    async updateUser(uid, input, callerUid) {
      const existing = await db.get(`users/${uid}`);
      if (existing === null) throw new DomainError("not_found");
      const profile = existing as ExistingUserProfile;

      // Per-field validation
      if (input.username !== undefined && !isUsername(input.username)) {
        throw new DomainError("invalid_username");
      }
      if (input.phoneE164 !== undefined && !isE164(input.phoneE164)) {
        throw new DomainError("invalid_phone");
      }
      if (input.role !== undefined && !isRole(input.role)) {
        throw new DomainError("invalid_role");
      }
      if (
        input.displayName !== undefined &&
        input.displayName !== null &&
        (typeof input.displayName !== "string" ||
          input.displayName.length > MAX_DISPLAY_NAME_LEN)
      ) {
        throw new DomainError("invalid_display_name");
      }
      if (uid === callerUid && input.role !== undefined && input.role !== "admin") {
        throw new DomainError("cannot_self_demote");
      }

      const newUsername =
        input.username !== undefined ? input.username.toLowerCase() : null;
      const newPhone = input.phoneE164 !== undefined ? input.phoneE164 : null;
      const newRole = input.role !== undefined ? input.role : null;
      const newDisplayName =
        input.displayName !== undefined ? input.displayName : undefined;

      // Uniqueness for changed unique fields
      if (newUsername !== null && newUsername !== profile.username) {
        if ((await db.get(`usernameIndex/${newUsername}`)) !== null) {
          throw new DomainError("username_taken");
        }
      }
      if (newPhone !== null && newPhone !== profile.phoneE164) {
        const newIdx = phoneIndexKey(newPhone);
        const claimedBy = await db.get(`phoneIndex/${newIdx}`);
        if (claimedBy && claimedBy !== uid) {
          throw new DomainError("phone_taken");
        }
      }

      // Firebase Auth side
      const authPatch: Record<string, unknown> = {};
      if (newUsername !== null && newUsername !== profile.username) {
        authPatch.email = syntheticEmail(newUsername);
      }
      if (newPhone !== null && newPhone !== profile.phoneE164) {
        authPatch.phoneNumber = newPhone;
      }
      if (newDisplayName !== undefined) {
        authPatch.displayName =
          (newDisplayName ?? "").slice(0, MAX_DISPLAY_NAME_LEN) || null;
      }
      if (Object.keys(authPatch).length > 0) {
        await auth.updateUser(uid, authPatch);
      }

      // Claim sync — re-mint when role or username changes
      const roleChanged = newRole !== null && newRole !== profile.role;
      const usernameChanged =
        newUsername !== null && newUsername !== profile.username;
      if (roleChanged || usernameChanged) {
        const existingClaims = (await auth.getUser(uid)).customClaims ?? {};
        // Strip the legacy `admin: true` field; new shape uses `role`.
        const { admin: _legacy, ...rest } = existingClaims as Record<string, unknown>;
        void _legacy;
        await auth.setCustomUserClaims(uid, {
          ...rest,
          role: newRole ?? profile.role,
          username: newUsername ?? profile.username,
        });
      }

      // RTDB side
      const updates: Record<string, unknown> = {};
      if (newUsername !== null && newUsername !== profile.username) {
        updates[`users/${uid}/username`] = newUsername;
        updates[`usernameIndex/${profile.username}`] = null;
        updates[`usernameIndex/${newUsername}`] = uid;
      }
      if (newPhone !== null && newPhone !== profile.phoneE164) {
        updates[`users/${uid}/phoneE164`] = newPhone;
        if (profile.phoneE164) {
          updates[`phoneIndex/${phoneIndexKey(profile.phoneE164)}`] = null;
        }
        updates[`phoneIndex/${phoneIndexKey(newPhone)}`] = uid;
      }
      if (newRole !== null && newRole !== profile.role) {
        updates[`users/${uid}/role`] = newRole;
      }
      if (newDisplayName !== undefined) {
        updates[`users/${uid}/displayName`] = newDisplayName ?? null;
      }
      if (Object.keys(updates).length > 0) {
        await db.update(updates);
      }

      await audit(callerUid, "updatePortalUser", {
        uid,
        changes: Object.keys(input),
      });
    },

    async deleteUser(uid, callerUid) {
      if (uid === callerUid) throw new DomainError("cannot_self_delete");

      const existing = await db.get(`users/${uid}`);
      if (existing === null) throw new DomainError("not_found");
      const profile = existing as ExistingUserProfile;

      // Best-effort Auth deletion — the user record may already be gone from a
      // partial earlier delete; we still want to clean RTDB.
      await auth.deleteUser(uid).catch(() => {
        /* may already be gone */
      });

      const updates: Record<string, null> = {};
      updates[`users/${uid}`] = null;
      updates[`usernameIndex/${profile.username}`] = null;
      if (profile.phoneE164) {
        updates[`phoneIndex/${phoneIndexKey(profile.phoneE164)}`] = null;
      }
      updates[`driverAssignments/${uid}`] = null;
      updates[`guestsByGroom/${uid}`] = null;
      updates[`liveLocationsByGroom/${uid}`] = null;
      await db.update(updates);

      await audit(callerUid, "deletePortalUser", { uid });
    },

    async setRole(uid, isAdmin, callerUid) {
      if (uid === callerUid && !isAdmin) {
        throw new DomainError("cannot_self_demote");
      }
      const existing = (await auth.getUser(uid)).customClaims ?? {};
      // Strip the legacy `admin: true` field.
      const { admin: _legacy, ...rest } = existing as Record<string, unknown>;
      void _legacy;
      const newRole = isAdmin ? "admin" : "groom";
      await auth.setCustomUserClaims(uid, { ...rest, role: newRole });
      await db.set(`users/${uid}/role`, newRole);
      await audit(callerUid, "setAdminClaim", { uid, isAdmin });
    },

    async setPassword(uid, newPassword, callerUid) {
      if (!isStrongPassword(newPassword)) throw new DomainError("weak_password");
      if (uid === callerUid) throw new DomainError("cannot_self_set");

      try {
        await auth.getUser(uid); // 404s if missing
      } catch {
        throw new DomainError("not_found");
      }

      await auth.updateUser(uid, { password: newPassword });
      await auth.revokeRefreshTokens(uid);
      await audit(callerUid, "adminSetPassword", { uid });
    },

    async patchProfileFields(uid, safe, callerUid) {
      const updates: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(safe)) {
        updates[`users/${uid}/${key}`] = value;
      }
      await db.update(updates);
      await audit(callerUid, "patchPortalUser", {
        uid,
        fields: Object.keys(safe),
      });
    },

    async upsertGroomProfile(uid, username, displayName) {
      if (typeof username !== "string" || username.length === 0) {
        throw new DomainError("missing_username");
      }
      const data: Record<string, string> = { username };
      if (typeof displayName === "string" && displayName.length > 0) {
        data.displayName = displayName.slice(0, MAX_DISPLAY_NAME_LEN);
      }
      await db.set(`groomProfiles/${uid}`, data);
    },

    async removeGroomProfile(uid) {
      await db.remove(`groomProfiles/${uid}`);
    },
  };
}
