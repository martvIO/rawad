// Wedding (groom-account) lifecycle service — REST wrapper over /api/lifecycle.
//
// A "wedding" is a groom account, so cancel / postpone / restore are status
// transitions on that account. Groom self-serve calls act on the caller's own
// account; admin calls take a target uid; the public call needs no auth and
// drives the guest-facing cancelled/postponed notice.

import { api } from "../utils/apiClient.js";

// ── Groom self-serve ──────────────────────────────────────────────────────────

/** GET the caller's own status block: { lifecycleStatus, cancel*, paused* }. */
export function getMyLifecycle() {
  return api.get("/lifecycle/me");
}

/** Request cancellation (active|paused → cancel_pending, grace window starts). */
export function requestCancellation(reason) {
  return api.post("/lifecycle/cancel", { reason: reason ?? "" });
}

/** Undo a pending cancellation while still within the grace window. */
export function undoCancellation() {
  return api.post("/lifecycle/cancel/undo");
}

/** Postpone (active → paused), optionally announcing a new date (epoch ms). */
export function pauseWedding(newDate) {
  return api.post("/lifecycle/pause", newDate ? { newDate } : {});
}

/** Lift a postpone (paused → active). */
export function resumeWedding() {
  return api.post("/lifecycle/resume");
}

// ── Admin ─────────────────────────────────────────────────────────────────────

/** List every non-active account (the admin lifecycle inbox). */
export function listLifecyclePending() {
  return api.get("/lifecycle/pending");
}

/** Finalise a pending cancellation immediately (cancel_pending → cancelled). */
export function confirmCancellation(uid) {
  return api.post(`/lifecycle/${uid}/confirm-cancel`);
}

/** Restore any frozen account back to active. */
export function restoreWedding(uid) {
  return api.post(`/lifecycle/${uid}/restore`);
}

// ── Public (no auth) ──────────────────────────────────────────────────────────

/** Resolve a groom username to { available, state, pausedNewDate } for the
 *  /confirm/:username form, so it can show a cancelled/postponed notice. */
export function getPublicEventState(username) {
  return api.get(`/lifecycle/public/${encodeURIComponent(username)}`, {
    skipAuth: true,
  });
}
