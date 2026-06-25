// Live-location service — REST writes + SSE subscribe.
//
//   POST /api/live-locations           driver publishes a fix
//   POST /api/live-locations/clear     driver stops sharing
//   GET  /api/live-locations/:groomUid/stream  Server-Sent Events stream
//
// The SSE endpoint pushes the full /liveLocationsByGroom/{groomUid} value on
// every RTDB change. EventSource cannot set Authorization headers, so the auth
// token rides in the URL — we use a SHORT-LIVED (~5-min) stream token minted via
// POST /:groomUid/stream-token instead of the long-lived idToken, and re-mint
// shortly before it expires, so a URL leak is bounded to minutes + one groom's
// read-only GPS (the stream is GET-only — a leaked token can't change anything).

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
  if (!peekIdToken()) {
    // No session — surface empty and don't bother minting / opening the stream.
    queueMicrotask(() => cb({}));
    return () => {};
  }

  let es = null;
  let refreshTimer = null;
  let closed = false;

  const teardownEs = () => {
    if (es) {
      try { es.close(); } catch { /* noop */ }
      es = null;
    }
  };

  // Mint a fresh short-lived stream token, (re)open the EventSource with it, and
  // schedule a re-mint shortly before it expires so the auto-reconnect never
  // hits a 401 with a dead token.
  const openWithFreshToken = async () => {
    if (closed) return;
    let streamToken;
    let expiresInMs = 5 * 60_000;
    try {
      const res = await api.post(`/live-locations/${groomUid}/stream-token`, {});
      streamToken = res?.streamToken;
      expiresInMs = Number(res?.expiresInMs) || expiresInMs;
    } catch (err) {
      logErr("subscribeDriversForGroom:mint", err);
      queueMicrotask(() => cb({}));
      // Retry minting later (e.g. transient network) unless torn down.
      if (!closed) refreshTimer = setTimeout(openWithFreshToken, 30_000);
      return;
    }
    if (closed) return;
    if (!streamToken) { queueMicrotask(() => cb({})); return; }

    teardownEs();
    // Direct Cloud Run URL (NOT same-origin /api) — Hosting buffers SSE so the
    // stream never connects through the rewrite. See SSE_BASE_URL in config.
    const url = `${SSE_BASE_URL}/live-locations/${groomUid}/stream?streamToken=${encodeURIComponent(streamToken)}`;
    try {
      es = new EventSource(url);
    } catch (err) {
      logErr("subscribeDriversForGroom:open", err);
      queueMicrotask(() => cb({}));
      return;
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

    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(openWithFreshToken, Math.max(30_000, expiresInMs - 30_000));
  };

  openWithFreshToken();

  return function unsubscribe() {
    closed = true;
    if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
    teardownEs();
  };
}
