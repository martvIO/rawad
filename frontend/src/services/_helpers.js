// Shared service helpers for the REST-based services layer.
//
// Pre-migration this file wrapped two Firebase patterns:
//   1. RTDB onValue → list array  (subscribeList)
//   2. httpsCallable + claim-refresh retry  (callable)
//
// In the REST world both are gone:
//   - Real-time RTDB subscriptions are replaced by api.get() + createPoller().
//   - Callable functions are replaced by api.post() with Bearer tokens
//     (token refresh + retry on 401 is handled inside apiClient.js).
//
// This module now exports one helper:
//   - subscribeList(endpoint, callback, opts?) → polling wrapper around api.get
//
// Service files import this when they need polling behaviour. For non-list
// reads (one-shot, no subscription) they use api.get() directly.

import { api } from "../utils/apiClient.js";
import { createPoller } from "../utils/poller.js";
import { POLL_MS } from "../config/index.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Default poll interval matches the legacy onValue cadence for list views. */
const DEFAULT_LIST_INTERVAL_MS = POLL_MS.DEFAULT;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Subscribe to a list endpoint by polling. Fires `callback(items)` on the
 * first response and then on every successful tick. Returns the standard
 * unsubscribe function.
 *
 * @param {string} endpoint  API path (starts with `/`)
 * @param {(items: any[]) => void} callback
 * @param {Object} [opts]
 * @param {number} [opts.intervalMs=15000]
 * @returns {() => void}
 */
export function subscribeList(endpoint, callback, opts) {
  return createPoller(
    () => api.get(endpoint),
    (value) => {
      // Match legacy semantics: null/undefined → empty list.
      if (value === null || value === undefined) {
        callback([]);
        return;
      }
      callback(Array.isArray(value) ? value : []);
    },
    { intervalMs: opts?.intervalMs ?? DEFAULT_LIST_INTERVAL_MS },
  );
}
