// Users service — admin-only management calls + a subscription for the user list.
// Creates / deletes are routed through Cloud Functions so the server can mint
// custom claims, write the index nodes, and audit-log.
import { ref, onValue } from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase.js";

// Live list of every portal user. Returns an array of { uid, id, username, role, phoneE164, ... }.
// Rule-restricted: only admins receive non-empty snapshots. (`id` mirrors `uid` so legacy
// JSX that keys by `u.id` keeps working.)
export function subscribeUsers(cb) {
  return onValue(ref(db, "users"), (snap) => {
    const out = [];
    snap.forEach((child) => { out.push({ uid: child.key, id: child.key, ...child.val() }); });
    cb(out);
  });
}

const _createPortalUser = httpsCallable(functions, "createPortalUser");
const _deletePortalUser = httpsCallable(functions, "deletePortalUser");
const _updatePortalUser = httpsCallable(functions, "updatePortalUser");
const _adminSetPassword = httpsCallable(functions, "adminSetPassword");
const _setAdminClaim    = httpsCallable(functions, "setAdminClaim");
const _resetPassword    = httpsCallable(functions, "resetPassword");

export async function createPortalUser(input) {
  const res = await _createPortalUser(input);
  return res.data;
}

export async function deletePortalUser(uid) {
  const res = await _deletePortalUser({ uid });
  return res.data;
}

// Admin-only: patch any combination of username, displayName, phoneE164, role.
// Cloud Function validates each field and keeps Auth + indices + claims in sync.
export async function updatePortalUser(input) {
  const res = await _updatePortalUser(input);
  return res.data;
}

// Admin-only: set another user's password (forces re-login on next request).
export async function adminSetPassword(uid, newPassword) {
  const res = await _adminSetPassword({ uid, newPassword });
  return res.data;
}

export async function setAdminClaim(uid, isAdmin) {
  const res = await _setAdminClaim({ uid, isAdmin });
  return res.data;
}

// Called AFTER a phone-OTP confirmation. The phone-auth ID token (set by
// confirmPasswordResetCode) is what authorises this call server-side.
export async function callResetPassword(newPassword) {
  const res = await _resetPassword({ newPassword });
  return res.data;
}
