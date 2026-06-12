// Auth service — REST-based replacement for the Firebase Auth SDK calls.
//
// All token lifecycle lives in `src/utils/tokenManager.js`. This module is
// a thin orchestrator that:
//   - Hits /api/auth/* endpoints
//   - Stores / clears tokens via tokenManager
//   - Polls /api/auth/me to keep the role/claims fresh (replaces
//     onAuthStateChanged + onIdTokenChanged from the SDK)
//
// Source of truth for "what role is this user?" remains the JWT custom claim
// `role`, which the server returns inside /auth/me's `claims` field.

import { api } from "../utils/apiClient.js";
import { createPoller } from "../utils/poller.js";
import {
  clearTokens,
  loadStoredTokens,
  refreshIdToken,
  storeTokens,
  getStoredUid,
} from "../utils/tokenManager.js";
import { logWarn } from "../utils/logger.js";
import { POLL_MS } from "../config/index.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Frequency at which /auth/me is polled to refresh role/claims. */
const ME_POLL_INTERVAL_MS = POLL_MS.ME;

// ─── Login / logout ───────────────────────────────────────────────────────────

/**
 * Sign in with username + password. On success, persists the tokens and
 * returns the user-shaped object used by usePortalState.
 *
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{uid, role, username, displayName, phoneE164}>}
 */
export async function signIn(username, password) {
  const data = await api.post(
    "/auth/login",
    { username, password },
    { skipAuth: true },
  );
  storeTokens({
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresIn: data.expiresIn,
    uid: data.uid,
  });
  return {
    uid: data.uid,
    role: data.role,
    username: data.username,
    displayName: data.displayName ?? null,
    phoneE164: data.phoneE164 ?? null,
    claims: { role: data.role, username: data.username },
  };
}

/**
 * Sign out. Best-effort hits /auth/logout; clears tokens unconditionally
 * so a network failure can't strand the user signed-in.
 */
export async function signOutNow() {
  try {
    await api.post("/auth/logout", {});
  } catch (err) {
    logWarn("signOutNow:logout", err);
  } finally {
    clearTokens();
  }
}

/**
 * Force a token refresh. Existed in the old Firebase service to handle
 * post-claim-grant retries; in REST, /auth/refresh does the same.
 *
 * @returns {Promise<string|null>}
 */
export async function forceRefreshToken() {
  try {
    return await refreshIdToken();
  } catch {
    return null;
  }
}

// ─── Profile ──────────────────────────────────────────────────────────────────

/**
 * Read the authenticated user's profile. The legacy version read
 * /users/{uid} directly from RTDB; now we delegate to /auth/me which
 * does the same on the server.
 *
 * @returns {Promise<{uid, role, username, displayName, phoneE164, claims} | null>}
 */
export async function fetchProfile() {
  try {
    return await api.get("/auth/me");
  } catch {
    return null;
  }
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

/**
 * Subscribe to "the current auth state". Replaces both
 * `onAuthStateChanged` AND `onIdTokenChanged` from the SDK — REST does not
 * distinguish the two events because there is no live SDK to fire them.
 *
 * Implementation: fire once immediately with whatever stored tokens we have,
 * then poll /auth/me every 30s. On 401 or auth-cleared (handled by apiClient),
 * the callback receives null so the UI can route to login.
 *
 * @param {(user: object|null) => void} cb
 * @returns {() => void} unsubscribe
 */
export function subscribeAuth(cb) {
  loadStoredTokens();
  const uid = getStoredUid();
  if (!uid) {
    // Not signed in — fire null synchronously and don't bother polling.
    queueMicrotask(() => cb(null));
    return () => {};
  }
  return createPoller(
    () => api.get("/auth/me"),
    (value) => {
      if (!value) {
        cb(null);
        return;
      }
      cb({
        uid: value.uid,
        role: value.role,
        username: value.username,
        displayName: value.displayName ?? null,
        phoneE164: value.phoneE164 ?? null,
        claims: value.claims ?? {},
      });
    },
    { intervalMs: ME_POLL_INTERVAL_MS, onError: () => cb(null) },
  );
}

/**
 * Backwards-compat shim. The old SDK exposed `onIdTokenChanged` separately
 * to deliver token-only refreshes (custom-claim updates). With REST, polling
 * /auth/me already includes the freshest claims, so this is now an alias
 * for subscribeAuth.
 */
export function subscribeIdToken(cb) {
  return subscribeAuth(cb);
}

// ─── Password reset (Phone OTP) ───────────────────────────────────────────────

/**
 * Step 1 of password reset — send an SMS code. The frontend renders a
 * reCAPTCHA v2 widget; pass the resulting token here. Returns the
 * opaque `sessionInfo` needed for confirm.
 *
 * Signature kept identical to legacy `sendPasswordResetCode` except for
 * an extra `recaptchaToken` argument (the SDK obtained it transparently
 * via RecaptchaVerifier, but the REST endpoint can't).
 *
 * @param {string} phoneE164
 * @param {string} _containerIdUnused  kept for backwards compat with callers
 * @param {string} recaptchaToken      v2 token from grecaptcha.getResponse()
 * @returns {Promise<{sessionInfo: string}>}
 */
export async function sendPasswordResetCode(
  phoneE164,
  _containerIdUnused,
  recaptchaToken,
) {
  return api.post(
    "/auth/send-otp",
    { phoneE164, recaptchaToken },
    { skipAuth: true },
  );
}

/**
 * Step 2 of password reset — verify the code and obtain a phone-auth ID
 * token. The token is stored so the next REST call (reset-password) is
 * authenticated.
 *
 * @param {{sessionInfo: string}} sendResult  the object returned by sendPasswordResetCode
 * @param {string} code
 */
export async function confirmPasswordResetCode(sendResult, code) {
  const data = await api.post(
    "/auth/verify-otp",
    { sessionInfo: sendResult.sessionInfo, code },
    { skipAuth: true },
  );
  storeTokens({
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresIn: data.expiresIn,
  });
  return data;
}

/**
 * Finalize a phone-OTP-authorized password reset. Must be called with the
 * phone-auth idToken active (i.e. immediately after confirmPasswordResetCode).
 */
export async function callResetPassword(newPassword) {
  return api.post("/auth/reset-password", { newPassword });
}
