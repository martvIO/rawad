// Guest face-enrollment + photo-matching service (PUBLIC token endpoints).
//
// Backs the /d/:groomUsername/:token/photos page:
//   GET    /digital/photos/matches?token=…  enrollment state + matched photos
//   POST   /digital/photos/enroll           store the guest's 128-D descriptor
//   DELETE /digital/photos/enroll           erase the guest's face data
//
// The descriptor is extracted IN THE GUEST'S BROWSER (the selfie never
// leaves the device); the server keeps only the numeric face signature,
// auto-deleted when the invite token expires.

import { api } from "../utils/apiClient.js";
import { createPoller } from "../utils/poller.js";
import { POLL_MS } from "../config/index.js";

/**
 * One-shot read of the guest's enrollment state + current matches.
 * @returns {Promise<{published:boolean, enrolled:boolean, expiresAt:number|null,
 *                    matches:Array<{fileId,name,url,distance}>}>}
 */
export async function fetchFaceMatches(token) {
  return api.get(`/digital/photos/matches?token=${encodeURIComponent(token)}`, {
    skipAuth: true,
  });
}

/**
 * Poll the matches endpoint so the page auto-advances when the groom
 * publishes the photos and auto-refreshes as new photos are indexed.
 * Token-level rate limiting on the server is sized for this interval.
 *
 * @param {string} token
 * @param {(state: object) => void} cb
 * @param {(err: Error) => void} [onErr]  invalid/expired tokens land here
 * @returns {() => void} unsubscribe
 */
export function subscribeFaceMatches(token, cb, onErr) {
  return createPoller(() => fetchFaceMatches(token), cb, {
    intervalMs: POLL_MS.DIGITAL,
    onError: onErr,
  });
}

/**
 * Store the guest's face descriptor after the consent screen.
 * Returns the first match results in the same round trip.
 * @param {string} token
 * @param {number[]} descriptor  Array.from(<Float32Array len 128>)
 * @returns {Promise<{ok:boolean, expiresAt:number, matches:Array}>}
 */
export async function enrollFaceDescriptor(token, descriptor) {
  return api.post("/digital/photos/enroll", { token, descriptor }, { skipAuth: true });
}

/**
 * Erase the guest's stored face descriptor. Idempotent.
 */
export async function deleteFaceEnrollment(token) {
  return api.delete("/digital/photos/enroll", { token }, { skipAuth: true });
}
