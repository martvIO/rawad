// Fetch helpers for every route in the shared FastAPI dashboard contract,
// plus a useEventSource() hook for the /api/run/stream SSE feed.
//
// All requests are same-origin: in dev, Vite proxies /api + /artifacts to the
// FastAPI backend (127.0.0.1:8765); in prod the backend serves this SPA.

import { useEffect, useRef, useState, useCallback } from "react";

async function req(path, { method = "GET", body, signal } = {}) {
  const opts = { method, headers: {}, signal };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const err = new Error(
      (data && data.error) || `${method} ${path} failed (${res.status})`
    );
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

// ---- Config ---------------------------------------------------------------
export const getConfig = () => req("/api/config");
export const putConfig = (config) => req("/api/config", { method: "PUT", body: config });

// ---- Credentials ----------------------------------------------------------
export const getCredentials = () => req("/api/credentials");
export const putCredentials = (creds) =>
  req("/api/credentials", { method: "PUT", body: creds });

// ---- Presets --------------------------------------------------------------
export const getPresets = () => req("/api/presets");
export const putPreset = (name, config) =>
  req(`/api/presets/${encodeURIComponent(name)}`, { method: "PUT", body: config });
export const deletePreset = (name) =>
  req(`/api/presets/${encodeURIComponent(name)}`, { method: "DELETE" });

// ---- Run ------------------------------------------------------------------
// startRun resolves with the response body on success. On a 428 the caller
// must catch the error (err.status === 428) and show the prod-confirm modal.
export const startRun = (config, confirmProduction = false) =>
  req("/api/run", {
    method: "POST",
    body: { config, confirm_production: confirmProduction },
  });
export const stopRun = () => req("/api/run/stop", { method: "POST" });
export const getRunStatus = () => req("/api/run/status");
export const retryCleanup = () => req("/api/cleanup/retry", { method: "POST" });

// ---- Results --------------------------------------------------------------
export const getLatestResults = () => req("/api/results/latest");
export const archiveRun = () => req("/api/archive", { method: "POST" });

// ---- History --------------------------------------------------------------
export const getHistory = () => req("/api/history");
export const getHistoryItem = (id) => req(`/api/history/${encodeURIComponent(id)}`);
export const deleteHistoryItem = (id) =>
  req(`/api/history/${encodeURIComponent(id)}`, { method: "DELETE" });
export const getTimeseries = (id) =>
  req(`/api/history/${encodeURIComponent(id)}/timeseries`);
export const getCompare = (a, b) =>
  req(`/api/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);

// ---------------------------------------------------------------------------
// useEventSource — subscribe to the SSE run stream.
//
// Returns { state, lastStats, stats, cleanup, done, connected }.
//  - state:      latest payload from a "state" event (run lifecycle)
//  - lastStats:  latest "stats" snapshot object
//  - stats:      accumulated array of "stats" snapshots (for live charts)
//  - cleanup:    latest "cleanup" payload
//  - done:       latest "done" payload (run finished)
//  - connected:  whether the EventSource is currently open
//
// Auto-reconnects on error and cleans up on unmount. Pass resetKey to clear the
// accumulated stats buffer (e.g. when a new run starts).
// ---------------------------------------------------------------------------
export function useEventSource(path = "/api/run/stream", resetKey = null) {
  const [state, setState] = useState(null);
  const [lastStats, setLastStats] = useState(null);
  const [stats, setStats] = useState([]);
  const [cleanup, setCleanup] = useState(null);
  const [done, setDone] = useState(null);
  const [connected, setConnected] = useState(false);

  const esRef = useRef(null);
  const reconnectRef = useRef(null);
  const mountedRef = useRef(true);

  // Clear accumulated buffers whenever resetKey changes.
  useEffect(() => {
    setStats([]);
    setLastStats(null);
    setCleanup(null);
    setDone(null);
  }, [resetKey]);

  const parse = (raw) => {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  };

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    try {
      const es = new EventSource(path);
      esRef.current = es;

      es.onopen = () => mountedRef.current && setConnected(true);

      es.addEventListener("state", (e) => {
        if (!mountedRef.current) return;
        setState(parse(e.data));
      });

      es.addEventListener("stats", (e) => {
        if (!mountedRef.current) return;
        const snap = parse(e.data);
        setLastStats(snap);
        setStats((prev) => {
          const next = prev.concat(snap);
          // cap memory for very long runs
          return next.length > 5000 ? next.slice(next.length - 5000) : next;
        });
      });

      es.addEventListener("cleanup", (e) => {
        if (!mountedRef.current) return;
        setCleanup(parse(e.data));
      });

      es.addEventListener("done", (e) => {
        if (!mountedRef.current) return;
        setDone(parse(e.data));
      });

      es.onerror = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        try {
          es.close();
        } catch {
          /* noop */
        }
        // auto-reconnect after a short delay
        reconnectRef.current = setTimeout(() => {
          if (mountedRef.current) connect();
        }, 2500);
      };
    } catch {
      // EventSource unavailable; retry later
      reconnectRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, 2500);
    }
  }, [path]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (esRef.current) {
        try {
          esRef.current.close();
        } catch {
          /* noop */
        }
      }
    };
  }, [connect]);

  return { state, lastStats, stats, cleanup, done, connected };
}

// ---------------------------------------------------------------------------
// Helpers shared across components.
// ---------------------------------------------------------------------------

// Is a given base_url pointed at a local loopback host?
export function isLocalhost(url) {
  if (!url) return false;
  try {
    const h = new URL(url).hostname;
    return (
      h === "localhost" ||
      h === "127.0.0.1" ||
      h === "0.0.0.0" ||
      h === "::1" ||
      h.endsWith(".local")
    );
  } catch {
    return false;
  }
}

export function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url || "";
  }
}
