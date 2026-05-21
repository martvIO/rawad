// Confirmations service — REST replacement.
//
// Endpoints (all under /api/confirmations):
//   GET    /confirmations               admin: list (replaces RTDB subscribe)
//   PATCH  /confirmations/:id           admin: edit a row
//   POST   /confirmations               PUBLIC (5/hr/IP): guest submission
//   POST   /confirmations/attach-location  admin (30/hr): manual attach

import { api } from "../utils/apiClient.js";
import { subscribeList } from "./_helpers.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const CONFIRMATIONS_POLL_INTERVAL_MS = 15 * 1000;

// ─── Subscriptions ────────────────────────────────────────────────────────────

/**
 * Admin-only live feed of every confirmation row. Server returns
 * `[{ id, ...record }]`.
 */
export function subscribeConfirmations(cb) {
  return subscribeList("/confirmations", cb, {
    intervalMs: CONFIRMATIONS_POLL_INTERVAL_MS,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Public guest submission. No auth needed. Payload shape mirrors the legacy
 * onCall: `{ groomUsername, submittedName, submittedPhone, submittedCity,
 * submittedStreet?, submittedHouse?, lat?, lng?, locationAccuracy? }`.
 * Server resolves groomUid, writes the record, and best-effort auto-attaches
 * to a matching guest.
 */
export async function submitConfirmation(payload) {
  return api.post("/confirmations", payload, { skipAuth: true });
}

/**
 * Admin-only: copy a confirmation's stored coords onto a specific guest.
 * Body shape: `{ confirmationId, guestId }`.
 */
export async function attachConfirmationLocationToGuest(input) {
  return api.post("/confirmations/attach-location", input);
}

/**
 * Admin-only: patch a confirmation row. Server enforces allowed fields.
 */
export async function updateConfirmation(id, patch) {
  return api.patch(`/confirmations/${id}`, patch);
}
