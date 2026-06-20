// Guest face-enrollment + photo-matching service (PUBLIC token endpoints).
//
// Backs the /d/:groomUsername/:token/photos page (AWS Rekognition engine):
//   POST   /digital/photos/liveness/session  start a Face Liveness session
//   POST   /digital/photos/enroll            enroll a selfie (upload or liveness)
//   GET    /digital/photos/matches?token=…   enrollment state + matched photos
//   DELETE /digital/photos/enroll            erase the guest's face data
//   GET    /digital/photos/zip?token=…       download all matched photos (.zip)
//
// The selfie is uploaded and processed by Rekognition on the server; only the
// resulting FaceId is stored, auto-deleted when the invite token expires.

import { api, buildApiUrl } from "../utils/apiClient.js";
import { createPoller } from "../utils/poller.js";
import { POLL_MS } from "../config/index.js";

/**
 * One-shot read of the guest's enrollment state + current matches.
 * @returns {Promise<{published:boolean, enrolled:boolean, expiresAt:number|null,
 *   guestPhone:string|null, matches:Array<{fileId,name,url,similarity}>}>}
 */
async function fetchFaceMatches(token) {
  return api.get(`/digital/photos/matches?token=${encodeURIComponent(token)}`, {
    skipAuth: true,
  });
}

/**
 * Poll the matches endpoint so the page auto-advances when the groom publishes
 * the photos and auto-refreshes as new photos are indexed.
 */
export function subscribeFaceMatches(token, cb, onErr) {
  return createPoller(() => fetchFaceMatches(token), cb, {
    intervalMs: POLL_MS.DIGITAL,
    onError: onErr,
    // Venue guests background this tab constantly — don't keep polling Functions
    // while it's hidden; resume on focus.
    pauseWhenHidden: true,
  });
}

/**
 * Start an AWS Face Liveness session for the camera path.
 * @returns {Promise<{sessionId:string, region:string|null}>}
 */
export async function createLivenessSession(token) {
  return api.post(
    `/digital/photos/liveness/session?token=${encodeURIComponent(token)}`,
    { token },
    { skipAuth: true },
  );
}

/**
 * Enroll by uploading a selfie image (upload path — no liveness).
 * @param {string} token
 * @param {File|Blob} file   the selfie image
 * @param {string} [phone]   E.164-ish phone to receive the link
 * @returns {Promise<{ok:boolean, expiresAt:number, matches:Array}>}
 */
export async function enrollSelfieUpload(token, file, phone) {
  const fd = new FormData();
  fd.append("token", token);
  if (phone) fd.append("phone", phone);
  fd.append("selfie", file, file.name || "selfie.jpg");
  // token also in the query so the server-side rate limiter can key on it.
  return api.upload(`/digital/photos/enroll?token=${encodeURIComponent(token)}`, fd, {
    skipAuth: true,
  });
}

/**
 * Enroll via a completed Face Liveness session (camera path). The verified
 * reference image is fetched server-side from AWS.
 */
export async function enrollWithLiveness(token, livenessSessionId, phone) {
  return api.post(
    "/digital/photos/enroll",
    { token, livenessSessionId, phone },
    { skipAuth: true },
  );
}

/** Erase the guest's stored face (AWS + Firestore). Idempotent. */
export async function deleteFaceEnrollment(token) {
  return api.delete("/digital/photos/enroll", { token }, { skipAuth: true });
}

/** Absolute URL to download all matched photos as a .zip (opened in a new tab). */
export function photosZipUrl(token) {
  return buildApiUrl(`/digital/photos/zip?token=${encodeURIComponent(token)}`);
}
