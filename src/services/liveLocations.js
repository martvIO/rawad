// Live-location service — REST writes + SSE subscribe.
//
//   POST /api/live-locations           driver publishes a fix
//   POST /api/live-locations/clear     driver stops sharing
//   GET  /api/live-locations/:groomUid/stream  Server-Sent Events stream
//
// The SSE endpoint pushes the full /liveLocationsByGroom/{groomUid} value
// on every RTDB change. EventSource cannot set custom Authorization headers,
// so we attach the idToken via `?token=` query string. The TLS layer keeps
// it confidential in transit; the token never appears in non-SSE URLs.

import { api } from "../utils/apiClient.js";
import { peekIdToken } from "../utils/tokenManager.js";
import { logErr } from "../utils/logger.js";
import { SSE_BASE_URL } from "../config/index.js";

// ─── REST writes ──────────────────────────────────────────────────────────────

/**
 * Publish a GPS fix to every groom in `shareWith`.
 *
 * @param {string} _driverUidUnused  kept for signature compat (uid comes from token)
 * @param {string|undefined} driverDisplayName
 * @param {{lat, lng, accuracy?}} fix
 * @param {string[]} shareWith  groomUids
 */
export async function publishMyFix(_driverUidUnused, driverDisplayName, fix, shareWith) {
  if (!Array.isArray(shareWith) || shareWith.length === 0) return;
  return api.post("/live-locations", {
    fix: {
      lat: fix.lat,
      lng: fix.lng,
      accuracy: fix.accuracy ?? 0,
    },
    driverDisplayName: driverDisplayName || undefined,
    shareWith,
  });
}

/**
 * Stop sharing with every groomUid in `formerShareWith`. Idempotent — a
 * groomUid that no longer has a record on the server is silently skipped.
 *
 * @param {string} _driverUidUnused
 * @param {string[]} formerShareWith
 */
export async function clearMyLocation(_driverUidUnused, formerShareWith) {
  if (!Array.isArray(formerShareWith) || formerShareWith.length === 0) return;
  return api.post("/live-locations/clear", { formerShareWith });
}

// ─── SSE subscription ─────────────────────────────────────────────────────────

/**
 * Subscribe to every driver currently sharing with the given groom. Wraps
 * `EventSource` so the consumer contract matches the legacy RTDB listener:
 * `cb({ [driverUid]: { lat, lng, accuracy, timeISO, driverDisplayName? } })`
 *
 * The returned function tears down the EventSource cleanly.
 *
 * @param {string} groomUid
 * @param {(value: object) => void} cb
 * @returns {() => void} unsubscribe
 */
export function subscribeDriversForGroom(groomUid, cb) {
  if (!groomUid) {
    queueMicrotask(() => cb({}));
    return () => {};
  }
  const token = peekIdToken();
  if (!token) {
    // No session — surface empty and don't bother opening the stream.
    queueMicrotask(() => cb({}));
    return () => {};
  }
  // Direct Cloud Run URL (NOT same-origin /api) — Hosting buffers SSE so the
  // stream never connects through the rewrite. See SSE_BASE_URL in config.
  const url = `${SSE_BASE_URL}/live-locations/${groomUid}/stream?token=${encodeURIComponent(token)}`;
  let es;
  try {
    es = new EventSource(url);
  } catch (err) {
    logErr("subscribeDriversForGroom:open", err);
    queueMicrotask(() => cb({}));
    return () => {};
  }
  es.onmessage = (evt) => {
    try {
      const parsed = JSON.parse(evt.data);
      cb(parsed && typeof parsed === "object" ? parsed : {});
    } catch (err) {
      logErr("subscribeDriversForGroom:parse", err);
    }
  };
  es.onerror = (err) => {
    // The browser auto-reconnects on transient failures. We log but don't
    // notify the caller — they keep their last-known snapshot.
    logErr("subscribeDriversForGroom:error", err);
  };
  return function unsubscribe() {
    try {
      es.close();
    } catch {
      // noop
    }
  };
}
