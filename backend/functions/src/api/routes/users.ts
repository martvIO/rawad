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
// The handlers here are deliberately THIN: parse the request, delegate to the
// `UserStore` domain module (domain/users/userStore.ts) which owns all
// validation + the index/claims invariants, then map a domain result/error to
// HTTP via `sendDomainError`. Authorization (`requireAdmin`), rate-limiting,
// and the GET /:uid ownership check stay here — they are transport concerns the
// domain never sees. Self-modification guards live in the module (the route
// only forwards `callerUid`).
//
// Route order matters: `/groom-profiles[/:uid]` MUST be declared before
// `/:uid` so the param-route doesn't swallow it.

import { Router, Response } from "express";
import {
  AuthRequest,
  requireAuth,
  requireAdmin,
} from "../middleware/auth";
import { uidRateLimit } from "../middleware/rateLimit";
import { MAX_LEN } from "../../constants/limits";
import { HOUR_MS } from "../../constants/time";
import { RATE } from "../../constants/rateLimits";
import { writeAudit } from "../../audit";
import { makeUserStore, UserStore } from "../../domain/users/userStore";
import { CreateUserInput, UpdateUserInput } from "../../domain/users/types";
import { rtdbPort, authPort } from "../../domain/firebaseAdapters";
import { sendDomainError } from "../../domain/httpError";

// ─── Constants ────────────────────────────────────────────────────────────────

const ONE_HOUR_MS = HOUR_MS;
const CREATE_USER_RATE_PER_HOUR = RATE.CREATE_USER_PER_ADMIN.limit;
const DELETE_USER_RATE_PER_HOUR = RATE.DELETE_USER_PER_ADMIN.limit;
const UPDATE_USER_RATE_PER_HOUR = RATE.UPDATE_USER_PER_ADMIN.limit;
const SET_PASSWORD_RATE_PER_HOUR = RATE.SET_PASSWORD_PER_ADMIN.limit;
const MAX_DISPLAY_NAME_LEN = MAX_LEN.NAME;

/** Build a request-scoped store over the real Firebase ports. */
function userStore(): UserStore {
  return makeUserStore({
    db: rtdbPort(),
    auth: authPort(),
    audit: writeAudit,
    now: Date.now,
  });
}

// Domain-error code → HTTP status. Response bodies stay `{ error: code }`,
// identical to the pre-extraction handlers. Unmapped / raw (infra) errors fall
// through to a 500 with the route's own fallback slug.
const USER_STATUS: Record<string, number> = {
  invalid_username: 400,
  weak_password: 400,
  invalid_role: 400,
  invalid_phone: 400,
  invalid_display_name: 400,
  missing_username: 400,
  username_taken: 409,
  phone_taken: 409,
  cannot_self_demote: 409,
  cannot_self_delete: 409,
  cannot_self_set: 409,
  not_found: 404,
};

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
      res.json(await userStore().listGroomProfiles());
    } catch (err) {
      sendDomainError(res, err, USER_STATUS, "read_failed");
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
    try {
      await userStore().upsertGroomProfile(uid, username, displayName);
      res.json({ ok: true });
    } catch (err) {
      sendDomainError(res, err, USER_STATUS, "write_failed");
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
      await userStore().removeGroomProfile(uid);
      res.json({ ok: true });
    } catch (err) {
      sendDomainError(res, err, USER_STATUS, "write_failed");
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
      res.json(await userStore().listUsers());
    } catch (err) {
      sendDomainError(res, err, USER_STATUS, "read_failed");
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
    try {
      const out = await userStore().createUser(
        (req.body ?? {}) as CreateUserInput,
        req.caller!.uid
      );
      res.json(out);
    } catch (err) {
      sendDomainError(res, err, USER_STATUS, "create_failed");
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
      const profile = await userStore().getUser(uid);
      if (profile === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ uid, ...profile });
    } catch (err) {
      sendDomainError(res, err, USER_STATUS, "read_failed");
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
      await userStore().patchProfileFields(uid, safe, req.caller!.uid);
      res.json({ ok: true });
    } catch (err) {
      sendDomainError(res, err, USER_STATUS, "write_failed");
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
    try {
      await userStore().updateUser(
        req.params.uid,
        (req.body ?? {}) as UpdateUserInput,
        req.caller!.uid
      );
      res.json({ ok: true });
    } catch (err) {
      sendDomainError(res, err, USER_STATUS, "update_failed");
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
    try {
      await userStore().deleteUser(req.params.uid, req.caller!.uid);
      res.json({ ok: true });
    } catch (err) {
      sendDomainError(res, err, USER_STATUS, "delete_failed");
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
    const { newPassword } = req.body ?? {};
    try {
      await userStore().setPassword(req.params.uid, newPassword, req.caller!.uid);
      res.json({ ok: true });
    } catch (err) {
      sendDomainError(res, err, USER_STATUS, "set_password_failed");
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
    const isAdmin = req.body?.isAdmin === true;
    try {
      await userStore().setRole(req.params.uid, isAdmin, req.caller!.uid);
      res.json({ ok: true });
    } catch (err) {
      sendDomainError(res, err, USER_STATUS, "claim_failed");
    }
  }
);
