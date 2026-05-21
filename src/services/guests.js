// Guests service — REST replacement for the RTDB CRUD layer.
//
// Endpoints (all under /api/guests):
//   GET    /guests                       admin: flat list across grooms
//   GET    /guests/:groomUid             admin / owning groom / assigned driver
//   POST   /guests/:groomUid             admin / owning groom
//   PATCH  /guests/:groomUid/:id         admin / owning groom / assigned driver
//   DELETE /guests/:groomUid/:id         admin / owning groom

import { api } from "../utils/apiClient.js";
import { createPoller } from "../utils/poller.js";
import { subscribeList } from "./_helpers.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Poll interval for guest-list subscriptions (matches the old onValue feel). */
const GUEST_POLL_INTERVAL_MS = 15 * 1000;

// ─── Subscriptions ────────────────────────────────────────────────────────────

/**
 * Admin-only: flat list of every guest across every groom. Server returns
 * `[{ id, groomUid, ...fields }]` already flattened.
 */
export function subscribeAllGuests(cb) {
  return subscribeList("/guests", cb, { intervalMs: GUEST_POLL_INTERVAL_MS });
}

/**
 * One groom's guests. Same payload shape as subscribeAllGuests but scoped.
 * Falls back to `cb([])` when no groomUid is provided so the consumer can
 * always treat the value as an array.
 */
export function subscribeGuestsForGroom(groomUid, cb) {
  if (!groomUid) {
    queueMicrotask(() => cb([]));
    return () => {};
  }
  return createPoller(
    () => api.get(`/guests/${groomUid}`),
    (value) => cb(Array.isArray(value) ? value : []),
    { intervalMs: GUEST_POLL_INTERVAL_MS },
  );
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function addGuest(groomUid, guest) {
  const result = await api.post(`/guests/${groomUid}`, guest);
  return result?.id ?? null;
}

export async function updateGuest(groomUid, id, patch) {
  return api.patch(`/guests/${groomUid}/${id}`, patch);
}

export async function removeGuest(groomUid, id) {
  return api.delete(`/guests/${groomUid}/${id}`);
}
