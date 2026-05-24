// Polling helpers that replace Firebase RTDB/Firestore subscriptions.
//
// Subscriptions in the old SDK fired a callback whenever data changed.
// With pure REST, we approximate that by polling on an interval — fast
// enough to feel real-time for guest lists / settings (15–30s), and we
// expose an `unsubscribe()` returning function so the service-layer
// contract stays the same.
//
// Why not WebSockets / Firestore SDK / SSE for everything:
//   - WebSockets would require a separate backend.
//   - Firestore SDK is what we just removed.
//   - SSE is great for one stream (live driver GPS — handled separately
//     in services/liveLocations.js), but for many short bursts (every
//     groom page tab + every admin tab subscribed) it spawns too many
//     long-lived connections. Polling is cheaper for these.
//
// What this file does NOT do:
//   - It does not deduplicate identical results — callers should bail
//     out in their callback if nothing changed. The poller fires on
//     every successful fetch.
//   - It does not back off after errors. Network errors continue at the
//     same interval; the next successful fetch resumes normal behavior.

import { ApiError } from "./apiClient.js";
import { logErr } from "./logger.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Default poll interval when the caller doesn't specify one. */
const DEFAULT_INTERVAL_MS = 15 * 1000;

/** Min interval guard — anything below this hammers the API for little gain. */
const MIN_INTERVAL_MS = 1000;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run `fetchFn()` immediately, then again every `intervalMs` until the
 * returned function is called. Each successful result is delivered to
 * `callback`. Errors are logged and skipped — the next tick retries.
 *
 * Special case: `session_expired` (401 from apiClient) propagates by
 * calling `callback(null)`. The hook layer treats this as a sign to
 * route the user to login.
 *
 * @param {() => Promise<any>} fetchFn   one-shot fetch invocation
 * @param {(value: any) => void} callback  receives each successful result
 * @param {Object} [opts]
 * @param {number} [opts.intervalMs=15000]  poll interval in milliseconds
 * @param {(err: Error) => void} [opts.onError]  called on non-401 network errors
 * @returns {() => void}  unsubscribe handle
 */
export function createPoller(fetchFn, callback, opts) {
  if (typeof fetchFn !== "function") {
    throw new Error("createPoller: fetchFn must be a function");
  }
  if (typeof callback !== "function") {
    throw new Error("createPoller: callback must be a function");
  }
  const intervalMs = Math.max(MIN_INTERVAL_MS, opts?.intervalMs ?? DEFAULT_INTERVAL_MS);
  const onError = opts?.onError ?? null;

  let stopped = false;
  let timer = null;

  const tick = async () => {
    if (stopped) return;
    try {
      const value = await fetchFn();
      if (!stopped) callback(value);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // Session expired — surface to the consumer and stop polling.
        callback(null);
        stopped = true;
        return;
      }
      logErr("poller.tick", err);
      if (onError && !stopped) onError(err);
      // Other errors: swallow and let the next tick retry.
    } finally {
      if (!stopped) {
        timer = setTimeout(tick, intervalMs);
      }
    }
  };

  // Fire once synchronously (on the microtask queue) so the first paint
  // doesn't wait the full interval for initial data.
  tick();

  return function unsubscribe() {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
