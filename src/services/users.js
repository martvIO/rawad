// Users service — admin-only management calls + a subscription for the user list.
// Creates / deletes are routed through Cloud Functions so the server can mint
// custom claims, write the index nodes, and audit-log.
import { subscribeList, callable } from "./_helpers.js";

// Live list of every portal user. Returns an array of { uid, id, username, role, phoneE164, ... }.
// Rule-restricted: only admins receive non-empty snapshots. (`id` mirrors `uid` so legacy
// JSX that keys by `u.id` keeps working.)
export function subscribeUsers(cb) {
  return subscribeList("users", cb, (c) => ({ uid: c.key, id: c.key, ...c.val() }));
}

const _createPortalUser = callable("createPortalUser");
const _deletePortalUser = callable("deletePortalUser");
const _updatePortalUser = callable("updatePortalUser");
const _adminSetPassword = callable("adminSetPassword");
const _setAdminClaim    = callable("setAdminClaim");
const _resetPassword    = callable("resetPassword");

export async function createPortalUser(input) {
  return _createPortalUser(input);
}

export async function deletePortalUser(uid) {
  return _deletePortalUser({ uid });
}

// Admin-only: patch any combination of username, displayName, phoneE164, role.
// Cloud Function validates each field and keeps Auth + indices + claims in sync.
export async function updatePortalUser(input) {
  return _updatePortalUser(input);
}

// Admin-only: set another user's password (forces re-login on next request).
export async function adminSetPassword(uid, newPassword) {
  return _adminSetPassword({ uid, newPassword });
}

export async function setAdminClaim(uid, isAdmin) {
  return _setAdminClaim({ uid, isAdmin });
}

// Called AFTER a phone-OTP confirmation. The phone-auth ID token (set by
// confirmPasswordResetCode) is what authorises this call server-side.
export async function callResetPassword(newPassword) {
  return _resetPassword({ newPassword });
}
