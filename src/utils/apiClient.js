// REST API client used by every service file.
//
// Wraps `fetch()` with:
//   - Automatic `Authorization: Bearer <idToken>` header (via tokenManager.js)
//   - On 401: one-shot refresh + retry; second failure → clearTokens + notify
//   - JSON parsing on success and on error (so callers get `{ error: "..." }`)
//   - File upload (multipart/form-data) via api.upload() — does NOT JSON-encode
//   - Optional `skipAuth: true` for public endpoints (login, OTP, confirm form)
//
// Error convention:
//   - Network errors throw `Error` with a generic message.
//   - HTTP errors throw `ApiError` with `.status` (number) and `.body` (object).
//     Service-layer code can branch on `err.status === 401` etc. when needed.
//
// What this file does NOT do:
//   - It does not paginate. Callers handle that.
//   - It does not cache. Callers handle that (or use poller.js).

import {
  getIdToken,
  refreshIdToken,
  clearTokens,
  setAuthClearedCallback,
} from "./tokenManager.js";
import { logErr, log } from "./logger.js";
import { westernizeDeep } from "./digits.js";
import { API_BASE_URL, API_TIMEOUT_MS } from "../config/index.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const HEADER_AUTH = "Authorization";
const HEADER_CONTENT_TYPE = "Content-Type";
const JSON_MIME = "application/json";
const BEARER_PREFIX = "Bearer ";

const HTTP_UNAUTHORIZED = 401;

// ─── ApiError ─────────────────────────────────────────────────────────────────

/**
 * Thrown when an HTTP response is not 2xx. Carries the parsed body so
 * UI code can show field-level errors without re-parsing.
 */
export class ApiError extends Error {
  constructor(status, body, message) {
    super(message || `api_error_${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body ?? null;
  }
}

// ─── Auth-change notification ─────────────────────────────────────────────────

/**
 * Fires when the session can no longer be refreshed (tokens cleared by
 * tokenManager.js or by apiClient.js on retry failure). The portal hook
 * subscribes so it can route the user back to the login screen.
 */
let authChangeCb = null;
export function setAuthChangeCallback(cb) {
  authChangeCb = typeof cb === "function" ? cb : null;
}

// Forward tokenManager's clear notifications to the consumer-provided cb.
setAuthClearedCallback(() => {
  if (authChangeCb) authChangeCb(null);
});

// ─── Public surface ───────────────────────────────────────────────────────────

export const api = {
  /**
   * GET request. Returns the parsed JSON body or throws ApiError.
   * @param {string} path  path relative to the API base, must start with `/`
   * @param {Object} [opts]
   * @param {boolean} [opts.skipAuth]
   */
  get: (path, opts) => request("GET", path, undefined, opts),

  /**
   * POST with a JSON body. Body is serialized for you; do NOT pass FormData.
   * For file uploads use `api.upload`.
   */
  post: (path, body, opts) => request("POST", path, body, opts),

  patch: (path, body, opts) => request("PATCH", path, body, opts),
  put: (path, body, opts) => request("PUT", path, body, opts),

  /**
   * DELETE. `body` is optional (most DELETE routes ignore it).
   */
  delete: (path, body, opts) => request("DELETE", path, body, opts),

  /**
   * Multipart upload. `formData` must be a FormData instance. Auth header
   * is still attached unless `opts.skipAuth` is set.
   */
  upload: (path, formData, opts) => upload(path, formData, opts),
};

/**
 * Build the absolute URL for a path. Exported for the SSE consumer which
 * has to construct a URL with a query-string token outside this module.
 *
 * @param {string} path
 * @returns {string}
 */
export function buildApiUrl(path) {
  if (!path.startsWith("/")) path = `/${path}`;
  return `${API_BASE_URL}${path}`;
}

// ─── Core request loop ────────────────────────────────────────────────────────

/**
 * Generic JSON request handler with one-shot 401 → refresh → retry.
 * Public endpoints set `opts.skipAuth = true` so the Authorization header
 * is not attached (and a missing token isn't surfaced as a noisy error).
 */
async function request(method, path, body, opts) {
  const url = buildApiUrl(path);
  const skipAuth = !!opts?.skipAuth;
  const timeoutMs = opts?.timeoutMs ?? API_TIMEOUT_MS.DEFAULT;
  const headers = { Accept: JSON_MIME };
  if (body !== undefined) headers[HEADER_CONTENT_TYPE] = JSON_MIME;

  // Normalize Arabic-Indic digits to Western before they ever reach the API,
  // so the database only stores ASCII digits. Password fields are preserved.
  const safeBody = body === undefined ? undefined : westernizeDeep(body);

  if (!skipAuth) {
    const tok = await getIdToken().catch(() => null);
    if (tok) headers[HEADER_AUTH] = `${BEARER_PREFIX}${tok}`;
  }

  const res = await fetchWithTimeout(url, {
    method,
    headers,
    body: safeBody === undefined ? undefined : JSON.stringify(safeBody),
  }, timeoutMs, `${method} ${path}`);

  if (res.status === HTTP_UNAUTHORIZED && !skipAuth) {
    return handleUnauthorized(method, url, headers, safeBody, path, timeoutMs);
  }
  return parseResponse(res, method, path);
}

/**
 * On a 401: attempt one refresh + retry. If the retry still fails, fire the
 * auth-change callback so the UI can route to login.
 */
async function handleUnauthorized(method, url, headers, body, path, timeoutMs) {
  log(`apiClient: 401 on ${method} ${path}; attempting refresh`);
  try {
    const fresh = await refreshIdToken();
    if (fresh) headers[HEADER_AUTH] = `${BEARER_PREFIX}${fresh}`;
  } catch (err) {
    logErr("apiClient.refresh", err);
    clearTokens();
    if (authChangeCb) authChangeCb(null);
    throw new ApiError(HTTP_UNAUTHORIZED, null, "session_expired");
  }

  const retryRes = await fetchWithTimeout(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }, timeoutMs ?? API_TIMEOUT_MS.DEFAULT, `${method} ${path} (retry)`);
  if (retryRes.status === HTTP_UNAUTHORIZED) {
    clearTokens();
    if (authChangeCb) authChangeCb(null);
    throw new ApiError(HTTP_UNAUTHORIZED, null, "session_expired");
  }
  return parseResponse(retryRes, method, path);
}

/**
 * Multipart upload. `Content-Type` is NOT set — the browser fills it in
 * with the proper boundary. We still attach Authorization unless skipped.
 *
 * Honors `opts.signal` (caller-supplied AbortSignal) so a component can
 * abort the upload on unmount. The internal timeout uses a separate signal
 * combined with the caller's via AbortSignal.any() when available.
 */
async function upload(path, formData, opts) {
  if (!(formData instanceof FormData)) {
    throw new Error("upload: formData must be a FormData instance");
  }
  const url = buildApiUrl(path);
  const skipAuth = !!opts?.skipAuth;
  const timeoutMs = opts?.timeoutMs ?? API_TIMEOUT_MS.UPLOAD;
  const headers = { Accept: JSON_MIME };
  if (!skipAuth) {
    const tok = await getIdToken().catch(() => null);
    if (tok) headers[HEADER_AUTH] = `${BEARER_PREFIX}${tok}`;
  }

  let res = await fetchWithTimeout(url, {
    method: "POST",
    headers,
    body: formData,
  }, timeoutMs, `upload ${path}`, opts?.signal);
  if (res.status === HTTP_UNAUTHORIZED && !skipAuth) {
    try {
      const fresh = await refreshIdToken();
      if (fresh) headers[HEADER_AUTH] = `${BEARER_PREFIX}${fresh}`;
    } catch {
      clearTokens();
      if (authChangeCb) authChangeCb(null);
      throw new ApiError(HTTP_UNAUTHORIZED, null, "session_expired");
    }
    res = await fetchWithTimeout(url, {
      method: "POST",
      headers,
      body: formData,
    }, timeoutMs, `upload ${path} (retry)`, opts?.signal);
    if (res.status === HTTP_UNAUTHORIZED) {
      clearTokens();
      if (authChangeCb) authChangeCb(null);
      throw new ApiError(HTTP_UNAUTHORIZED, null, "session_expired");
    }
  }
  return parseResponse(res, "POST", path);
}

// ─── Fetch with timeout ──────────────────────────────────────────────────────

/**
 * Wraps `fetch` so a stalled request rejects after `timeoutMs` instead of
 * hanging the spinner forever. Combines an internal AbortController with an
 * optional caller-supplied signal so components can also cancel on unmount.
 *
 * Errors:
 *   - timeout    → throws `Error("request_timeout")`
 *   - user abort → throws the original AbortError (callers can re-throw it)
 *   - other      → rethrown as `Error("network_error")` with original logged
 */
async function fetchWithTimeout(url, init, timeoutMs, label, userSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
  const onUserAbort = () => controller.abort(userSignal.reason);
  if (userSignal) {
    if (userSignal.aborted) {
      clearTimeout(timer);
      throw userSignal.reason ?? new DOMException("Aborted", "AbortError");
    }
    userSignal.addEventListener("abort", onUserAbort);
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) {
      // Distinguish timeout from user abort by checking the reason we set.
      if (userSignal?.aborted) {
        throw userSignal.reason ?? new DOMException("Aborted", "AbortError");
      }
      logErr(`apiClient.timeout ${label}`, `after ${timeoutMs}ms`);
      throw new Error("request_timeout");
    }
    logErr(`apiClient.fetch ${label}`, err);
    throw new Error("network_error");
  } finally {
    clearTimeout(timer);
    if (userSignal) userSignal.removeEventListener("abort", onUserAbort);
  }
}

// ─── Response parsing ─────────────────────────────────────────────────────────

/**
 * Parse the response. 204 No Content is treated as `null`. Any other 2xx
 * is JSON-decoded. Non-2xx is JSON-decoded and re-thrown as an ApiError
 * (with the parsed body) so the caller can show field-level error info.
 */
async function parseResponse(res, method, path) {
  if (res.status === 204) return null;
  let parsed;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    const msg = parsed?.error ? `api_${parsed.error}` : `api_${res.status}`;
    logErr(`apiClient ${method} ${path}`, msg);
    throw new ApiError(res.status, parsed, msg);
  }
  return parsed;
}
