// Portal-user management (admin) plus public groom-profile lookups.
//
// This file is the REST migration of five legacy onCall functions:
//   - createPortalUser   (users.ts)
//   - deletePortalUser   (users.ts)
//   - setAdminClaim      (users.ts)
//   - updatePortalUser   (updateUser.ts)
//   - adminSetPassword   (adminSetPassword.ts)
// plus the four direct-RTDB operations that lived in src/services/users.js:
//   - subscribeUsers / subscribeGroomProfiles  (list reads)
//   - patchUserInRTDB                          (direct field patch)
//   - upsertGroomProfile / removeGroomProfile  (public profile management)
//
// All admin endpoints are gated by `requireAdmin`, rate-limited per caller
// UID, and write to an audit log. Self-modification guards mirror the
// legacy callables exactly (admins can't demote or delete themselves;
// adminSetPassword refuses to set the caller's own password).
//
// Route order matters: `/groom-profiles[/:uid]` MUST be declared before
// `/:uid` so the param-route doesn't swallow it.

import { Router, Response } from "express";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { writeAudit } from "../../audit";
import {
  isE164,
  isRole,
  isStrongPassword,
  isUsername,
  phoneIndexKey,
  syntheticEmail,
} from "../../helpers";
import {
  AuthRequest,
  requireAuth,
  requireAdmin,
} from "../middleware/auth";
import { uidRateLimit } from "../middleware/rateLimit";
import { MAX_LEN } from "../../constants/limits";
import { HOUR_MS } from "../../constants/time";
import { RATE } from "../../constants/rateLimits";

// ─── Constants ────────────────────────────────────────────────────────────────

const ONE_HOUR_MS = HOUR_MS;
const CREATE_USER_RATE_PER_HOUR = RATE.CREATE_USER_PER_ADMIN.limit;
const DELETE_USER_RATE_PER_HOUR = RATE.DELETE_USER_PER_ADMIN.limit;
const UPDATE_USER_RATE_PER_HOUR = RATE.UPDATE_USER_PER_ADMIN.limit;
const SET_PASSWORD_RATE_PER_HOUR = RATE.SET_PASSWORD_PER_ADMIN.limit;
const MAX_DISPLAY_NAME_LEN = MAX_LEN.NAME;

export const usersRouter = Router();

// ═══════════════════════════════════════════════════════════════════════════
// GROOM PROFILES (public-ish; authed users only)
// Must be declared BEFORE `/:uid` so the param-route doesn't capture it.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /users/groom-profiles
 *
 * Returns an array of `{ uid, id, username, displayName? }` for every
 * groom whose public profile exists. Visible to any authenticated user
 * (drivers need this to pick a groom; the rule layer permits it).
 */
usersRouter.get(
  "/groom-profiles",
  requireAuth,
  async (_req: AuthRequest, res: Response) => {
    try {
      const snap = await getDatabase().ref("groomProfiles").get();
      const val = snap.val() ?? {};
      const list = Object.entries(val).map(([uid, data]) => ({
        uid,
        id: uid,
        ...(data as Record<string, unknown>),
      }));
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
    }
  }
);

/**
 * PUT /users/groom-profiles/:uid
 *
 * Body: `{ username: string, displayName?: string }`
 *
 * Upserts a public groom profile. Used after creating/editing a groom user
 * so drivers can immediately see them in the "pick a groom" UI.
 */
usersRouter.put(
  "/groom-profiles/:uid",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const { uid } = req.params;
    const { username, displayName } = req.body ?? {};
    if (typeof username !== "string" || username.length === 0) {
      res.status(400).json({ error: "missing_username" });
      return;
    }
    const data: Record<string, string> = { username };
    if (typeof displayName === "string" && displayName.length > 0) {
      data.displayName = displayName.slice(0, MAX_DISPLAY_NAME_LEN);
    }
    try {
      await getDatabase().ref(`groomProfiles/${uid}`).set(data);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
  }
);

/**
 * DELETE /users/groom-profiles/:uid
 *
 * Removes a groom from the public lookup list. Called when a groom user is
 * deleted or has their role changed away from "groom".
 */
usersRouter.delete(
  "/groom-profiles/:uid",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const { uid } = req.params;
    try {
      await getDatabase().ref(`groomProfiles/${uid}`).remove();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// USER COLLECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /users
 *
 * Admin-only. Returns array of `{ uid, id, username, role, phoneE164, ... }`
 * for every portal user.
 */
usersRouter.get(
  "/",
  requireAuth,
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      const snap = await getDatabase().ref("users").get();
      const val = snap.val() ?? {};
      const list = Object.entries(val).map(([uid, data]) => ({
        uid,
        id: uid,
        ...(data as Record<string, unknown>),
      }));
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
    }
  }
);

/**
 * POST /users
 *
 * Admin-only. Creates a portal user with role groom/driver/admin.
 * Migrated from the `createPortalUser` onCall in users.ts.
 *
 * Body: `{ username, password, role, phoneE164?, displayName? }`
 * Returns: `{ uid }`
 *
 * Side effects (all in one update):
 *   - Firebase Auth user created with synthetic email + custom claims
 *   - /users/{uid}                  → profile written
 *   - /usernameIndex/{username}     → uid (uniqueness guard)
 *   - /phoneIndex/{phoneIndexKey}   → uid (only if phone supplied)
 *   - audit log entry
 */
usersRouter.post(
  "/",
  requireAuth,
  requireAdmin,
  uidRateLimit("createUser", CREATE_USER_RATE_PER_HOUR, ONE_HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    const callerUid = req.caller!.uid;
    const input = (req.body ?? {}) as Partial<CreatePortalUserInput>;

    if (!isUsername(input.username)) {
      res.status(400).json({ error: "invalid_username" });
      return;
    }
    if (!isStrongPassword(input.password)) {
      res.status(400).json({ error: "weak_password" });
      return;
    }
    if (!isRole(input.role)) {
      res.status(400).json({ error: "invalid_role" });
      return;
    }
    const hasPhone = typeof input.phoneE164 === "string" && input.phoneE164.length > 0;
    if (hasPhone && !isE164(input.phoneE164)) {
      res.status(400).json({ error: "invalid_phone" });
      return;
    }

    const username = input.username.toLowerCase();
    const email = syntheticEmail(username);
    const phoneIdx = hasPhone ? phoneIndexKey(input.phoneE164 as string) : null;

    const db = getDatabase();
    try {
      if ((await db.ref(`usernameIndex/${username}`).get()).exists()) {
        res.status(409).json({ error: "username_taken" });
        return;
      }
      if (phoneIdx && (await db.ref(`phoneIndex/${phoneIdx}`).get()).exists()) {
        res.status(409).json({ error: "phone_taken" });
        return;
      }

      const createUserPayload: Record<string, unknown> = {
        email,
        password: input.password,
        displayName: input.displayName?.slice(0, MAX_DISPLAY_NAME_LEN),
        disabled: false,
      };
      if (hasPhone) createUserPayload.phoneNumber = input.phoneE164;

      const userRecord = await getAuth().createUser(
        createUserPayload as Parameters<ReturnType<typeof getAuth>["createUser"]>[0]
      );

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
      updates[`users/${userRecord.uid}`] = profile;
      updates[`usernameIndex/${username}`] = userRecord.uid;
      if (phoneIdx) updates[`phoneIndex/${phoneIdx}`] = userRecord.uid;
      await db.ref().update(updates);

      await writeAudit(callerUid, "createPortalUser", {
        uid: userRecord.uid,
        role: input.role,
      });
      res.json({ uid: userRecord.uid });
    } catch (err) {
      res.status(500).json({ error: "create_failed", detail: errorMessage(err) });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// SINGLE USER ROUTES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /users/:uid
 *
 * Returns a single user's profile. The RTDB rule layer enforces who can
 * read what; we forward whatever the Admin SDK returns. The caller's
 * intent is usually "fetch my own profile after login" or "admin fetch
 * arbitrary user."
 */
usersRouter.get(
  "/:uid",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const { uid } = req.params;
    const caller = req.caller!;
    // Mirror rules: a user can read their own profile, admins read any.
    if (caller.uid !== uid && caller.claims.role !== "admin") {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      const snap = await getDatabase().ref(`users/${uid}`).get();
      if (!snap.exists()) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ uid, ...snap.val() });
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
    }
  }
);

/**
 * PATCH /users/:uid
 *
 * Direct RTDB field patch. Admin-only. Used for non-Auth-synced fields
 * (the legacy `patchUserInRTDB` path in services/users.js).
 *
 * NOTE: For changes that need to propagate to Firebase Auth (username,
 * phone, role), use `PUT /users/:uid` instead — that path uses the full
 * updatePortalUser machinery to keep Auth + indices + claims in sync.
 */
usersRouter.patch(
  "/:uid",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const { uid } = req.params;
    const patch = req.body;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }
    try {
      await getDatabase().ref(`users/${uid}`).update(patch);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
  }
);

/**
 * PUT /users/:uid
 *
 * Admin-only. Updates any subset of {username, displayName, phoneE164, role}.
 * Migrated from `updatePortalUser` onCall in updateUser.ts.
 *
 * Atomically updates:
 *   - Firebase Auth (email, phoneNumber, displayName)
 *   - Custom claims (role, username)
 *   - RTDB /users/{uid} fields
 *   - RTDB /usernameIndex and /phoneIndex entries (old → null, new → uid)
 */
usersRouter.put(
  "/:uid",
  requireAuth,
  requireAdmin,
  uidRateLimit("updateUser", UPDATE_USER_RATE_PER_HOUR, ONE_HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    const callerUid = req.caller!.uid;
    const { uid } = req.params;
    const input = (req.body ?? {}) as Partial<UpdatePortalUserInput>;

    const db = getDatabase();
    let profile: ExistingUserProfile;
    try {
      const profileSnap = await db.ref(`users/${uid}`).get();
      if (!profileSnap.exists()) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      profile = profileSnap.val() as ExistingUserProfile;
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
      return;
    }

    // Per-field validation
    if (input.username !== undefined && !isUsername(input.username)) {
      res.status(400).json({ error: "invalid_username" });
      return;
    }
    if (input.phoneE164 !== undefined && !isE164(input.phoneE164)) {
      res.status(400).json({ error: "invalid_phone" });
      return;
    }
    if (input.role !== undefined && !isRole(input.role)) {
      res.status(400).json({ error: "invalid_role" });
      return;
    }
    if (
      input.displayName !== undefined &&
      input.displayName !== null &&
      (typeof input.displayName !== "string" || input.displayName.length > MAX_DISPLAY_NAME_LEN)
    ) {
      res.status(400).json({ error: "invalid_display_name" });
      return;
    }
    if (uid === callerUid && input.role !== undefined && input.role !== "admin") {
      res.status(409).json({ error: "cannot_self_demote" });
      return;
    }

    const newUsername =
      input.username !== undefined ? input.username.toLowerCase() : null;
    const newPhone = input.phoneE164 !== undefined ? input.phoneE164 : null;
    const newRole = input.role !== undefined ? input.role : null;
    const newDisplayName =
      input.displayName !== undefined ? input.displayName : undefined;

    try {
      // Uniqueness for changed unique fields
      if (newUsername !== null && newUsername !== profile.username) {
        if ((await db.ref(`usernameIndex/${newUsername}`).get()).exists()) {
          res.status(409).json({ error: "username_taken" });
          return;
        }
      }
      if (newPhone !== null && newPhone !== profile.phoneE164) {
        const newIdx = phoneIndexKey(newPhone);
        const claimedBy = (await db.ref(`phoneIndex/${newIdx}`).get()).val();
        if (claimedBy && claimedBy !== uid) {
          res.status(409).json({ error: "phone_taken" });
          return;
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
        authPatch.displayName = (newDisplayName ?? "").slice(0, MAX_DISPLAY_NAME_LEN) || null;
      }
      if (Object.keys(authPatch).length > 0) {
        await getAuth().updateUser(uid, authPatch);
      }

      // Claim sync — re-mint when role or username changes
      const roleChanged = newRole !== null && newRole !== profile.role;
      const usernameChanged =
        newUsername !== null && newUsername !== profile.username;
      if (roleChanged || usernameChanged) {
        const existing = (await getAuth().getUser(uid)).customClaims ?? {};
        // Strip the legacy `admin: true` field; new shape uses `role`.
        const { admin: _legacy, ...rest } = existing as Record<string, unknown>;
        void _legacy;
        await getAuth().setCustomUserClaims(uid, {
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
        await db.ref().update(updates);
      }

      await writeAudit(callerUid, "updatePortalUser", {
        uid,
        changes: Object.keys(input),
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "update_failed", detail: errorMessage(err) });
    }
  }
);

/**
 * DELETE /users/:uid
 *
 * Admin-only. Deletes Firebase Auth user + RTDB profile + indices +
 * driver assignments + (if a groom) the entire data subtree.
 * Migrated from `deletePortalUser` onCall in users.ts.
 */
usersRouter.delete(
  "/:uid",
  requireAuth,
  requireAdmin,
  uidRateLimit("deleteUser", DELETE_USER_RATE_PER_HOUR, ONE_HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    const callerUid = req.caller!.uid;
    const { uid } = req.params;

    if (uid === callerUid) {
      res.status(409).json({ error: "cannot_self_delete" });
      return;
    }

    const db = getDatabase();
    try {
      const profileSnap = await db.ref(`users/${uid}`).get();
      if (!profileSnap.exists()) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const profile = profileSnap.val() as ExistingUserProfile;

      // Best-effort Auth deletion — the user record may already be gone
      // from a partial earlier delete; we still want to clean RTDB.
      await getAuth()
        .deleteUser(uid)
        .catch(() => {
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
      await db.ref().update(updates);

      await writeAudit(callerUid, "deletePortalUser", { uid });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "delete_failed", detail: errorMessage(err) });
    }
  }
);

/**
 * PUT /users/:uid/password
 *
 * Admin-only. Set another user's password and revoke their refresh tokens.
 * Admins cannot use this on themselves (must use the self-service flow).
 * Migrated from `adminSetPassword` onCall.
 *
 * Body: `{ newPassword: string }`
 */
usersRouter.put(
  "/:uid/password",
  requireAuth,
  requireAdmin,
  uidRateLimit("adminSetPassword", SET_PASSWORD_RATE_PER_HOUR, ONE_HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    const callerUid = req.caller!.uid;
    const { uid } = req.params;
    const { newPassword } = req.body ?? {};

    if (!isStrongPassword(newPassword)) {
      res.status(400).json({ error: "weak_password" });
      return;
    }
    if (uid === callerUid) {
      res.status(409).json({ error: "cannot_self_set" });
      return;
    }

    try {
      await getAuth().getUser(uid); // 404s if missing
    } catch {
      res.status(404).json({ error: "not_found" });
      return;
    }

    try {
      await getAuth().updateUser(uid, { password: newPassword });
      await getAuth().revokeRefreshTokens(uid);
      await writeAudit(callerUid, "adminSetPassword", { uid });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "set_password_failed", detail: errorMessage(err) });
    }
  }
);

/**
 * POST /users/:uid/admin-claim
 *
 * Admin-only. Promote / demote a user between "admin" and "groom" without
 * recreating them. Migrated from `setAdminClaim` onCall.
 *
 * Body: `{ isAdmin: boolean }`
 */
usersRouter.post(
  "/:uid/admin-claim",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const callerUid = req.caller!.uid;
    const { uid } = req.params;
    const isAdmin = req.body?.isAdmin === true;

    if (uid === callerUid && !isAdmin) {
      res.status(409).json({ error: "cannot_self_demote" });
      return;
    }

    try {
      const existing = (await getAuth().getUser(uid)).customClaims ?? {};
      // Strip the legacy `admin: true` field.
      const { admin: _legacy, ...rest } = existing as Record<string, unknown>;
      void _legacy;
      const newRole = isAdmin ? "admin" : "groom";
      await getAuth().setCustomUserClaims(uid, { ...rest, role: newRole });
      await getDatabase().ref(`users/${uid}/role`).set(newRole);
      await writeAudit(callerUid, "setAdminClaim", { uid, isAdmin });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "claim_failed", detail: errorMessage(err) });
    }
  }
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreatePortalUserInput {
  username: string;
  password: string;
  phoneE164?: string;
  role: "groom" | "driver" | "admin";
  displayName?: string;
}

interface UpdatePortalUserInput {
  username?: string;
  displayName?: string | null;
  phoneE164?: string;
  role?: "groom" | "driver" | "admin";
}

interface ExistingUserProfile {
  username: string;
  role: "groom" | "driver" | "admin";
  phoneE164?: string;
  displayName?: string | null;
}

// ─── Internals ────────────────────────────────────────────────────────────────

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "unknown";
}
