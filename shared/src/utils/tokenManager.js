// Token lifecycle manager for the REST-based frontend.
//
// Replaces the Firebase Auth SDK's in-memory token storage with a localStorage-
// backed equivalent. The flow:
//
//   1. /api/auth/login   → storeTokens({ idToken, refreshToken, expiresIn, ... })
//   2. apiClient.js      → getIdToken() before every fetch
//   3. Before the 60-min expiry → refreshIdToken() (proactive)
//   4. On 401             → refreshIdToken() (reactive, single retry)
//   5. /api/auth/logout  → clearTokens()
//
// Storage keys are namespaced under `dawa.*` so this module doesn't collide
// with the legacy Firebase SDK keys still in localStorage from past sessions.
// `loadStoredTokens()` is called once on app startup (usePortalState.js) to
// recover the session across page reloads.
//
// What this file does NOT do:
//   - It does not validate the idToken locally — the API verifies it.
//   - It does not export the raw refresh token; it is only ever sent to
//     `/api/auth/refresh` over HTTPS.

import { logErr, log } from "./logger.js";
import { API_BASE_URL, TOKEN_MGR } from "../config/index.js";
import { getStorage } from "../adapters/storage.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/** localStorage key prefix. Keeps Dawa tokens distinct from any other app's. */
const STORAGE_PREFIX = "dawa.";

const STORAGE_KEY_ID_TOKEN = `${STORAGE_PREFIX}idToken`;
const STORAGE_KEY_REFRESH_TOKEN = `${STORAGE_PREFIX}refreshToken`;
const STORAGE_KEY_EXPIRES_AT = `${STORAGE_PREFIX}expiresAt`;
const STORAGE_KEY_UID = `${STORAGE_PREFIX}uid`;

const { REFRESH_LEAD_MS, MIN_REFRESH_DELAY_MS, DEFAULT_EXPIRES_IN_SECONDS } = TOKEN_MGR;

// ─── Module state ─────────────────────────────────────────────────────────────

/**
 * Cached in-memory copy of the current tokens. Reading from memory is faster
 * than localStorage on hot paths (every fetch reads getIdToken()).
 */
let memoryState = {
  idToken: null,
  refreshToken: null,
  expiresAt: 0,
  uid: null,
};

/** Outstanding refresh timer handle, so scheduleRefresh() can re-arm. */
let refreshTimer = null;

/**
 * Promise of any in-flight refresh, so concurrent fetches don't trigger
 * parallel /auth/refresh calls. Cleared in finally{}.
 */
let inflightRefresh = null;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Hydrate the in-memory state from getStorage(). Call once at app startup
 * (before any fetch). Safe to call multiple times.
 */
export function loadStoredTokens() {
  try {
    memoryState = {
      idToken: getStorage().getItem(STORAGE_KEY_ID_TOKEN) || null,
      refreshToken: getStorage().getItem(STORAGE_KEY_REFRESH_TOKEN) || null,
      expiresAt: parseInt(getStorage().getItem(STORAGE_KEY_EXPIRES_AT) || "0", 10) || 0,
      uid: getStorage().getItem(STORAGE_KEY_UID) || null,
    };
    log("tokenManager: loaded stored tokens", { uid: memoryState.uid });
    if (memoryState.refreshToken) scheduleRefresh();
  } catch (err) {
    logErr("tokenManager.loadStoredTokens", err);
  }
}

/**
 * Async variant of loadStoredTokens for platforms whose storage adapter is
 * asynchronous (React Native / expo-secure-store). Awaits each read so the
 * in-memory state is fully hydrated before the first authed request.
 *
 * Web keeps using the sync loadStoredTokens(); native callers MUST await this
 * once at boot (before any service import that reads tokens) and must NOT also
 * call the sync variant (which would read Promises off the async adapter).
 */
export async function loadStoredTokensAsync() {
  try {
    const s = getStorage();
    const [idToken, refreshToken, expiresAtRaw, uid] = await Promise.all([
      s.getItem(STORAGE_KEY_ID_TOKEN),
      s.getItem(STORAGE_KEY_REFRESH_TOKEN),
      s.getItem(STORAGE_KEY_EXPIRES_AT),
      s.getItem(STORAGE_KEY_UID),
    ]);
    memoryState = {
      idToken: idToken || null,
      refreshToken: refreshToken || null,
      expiresAt: parseInt(expiresAtRaw || "0", 10) || 0,
      uid: uid || null,
    };
    log("tokenManager: loaded stored tokens (async)", { uid: memoryState.uid });
    if (memoryState.refreshToken) scheduleRefresh();
  } catch (err) {
    logErr("tokenManager.loadStoredTokensAsync", err);
  }
}

/**
 * Persist a token set after login or refresh. The expiresAt is computed
 * once and reused on every subsequent getIdToken() check — never trust
 * the locally-cached idToken past expiresAt.
 *
 * @param {Object} tokens
 * @param {string} tokens.idToken
 * @param {string} tokens.refreshToken
 * @param {number|string} [tokens.expiresIn]  seconds until expiry
 * @param {string} [tokens.uid]
 */
export function storeTokens(tokens) {
  if (!tokens || !tokens.idToken || !tokens.refreshToken) {
    throw new Error("storeTokens: idToken and refreshToken are required");
  }
  const expiresInSec = parseInt(tokens.expiresIn, 10) || DEFAULT_EXPIRES_IN_SECONDS;
  const expiresAt = Date.now() + expiresInSec * 1000;

  memoryState = {
    idToken: tokens.idToken,
    refreshToken: tokens.refreshToken,
    expiresAt,
    uid: tokens.uid ?? memoryState.uid,
  };

  try {
    getStorage().setItem(STORAGE_KEY_ID_TOKEN, memoryState.idToken);
    getStorage().setItem(STORAGE_KEY_REFRESH_TOKEN, memoryState.refreshToken);
    getStorage().setItem(STORAGE_KEY_EXPIRES_AT, String(memoryState.expiresAt));
    if (memoryState.uid) getStorage().setItem(STORAGE_KEY_UID, memoryState.uid);
  } catch (err) {
    logErr("tokenManager.storeTokens:setItem", err);
  }
  scheduleRefresh();
}

/**
 * Wipe both the in-memory and persisted tokens. Called on logout and on
 * permanent auth failure (refresh rejected). Safe to call when already empty.
 */
export function clearTokens() {
  memoryState = { idToken: null, refreshToken: null, expiresAt: 0, uid: null };
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  inflightRefresh = null;
  try {
    getStorage().removeItem(STORAGE_KEY_ID_TOKEN);
    getStorage().removeItem(STORAGE_KEY_REFRESH_TOKEN);
    getStorage().removeItem(STORAGE_KEY_EXPIRES_AT);
    getStorage().removeItem(STORAGE_KEY_UID);
  } catch (err) {
    logErr("tokenManager.clearTokens:removeItem", err);
  }
}

/**
 * Return a (possibly refreshed) ID token suitable for the Authorization
 * header. Returns `null` if no session exists. Refreshes proactively when
 * within REFRESH_LEAD_MS of expiry; throws on permanent refresh failure.
 *
 * @returns {Promise<string|null>}
 */
export async function getIdToken() {
  if (!memoryState.refreshToken) return null;
  const now = Date.now();
  const needsRefresh = !memoryState.idToken || memoryState.expiresAt - now < REFRESH_LEAD_MS;
  if (needsRefresh) {
    await refreshIdToken();
  }
  return memoryState.idToken;
}

/**
 * Synchronously read the cached UID without verifying any token. Useful
 * for code paths that need to know "who am I logged in as" before any
 * fetch (e.g. Firestore-replacement Storage paths that include the UID).
 *
 * @returns {string|null}
 */
export function getStoredUid() {
  return memoryState.uid;
}

/**
 * Read the cached idToken WITHOUT triggering a refresh. Used by the SSE
 * subscription path which embeds the token in the URL `?token=...` and
 * does not want to perform a network refresh as a side effect.
 *
 * @returns {string|null}
 */
export function peekIdToken() {
  return memoryState.idToken;
}

/**
 * Snapshot the cached tokens WITHOUT triggering a refresh. Used to seed a
 * WebView's localStorage so an embedded web session (e.g. the native design
 * editor's invitation preview) authenticates as the same groom. Returns all
 * four persisted fields so the WebView can also refresh on its own.
 *
 * @returns {{ idToken: string|null, refreshToken: string|null, expiresAt: number, uid: string|null }}
 */
export function peekTokens() {
  return {
    idToken: memoryState.idToken || null,
    refreshToken: memoryState.refreshToken || null,
    expiresAt: memoryState.expiresAt || 0,
    uid: memoryState.uid || null,
  };
}

/**
 * Force-refresh the ID token. Throws on failure and clears the tokens
 * so callers can route the user to the login screen. Coalesces concurrent
 * calls into a single in-flight request.
 *
 * @returns {Promise<string>} the newly minted idToken
 */
export async function refreshIdToken() {
  if (inflightRefresh) return inflightRefresh;
  if (!memoryState.refreshToken) {
    throw new Error("no_refresh_token");
  }
  inflightRefresh = doRefresh(memoryState.refreshToken)
    .catch((err) => {
      // Permanent failure → clear so the next getIdToken returns null.
      clearTokens();
      throw err;
    })
    .finally(() => {
      inflightRefresh = null;
    });
  return inflightRefresh;
}

/**
 * Register a callback invoked whenever clearTokens() is called by this
 * module (e.g. on permanent refresh failure). Used by apiClient.js to
 * notify usePortalState that the session ended.
 *
 * Only one callback is supported (replaces any previous registration).
 */
let onAuthClearedCb = null;
export function setAuthClearedCallback(cb) {
  onAuthClearedCb = typeof cb === "function" ? cb : null;
}

// ─── Internals ────────────────────────────────────────────────────────────────

/**
 * Schedule a one-shot refresh to fire REFRESH_LEAD_MS before the recorded
 * expiry. Idempotent — replaces any prior pending timer.
 */
function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  if (!memoryState.refreshToken || !memoryState.expiresAt) return;
  const delay = Math.max(
    MIN_REFRESH_DELAY_MS,
    memoryState.expiresAt - Date.now() - REFRESH_LEAD_MS,
  );
  refreshTimer = setTimeout(() => {
    refreshIdToken().catch((err) => {
      logErr("tokenManager.scheduleRefresh", err);
      if (onAuthClearedCb) onAuthClearedCb();
    });
  }, delay);
}

/**
 * Exchange a refresh token for a fresh ID token via /api/auth/refresh.
 * On success: updates the in-memory + persisted state and re-arms the
 * refresh timer.
 *
 * @param {string} refreshToken
 * @returns {Promise<string>}
 */
async function doRefresh(refreshToken) {
  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    let body;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    throw new Error(`refresh_failed:${body?.error ?? res.status}`);
  }
  const data = await res.json();
  storeTokens({
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresIn: data.expiresIn,
    uid: memoryState.uid,
  });
  return data.idToken;
}
