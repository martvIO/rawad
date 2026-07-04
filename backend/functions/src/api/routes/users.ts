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
// The handlers own authorization, validation, the username/phone-index +
// custom-claims invariant, and error mapping; all Firebase access (RTDB + Auth)
// goes through the `userStore` data-access seam (api/stores/userStore.ts) so the
// behaviour is unit-testable via an in-memory adapter, with no emulator.
//
// Route order matters: `/groom-profiles[/:uid]` MUST be declared before
// `/:uid` so the param-route doesn't swallow it.

import { Router, Response } from "express";
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
import { userStore } from "../stores/userStore";
import { MAX_LEN } from "../../constants/limits";
import { HOUR_MS } from "../../constants/time";
import { RATE } from "../../constants/rateLimits";
import { generateStrongPassword } from "../../passwordGen";
import {
  encryptField,
  isEncryptedField,
  decryptField,
  PasswordDecryptError,
} from "../passwordCrypto";
import { sendCredentialsWhatsApp } from "../services/credentialsDelivery";

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
  uidRateLimit("listGroomProfiles", RATE.GROOM_PROFILES_READ_PER_USER.limit, ONE_HOUR_MS),
  async (_req: AuthRequest, res: Response) => {
    try {
      res.json(await userStore.listGroomProfiles());
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
  uidRateLimit("putGroomProfile", RATE.GROOM_PROFILE_WRITE_PER_ADMIN.limit, ONE_HOUR_MS),
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
      await userStore.setGroomProfile(uid, data);
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
  uidRateLimit("deleteGroomProfile", RATE.GROOM_PROFILE_WRITE_PER_ADMIN.limit, ONE_HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    const { uid } = req.params;
    try {
      await userStore.removeGroomProfile(uid);
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
  uidRateLimit("listUsers", RATE.USERS_LIST_PER_ADMIN.limit, ONE_HOUR_MS),
  async (_req: AuthRequest, res: Response) => {
    try {
      res.json(await userStore.listUsers());
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
 * Password policy is role-dependent:
 *   - admin  → the caller supplies the password (strength-validated), exactly
 *              as before. Trusted operators hand credentials over directly.
 *   - groom/driver → the password is GENERATED server-side (a supplied one is
 *              rejected), the profile gets `mustChangePassword: true` (the
 *              portal blocks every dashboard behind the forced change screen),
 *              the credentials are auto-sent over WhatsApp (lang: ar|he,
 *              default ar), and the temp password is stored encrypted in
 *              /generatedPasswords/{uid} for the audited admin re-reveal.
 *
 * Body: `{ username, role, phoneE164?, displayName?, lang? }` (+ `password`
 *       for role=admin only)
 * Returns: `{ uid }` for admin; for groom/driver additionally
 *       `credentials: { delivered, deliveryError?, password? }` — the
 *       plaintext is included ONLY when delivery failed (show-once fallback).
 *
 * Side effects (all in one update):
 *   - Firebase Auth user created with synthetic email + custom claims
 *   - /users/{uid}                  → profile written
 *   - /usernameIndex/{username}     → uid (uniqueness guard)
 *   - /phoneIndex/{phoneIndexKey}   → uid (only if phone supplied)
 *   - /generatedPasswords/{uid}     → enc:v1 envelope (groom/driver only)
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
    if (!isRole(input.role)) {
      res.status(400).json({ error: "invalid_role" });
      return;
    }
    const generated = input.role !== "admin";
    if (generated) {
      // Admin-typed passwords are not accepted for groom/driver — the server
      // generates one so no weak/long-lived password can be handed out.
      if (input.password !== undefined) {
        res.status(400).json({ error: "password_not_allowed" });
        return;
      }
      if (input.lang !== undefined && input.lang !== "ar" && input.lang !== "he") {
        res.status(400).json({ error: "invalid_lang" });
        return;
      }
    } else if (!isStrongPassword(input.password)) {
      res.status(400).json({ error: "weak_password" });
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
    const lang: "ar" | "he" = input.lang === "he" ? "he" : "ar";
    const password = generated ? generateStrongPassword() : (input.password as string);

    try {
      if ((await userStore.readUsernameOwner(username)) !== null) {
        res.status(409).json({ error: "username_taken" });
        return;
      }
      if (phoneIdx && (await userStore.readPhoneOwner(phoneIdx)) !== null) {
        res.status(409).json({ error: "phone_taken" });
        return;
      }

      const createUserPayload: {
        email: string;
        password: string;
        displayName?: string;
        disabled: boolean;
        phoneNumber?: string;
      } = {
        email,
        password,
        displayName: input.displayName?.slice(0, MAX_DISPLAY_NAME_LEN),
        disabled: false,
      };
      if (hasPhone) createUserPayload.phoneNumber = input.phoneE164;

      const userRecord = await userStore.authCreateUser(createUserPayload);

      await userStore.authSetClaims(userRecord.uid, {
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
      // Per-groom feature flags — default ON for backward-compatibility.
      profile.canSeeAttendance = input.canSeeAttendance !== false;
      profile.canUsePhotographer = input.canUsePhotographer !== false;
      // Boarding-pass / wallet feature defaults OFF — needs Apple/Google
      // credentials the admin enables deliberately per groom.
      profile.canUseBoardingPass = input.canUseBoardingPass === true;
      // Cleared by POST /auth/change-password (or a phone-OTP reset).
      if (generated) profile.mustChangePassword = true;

      const updates: Record<string, unknown> = {};
      updates[`users/${userRecord.uid}`] = profile;
      updates[`usernameIndex/${username}`] = userRecord.uid;
      if (phoneIdx) updates[`phoneIndex/${phoneIdx}`] = userRecord.uid;
      if (generated) {
        // Encrypted at rest (enc:v1 envelope); plaintext only if the key is
        // unset — the node is function-only either way (.read: false).
        updates[`generatedPasswords/${userRecord.uid}`] = {
          password: encryptField(password) ?? password,
          createdAt: Date.now(),
        };
      }
      await userStore.applyUpdates(updates);

      let credentials: CredentialsResult | undefined;
      if (generated) {
        credentials = await deliverGeneratedPassword({
          phoneE164: hasPhone ? (input.phoneE164 as string) : null,
          lang,
          username,
          password,
        });
      }

      await writeAudit(callerUid, "createPortalUser", {
        uid: userRecord.uid,
        role: input.role,
        ...(credentials
          ? {
              generated: true,
              delivered: credentials.delivered,
              ...(credentials.deliveryError ? { deliveryError: credentials.deliveryError } : {}),
            }
          : {}),
      });
      res.json(credentials ? { uid: userRecord.uid, credentials } : { uid: userRecord.uid });
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
      const profile = await userStore.readUser(uid);
      if (profile === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ uid, ...profile });
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
  uidRateLimit("patchUser", RATE.UPDATE_USER_PER_ADMIN.limit, ONE_HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    const { uid } = req.params;
    const patch = req.body;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }

    // Field allowlist. This endpoint is ONLY for non-Auth-synced profile fields
    // (currently just displayName). Anything that must stay in sync with
    // Firebase Auth, custom claims, or the username/phone indices — role,
    // username, phoneE164, createdAt, createdBy — MUST go through
    // PUT /users/:uid (or admin-claim). Previously the entire body was written
    // verbatim to RTDB via the Admin SDK, which bypasses the rules' per-field
    // `.validate`, letting an admin corrupt the profile (bogus role, cleared
    // username, injected fields downstream code trusts).
    const body = patch as Record<string, unknown>;
    const safe: Record<string, unknown> = {};
    if ("displayName" in body) {
      const dn = body.displayName;
      if (dn === null || dn === "") {
        safe.displayName = null; // explicit clear
      } else if (typeof dn === "string" && dn.length <= MAX_DISPLAY_NAME_LEN) {
        safe.displayName = dn;
      } else {
        res.status(400).json({ error: "invalid_display_name" });
        return;
      }
    }
    for (const key of ["canSeeAttendance", "canUsePhotographer", "canUseBoardingPass"]) {
      if (key in body) {
        const v = body[key];
        if (typeof v !== "boolean") { res.status(400).json({ error: "invalid_flag", field: key }); return; }
        safe[key] = v;
      }
    }
    if (Object.keys(safe).length === 0) {
      res.status(400).json({ error: "no_allowed_fields" });
      return;
    }

    try {
      await userStore.patchUserFields(uid, safe);
      await writeAudit(req.caller!.uid, "patchPortalUser", {
        uid,
        fields: Object.keys(safe),
      });
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

    let profile: ExistingUserProfile;
    try {
      const profileVal = await userStore.readUser(uid);
      if (profileVal === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      profile = profileVal as unknown as ExistingUserProfile;
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
        if ((await userStore.readUsernameOwner(newUsername)) !== null) {
          res.status(409).json({ error: "username_taken" });
          return;
        }
      }
      if (newPhone !== null && newPhone !== profile.phoneE164) {
        const newIdx = phoneIndexKey(newPhone);
        const claimedBy = await userStore.readPhoneOwner(newIdx);
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
        await userStore.authUpdateUser(uid, authPatch);
      }

      // Claim sync — re-mint when role or username changes
      const roleChanged = newRole !== null && newRole !== profile.role;
      const usernameChanged =
        newUsername !== null && newUsername !== profile.username;
      if (roleChanged || usernameChanged) {
        const existing = (await userStore.authGetUser(uid)).customClaims ?? {};
        // Strip the legacy `admin: true` field; new shape uses `role`.
        const { admin: _legacy, ...rest } = existing as Record<string, unknown>;
        void _legacy;
        await userStore.authSetClaims(uid, {
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
        await userStore.applyUpdates(updates);
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

    try {
      const profileVal = await userStore.readUser(uid);
      if (profileVal === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const profile = profileVal as unknown as ExistingUserProfile;

      // Best-effort Auth deletion — the user record may already be gone
      // from a partial earlier delete; we still want to clean RTDB.
      await userStore.authDeleteUser(uid).catch(() => {
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
      await userStore.applyUpdates(updates);

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
 * Admin-only. Set another ADMIN's password and revoke their refresh tokens.
 * Admins cannot use this on themselves (must use the self-service flow).
 * Groom/driver targets are rejected — their passwords are server-generated
 * via POST /users/:uid/reset-password so a manual, never-expiring password
 * can't be handed out through this back door.
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
      await userStore.authGetUser(uid); // 404s if missing
    } catch {
      res.status(404).json({ error: "not_found" });
      return;
    }

    try {
      const profile = await userStore.readUser(uid);
      const role = (profile as Record<string, unknown> | null)?.role;
      if (role === "groom" || role === "driver") {
        res.status(409).json({ error: "use_reset_endpoint" });
        return;
      }
      await userStore.authUpdateUser(uid, { password: newPassword });
      await userStore.authRevokeTokens(uid);
      await writeAudit(callerUid, "adminSetPassword", { uid });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "set_password_failed", detail: errorMessage(err) });
    }
  }
);

/**
 * POST /users/:uid/reset-password
 *
 * Admin-only regenerate-and-resend for a GROOM/DRIVER: issues a fresh
 * generated password, revokes the target's sessions, re-arms the forced
 * first-login change, stores the temp password encrypted, and re-delivers it
 * over WhatsApp (same show-once fallback contract as POST /users). This is
 * both the routine reset path and the recovery path when the original
 * credentials message never arrived.
 *
 * Body: `{ lang?: "ar" | "he" }` (default "ar")
 * Returns: `{ ok: true, credentials: { delivered, deliveryError?, password? } }`
 * — plaintext included ONLY when delivery failed.
 */
usersRouter.post(
  "/:uid/reset-password",
  requireAuth,
  requireAdmin,
  uidRateLimit("adminResetPassword", RATE.RESET_PASSWORD_PER_ADMIN.limit, ONE_HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    const callerUid = req.caller!.uid;
    const { uid } = req.params;
    const langInput = (req.body ?? {}).lang;

    if (langInput !== undefined && langInput !== "ar" && langInput !== "he") {
      res.status(400).json({ error: "invalid_lang" });
      return;
    }
    if (uid === callerUid) {
      res.status(409).json({ error: "cannot_self_set" });
      return;
    }

    try {
      const profileVal = await userStore.readUser(uid);
      if (profileVal === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const profile = profileVal as unknown as ExistingUserProfile;
      if (profile.role !== "groom" && profile.role !== "driver") {
        // Admin passwords stay manual — see PUT /users/:uid/password.
        res.status(409).json({ error: "use_manual_password" });
        return;
      }

      const password = generateStrongPassword();
      await userStore.authUpdateUser(uid, { password });
      // Bounce any live session: the next login lands on the forced-change gate.
      await userStore.authRevokeTokens(uid);
      await userStore.applyUpdates({
        [`users/${uid}/mustChangePassword`]: true,
        [`generatedPasswords/${uid}`]: {
          password: encryptField(password) ?? password,
          createdAt: Date.now(),
        },
      });

      const credentials = await deliverGeneratedPassword({
        phoneE164: typeof profile.phoneE164 === "string" && profile.phoneE164 ? profile.phoneE164 : null,
        lang: langInput === "he" ? "he" : "ar",
        username: profile.username,
        password,
      });

      await writeAudit(callerUid, "adminResetPassword", {
        uid,
        delivered: credentials.delivered,
        ...(credentials.deliveryError ? { deliveryError: credentials.deliveryError } : {}),
      });
      res.json({ ok: true, credentials });
    } catch (err) {
      res.status(500).json({ error: "reset_password_failed", detail: errorMessage(err) });
    }
  }
);

/**
 * GET /users/:uid/temp-password
 *
 * Admin-only re-reveal of a stored generated password — exists only between
 * account creation/reset and the user's first-login change (which purges the
 * node). Values are enc:v1 envelopes decrypted server-side; legacy plaintext
 * entries pass through. Every successful reveal is audit-logged.
 */
usersRouter.get(
  "/:uid/temp-password",
  requireAuth,
  requireAdmin,
  uidRateLimit("revealTempPassword", RATE.TEMP_PASSWORD_REVEAL_PER_ADMIN.limit, ONE_HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    const { uid } = req.params;
    try {
      const rec = await userStore.readGeneratedPassword(uid);
      const stored = rec?.password;
      if (typeof stored !== "string" || stored.length === 0) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      let password = stored;
      if (isEncryptedField(stored)) {
        try {
          password = decryptField(stored);
        } catch (err) {
          if (err instanceof PasswordDecryptError) {
            // Envelope present but the key is unset/rotated — regenerate via
            // POST /users/:uid/reset-password instead.
            res.status(409).json({ error: "encryption_unavailable" });
            return;
          }
          throw err;
        }
      }
      await writeAudit(req.caller!.uid, "revealTempPassword", { uid });
      res.json({ password, createdAt: rec?.createdAt ?? null });
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
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
  uidRateLimit("adminClaim", RATE.ADMIN_CLAIM_PER_ADMIN.limit, ONE_HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    const callerUid = req.caller!.uid;
    const { uid } = req.params;
    const isAdmin = req.body?.isAdmin === true;

    if (uid === callerUid && !isAdmin) {
      res.status(409).json({ error: "cannot_self_demote" });
      return;
    }

    try {
      const existing = (await userStore.authGetUser(uid)).customClaims ?? {};
      // Strip the legacy `admin: true` field.
      const { admin: _legacy, ...rest } = existing as Record<string, unknown>;
      void _legacy;
      const newRole = isAdmin ? "admin" : "groom";
      await userStore.authSetClaims(uid, { ...rest, role: newRole });
      await userStore.setUserRole(uid, newRole);
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
  /** Admin role only — groom/driver passwords are server-generated. */
  password?: string;
  phoneE164?: string;
  role: "groom" | "driver" | "admin";
  displayName?: string;
  /** WhatsApp credentials-message language (groom/driver; default "ar"). */
  lang?: "ar" | "he";
  canSeeAttendance?: boolean;
  canUsePhotographer?: boolean;
  canUseBoardingPass?: boolean;
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

/** What POST /users and POST /users/:uid/reset-password report back about the
 *  generated credentials. `password` is present ONLY when delivery failed —
 *  the admin's show-once fallback. */
interface CredentialsResult {
  delivered: boolean;
  deliveryError?: string;
  password?: string;
}

// ─── Internals ────────────────────────────────────────────────────────────────

/**
 * Deliver a freshly generated password over WhatsApp (when a phone exists) and
 * shape the `credentials` result: delivered → no plaintext in the response;
 * not delivered (no phone / config off / send failure) → include the plaintext
 * once so the admin can pass it on manually.
 */
async function deliverGeneratedPassword(args: {
  phoneE164: string | null;
  lang: "ar" | "he";
  username: string;
  password: string;
}): Promise<CredentialsResult> {
  if (!args.phoneE164) {
    return { delivered: false, deliveryError: "no_phone", password: args.password };
  }
  const result = await sendCredentialsWhatsApp({
    phoneE164: args.phoneE164,
    lang: args.lang,
    username: args.username,
    password: args.password,
  });
  if (result.delivered) return { delivered: true };
  return {
    delivered: false,
    deliveryError: result.error ?? "send_failed",
    password: args.password,
  };
}

// errorMessage (suppress-by-default 5xx detail) is now shared — see ../errorDetail.
import { errorMessage } from "../errorDetail";
