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
import { encryptPasswordFields, resetPublicKeyCache } from "./passwordCrypto.js";
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

  // Encrypt password fields (RSA-OAEP) so a plaintext password never appears in
  // server/proxy access logs or a DevTools-visible body. Best-effort: a missing
  // server key OR any crypto failure must never break the request, so fall back
  // to the (already TLS-protected) plaintext body.
  let sendBody = safeBody;
  if (safeBody !== undefined) {
    try {
      sendBody = await encryptPasswordFields(safeBody);
    } catch (err) {
      logErr("apiClient.encrypt", err);
      sendBody = safeBody;
    }
  }

  if (!skipAuth) {
    const tok = await getIdToken().catch(() => null);
    if (tok) headers[HEADER_AUTH] = `${BEARER_PREFIX}${tok}`;
  }

  const res = await fetchWithTimeout(url, {
    method,
    headers,
    body: sendBody === undefined ? undefined : JSON.stringify(sendBody),
  }, timeoutMs, `${method} ${path}`);

  if (res.status === HTTP_UNAUTHORIZED && !skipAuth) {
    return handleUnauthorized(method, url, headers, sendBody, path, timeoutMs);
  }
  try {
    return await parseResponse(res, method, path);
  } catch (err) {
    // The server rejected our password encryption — either our ciphertext was
    // undecryptable (`bad_encrypted_field`, e.g. a dev key rotation left a stale
    // public key) or the server requires encryption and we sent plaintext
    // (`encryption_required`, e.g. a transient pubkey outage). Both are emitted
    // only by the decrypt middleware. Drop the cached key and retry ONCE with a
    // fresh fetch (re-encrypting the original body from the top).
    const encErr =
      err instanceof ApiError &&
      (err.body?.error === "bad_encrypted_field" ||
        err.body?.error === "encryption_required");
    if (encErr && !opts?._retriedEnc) {
      resetPublicKeyCache();
      return request(method, path, body, { ...opts, _retriedEnc: true });
    }
    throw err;
  }
}

/**
 * On a 401: attempt one refresh + retry. If the retry still fails, fire the
 * auth-change callback so the UI can route to login.
 *
 * `body` here is the already-encrypted payload; the retry replays the SAME
 * ciphertext (RSA-OAEP output stays valid for the same server key) — it does NOT
 * re-encrypt. This path deliberately skips the bad_encrypted_field self-heal:
 * the decrypt middleware runs BEFORE requireAuth, so a stale-key envelope yields
 * 400 bad_encrypted_field (handled by request()'s catch) rather than a 401, and a
 * 401 only happens when decryption already succeeded — so the replayed ciphertext
 * cannot newly fail to decrypt within the same in-flight request.
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
 * abort the upload on unmount, and `opts.timeoutMs` for the request budget.
 *
 * `opts.onProgress(fraction)` — when a function is supplied, the upload is
 * sent via `XMLHttpRequest` (the only browser API that reports upload bytes)
 * and `onProgress` is called with 0..1 as the file streams out. Without it,
 * the original `fetch` path is used verbatim, so every existing caller (and
 * the unit tests) is byte-for-byte unaffected.
 */
async function upload(path, formData, opts) {
  if (!(formData instanceof FormData)) {
    throw new Error("upload: formData must be a FormData instance");
  }
  const url = buildApiUrl(path);
  const skipAuth = !!opts?.skipAuth;
  const timeoutMs = opts?.timeoutMs ?? API_TIMEOUT_MS.UPLOAD;
  const onProgress = typeof opts?.onProgress === "function" ? opts.onProgress : null;
  const useXhr = !!onProgress && typeof XMLHttpRequest !== "undefined";
  const headers = { Accept: JSON_MIME };
  if (!skipAuth) {
    const tok = await getIdToken().catch(() => null);
    if (tok) headers[HEADER_AUTH] = `${BEARER_PREFIX}${tok}`;
  }

  // Both attempts go through the same sender so the 401 → refresh → retry
  // logic is identical whether we're on the XHR or the fetch path. `headers`
  // is mutated in place on refresh; the sender reads it fresh each call.
  const send = (label) =>
    useXhr
      ? xhrUpload(url, formData, { headers, timeoutMs, signal: opts?.signal, onProgress })
      : fetchWithTimeout(url, { method: "POST", headers, body: formData }, timeoutMs, label, opts?.signal);

  let res = await send(`upload ${path}`);
  if (res.status === HTTP_UNAUTHORIZED && !skipAuth) {
    try {
      const fresh = await refreshIdToken();
      if (fresh) headers[HEADER_AUTH] = `${BEARER_PREFIX}${fresh}`;
    } catch {
      clearTokens();
      if (authChangeCb) authChangeCb(null);
      throw new ApiError(HTTP_UNAUTHORIZED, null, "session_expired");
    }
    res = await send(`upload ${path} (retry)`);
    if (res.status === HTTP_UNAUTHORIZED) {
      clearTokens();
      if (authChangeCb) authChangeCb(null);
      throw new ApiError(HTTP_UNAUTHORIZED, null, "session_expired");
    }
  }
  return parseResponse(res, "POST", path);
}

/**
 * XHR-based multipart upload that reports outgoing progress. Resolves to a
 * minimal fetch-`Response`-like object (`{ status, ok, json() }`) so the
 * shared `parseResponse()` treats it exactly like a `fetch` response.
 *
 * Error parity with `fetchWithTimeout`:
 *   - timeout    → rejects `Error("request_timeout")`
 *   - user abort → rejects the original `signal.reason` (AbortError)
 *   - network    → rejects `Error("network_error")`
 * so the components' existing `reason?.message`/`reason?.name` branches work
 * unchanged.
 */
function xhrUpload(url, formData, { headers, timeoutMs, signal, onProgress }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.responseType = "text";
    if (timeoutMs) xhr.timeout = timeoutMs;
    // Apply auth/accept headers. Never set Content-Type — XHR derives the
    // multipart boundary from the FormData body, same as the fetch path.
    for (const [k, v] of Object.entries(headers || {})) {
      if (k.toLowerCase() === HEADER_CONTENT_TYPE.toLowerCase()) continue;
      try { xhr.setRequestHeader(k, v); } catch { /* ignore invalid header */ }
    }

    let settled = false;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      if (signal) signal.removeEventListener("abort", onAbort);
      fn(arg);
    };
    const onAbort = () => {
      try { xhr.abort(); } catch { /* noop */ }
      finish(reject, signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });

    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) {
          try { onProgress(Math.min(1, e.loaded / e.total)); } catch { /* noop */ }
        }
      };
    }
    xhr.onload = () => {
      if (onProgress) { try { onProgress(1); } catch { /* noop */ } }
      const status = xhr.status;
      const text = xhr.responseText;
      finish(resolve, {
        status,
        ok: status >= 200 && status < 300,
        json: async () => (text ? JSON.parse(text) : null),
      });
    };
    xhr.onerror = () => {
      logErr("apiClient.xhrUpload", `network error for ${url}`);
      finish(reject, new Error("network_error"));
    };
    xhr.ontimeout = () => {
      logErr("apiClient.xhrUpload", `timeout after ${timeoutMs}ms for ${url}`);
      finish(reject, new Error("request_timeout"));
    };
    // A programmatic abort not driven by `signal` (rare) still rejects cleanly.
    xhr.onabort = () => finish(reject, new DOMException("Aborted", "AbortError"));

    xhr.send(formData);
  });
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
