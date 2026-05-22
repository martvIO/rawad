// Admin-tweakable settings (WhatsApp message body + form link).
//
// Pre-migration this read /adminSettings from RTDB and patched it via update().
// Post-migration both operations go through /api/settings.

import { api } from "../utils/apiClient.js";
import { createPoller } from "../utils/poller.js";
import { POLL_MS } from "../config/index.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Settings change rarely; 30s polling is more than enough. */
const SETTINGS_POLL_INTERVAL_MS = POLL_MS.SETTINGS;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Subscribe to admin settings. Fires `cb(settings)` on initial load and
 * every 30s thereafter. Settings is an object — never null.
 *
 * @param {(settings: object) => void} cb
 * @returns {() => void} unsubscribe
 */
export function subscribeSettings(cb) {
  return createPoller(
    () => api.get("/settings"),
    (value) => cb(value && typeof value === "object" ? value : {}),
    { intervalMs: SETTINGS_POLL_INTERVAL_MS },
  );
}

/**
 * Patch admin settings. Server rejects unknown keys.
 *
 * @param {{messageBody?: string, formLink?: string}} patch
 */
export async function saveSettings(patch) {
  return api.patch("/settings", patch);
}
