// Driver ↔ groom assignment service.
//
// Endpoints:
//   POST /api/assignments              driver-self-assign by groom username
//   GET  /api/assignments/:driverUid   list assignments (driver or admin)

import { api } from "../utils/apiClient.js";
import { createPoller } from "../utils/poller.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const ASSIGNMENTS_POLL_INTERVAL_MS = 30 * 1000;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Self-assign the currently signed-in driver to a groom. Server re-stamps
 * the driver's `assignedGrooms` custom claim so Storage rules see the
 * permission on the next request.
 *
 * @param {string} groomUsername
 * @returns {Promise<{groomUid, groomUsername}>}
 */
export async function assignDriverToGroom(groomUsername) {
  return api.post("/assignments", { groomUsername });
}

/**
 * Subscribe to the set of grooms a given driver may serve. Returns an
 * object `{ [groomUid]: true }` — matches the legacy RTDB shape so
 * downstream code keys by groomUid without changes.
 *
 * @param {string} driverUid
 * @param {(value: object) => void} cb
 * @returns {() => void} unsubscribe
 */
export function subscribeAssignmentsFor(driverUid, cb) {
  if (!driverUid) {
    queueMicrotask(() => cb({}));
    return () => {};
  }
  return createPoller(
    () => api.get(`/assignments/${driverUid}`),
    (value) => cb(value && typeof value === "object" ? value : {}),
    { intervalMs: ASSIGNMENTS_POLL_INTERVAL_MS },
  );
}
