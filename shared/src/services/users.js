// Users service — admin-only CRUD over portal accounts plus a list subscription
// usable by drivers (groom-profile slice only).
//
// REST endpoints (all under /api/users):
//   GET    /users                     admin: full user list
//   GET    /users/groom-profiles      any authed: { username, displayName }[]
//   PATCH  /users/:uid                admin: direct field patch (displayName, …)
//   PUT    /users/groom-profiles/:uid admin: upsert public profile mirror
//   DELETE /users/groom-profiles/:uid admin: remove mirror
//   POST   /users                     admin: create
//   DELETE /users/:uid                admin: cascade delete
//   PUT    /users/:uid                admin: full update
//   PUT    /users/:uid/password       admin: set password
//   POST   /users/:uid/admin-claim    admin: promote/demote

import { api } from "../utils/apiClient.js";
import { subscribeList } from "./_helpers.js";

// ─── Subscriptions ────────────────────────────────────────────────────────────

/**
 * Admin-only live list of every portal user.
 * Items shape: `{ uid, id, username, role, phoneE164, displayName? }` — `id`
 * mirrors `uid` to keep legacy JSX keyed by `u.id` working.
 *
 * @param {(users: object[]) => void} cb
 * @returns {() => void} unsubscribe
 */
export function subscribeUsers(cb) {
  return subscribeList("/users", (users) => {
    cb(users.map((u) => ({ ...u, id: u.uid })));
  });
}

/**
 * Public-ish (any-authed) list of groom profiles. Used by drivers to pick a
 * groom to serve, and by the admin send tab to render the list.
 *
 * @param {(profiles: object[]) => void} cb
 * @returns {() => void} unsubscribe
 */
export function subscribeGroomProfiles(cb) {
  return subscribeList("/users/groom-profiles", (profiles) => {
    cb(profiles.map((p) => ({ ...p, id: p.uid })));
  });
}

// ─── Direct field writes ──────────────────────────────────────────────────────

/**
 * Patch a portal user record (server-side validation; admin only).
 * Pre-migration this hit RTDB directly; now it's a typed PATCH endpoint.
 */
export async function patchUserInRTDB(uid, patch) {
  return api.patch(`/users/${uid}`, patch);
}

/**
 * Upsert the public groom profile mirror (server validates schema).
 */
export async function upsertGroomProfile(uid, { username, displayName }) {
  const body = { username };
  if (displayName) body.displayName = displayName;
  return api.put(`/users/groom-profiles/${uid}`, body);
}

export async function removeGroomProfile(uid) {
  return api.delete(`/users/groom-profiles/${uid}`);
}

// ─── Admin operations (replaced onCalls) ──────────────────────────────────────

/**
 * Create a portal user. Server validates uniqueness on username + phone,
 * mints custom claims, writes /users + indices + groom profile.
 *
 * @param {{username, password, role, phoneE164?, displayName?}} input
 */
export async function createPortalUser(input) {
  return api.post("/users", input);
}

export async function deletePortalUser(uid) {
  return api.delete(`/users/${uid}`);
}

/**
 * Patch any combination of username/displayName/phoneE164/role.
 * Server keeps Auth + RTDB + indices + claims in sync atomically.
 */
export async function updatePortalUser(input) {
  const { uid, ...rest } = input;
  return api.put(`/users/${uid}`, rest);
}

export async function adminSetPassword(uid, newPassword) {
  return api.put(`/users/${uid}/password`, { newPassword });
}

export async function setAdminClaim(uid, isAdmin) {
  return api.post(`/users/${uid}/admin-claim`, { isAdmin });
}
