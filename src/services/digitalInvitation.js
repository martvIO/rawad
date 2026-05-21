// Digital-invitation service — REST replacement for the Firestore + Storage
// SDK calls. All endpoints sit under /api/digital. See routes/digital.ts for
// the server contract.
//
// Data layout (server-side, exposed via REST):
//   /digital/:uid/guests                       — RSVP list
//   /digital/:uid/media                        — invite-doc projection
//   /digital/:uid/media/settings               — wedding date / ranks / flags
//   /digital/:uid/media/upload                 — multipart background upload
//   /digital/:uid/media/delete-item            — remove one media[] entry
//   /digital/:uid/photographer                 — photographer files list
//   /digital/:uid/photographer/upload          — multipart upload
//   /digital/:uid/photographer/:fileId         — patch (rename) / delete
//   /digital/:uid/design-requests              — design workflow (groom view)
//   /digital/design-requests                   — design workflow (admin global)
//   /digital/:uid/design-requests/:reqId       — patch
//   /digital/:uid/design-requests/:reqId/mockup — admin mockup upload
//   /digital/:uid/public                       — unauthenticated read

import { api } from "../utils/apiClient.js";
import { createPoller } from "../utils/poller.js";
import { getStoredUid } from "../utils/tokenManager.js";
import { logErr } from "../utils/logger.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const DIGITAL_POLL_INTERVAL_MS = 15 * 1000;

// ─── Re-exports kept for back-compat with prior callsites ─────────────────────

export { createDigitalGuestInvite, submitDigitalGuestInvite } from "./invites.js";

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Resolve the groomUid used in path params. Pre-migration this read from
 * `auth.currentUser`; now it falls back to the locally-stored UID. Throws
 * the same error message so the UI's error toast stays consistent.
 */
function resolveUid(groomUid) {
  const uid = groomUid || getStoredUid();
  if (!uid) throw new Error("Not authenticated — please reload and log in again");
  return uid;
}

/**
 * Build a poller that surfaces errors through the consumer-provided cb.
 * Mirrors the legacy onSnapshot signature `(cb, onErrCb)`.
 */
function pollList(endpoint, cb, onErrCb) {
  return createPoller(
    async () => {
      try {
        return await api.get(endpoint);
      } catch (err) {
        logErr(`pollList(${endpoint})`, err);
        if (typeof onErrCb === "function") onErrCb(err);
        return [];
      }
    },
    (value) => cb(Array.isArray(value) ? value : []),
    { intervalMs: DIGITAL_POLL_INTERVAL_MS },
  );
}

// ─── Digital Guests ───────────────────────────────────────────────────────────

export function subscribeDigitalGuests(groomUid, cb, onErrCb) {
  const uid = resolveUid(groomUid);
  return pollList(`/digital/${uid}/guests`, cb, onErrCb);
}

export async function addDigitalGuest(groomUid, { name, phone, rank }) {
  const uid = resolveUid(groomUid);
  const body = { name, phone };
  const cleanRank = (rank || "").trim();
  if (cleanRank) body.rank = cleanRank;
  const result = await api.post(`/digital/${uid}/guests`, body);
  return result?.id ?? null;
}

export async function updateDigitalGuest(groomUid, guestId, patch) {
  const uid = resolveUid(groomUid);
  return api.patch(`/digital/${uid}/guests/${guestId}`, patch);
}

export async function removeDigitalGuest(groomUid, guestId) {
  const uid = resolveUid(groomUid);
  return api.delete(`/digital/${uid}/guests/${guestId}`);
}

/**
 * Legacy one-shot fetch — most code uses the subscription. Retained as a
 * no-op stub since the call site was already a placeholder.
 */
export async function fetchDigitalGuests() {
  return [];
}

// ─── Invitation Media doc ─────────────────────────────────────────────────────

/**
 * Subscribe to the parent invitation doc (background media + flags +
 * wedding date). Server returns the projected shape with the legacy
 * single-background field auto-folded into media[0].
 */
export function subscribeDigitalMedia(groomUid, cb, onErrCb) {
  const uid = resolveUid(groomUid);
  return createPoller(
    async () => {
      try {
        return await api.get(`/digital/${uid}/media`);
      } catch (err) {
        logErr(`subscribeDigitalMedia(${uid})`, err);
        if (typeof onErrCb === "function") onErrCb(err);
        return null;
      }
    },
    (value) => cb(value ?? null),
    { intervalMs: DIGITAL_POLL_INTERVAL_MS },
  );
}

/**
 * Upload a new background media item. Returns the newly created media[]
 * entry shape `{ url, kind, storagePath, order }`.
 */
export async function addInvitationMedia(groomUid, file) {
  const uid = resolveUid(groomUid);
  const formData = new FormData();
  formData.append("file", file, file.name);
  return api.upload(`/digital/${uid}/media/upload`, formData);
}

/**
 * Remove one media[] entry by storagePath. Server prunes the array AND
 * best-effort deletes the Storage object.
 */
export async function removeInvitationMedia(groomUid, item) {
  const uid = resolveUid(groomUid);
  if (!item?.storagePath) return;
  return api.post(`/digital/${uid}/media/delete-item`, {
    storagePath: item.storagePath,
  });
}

export async function setWeddingDate(groomUid, epochMs) {
  const uid = resolveUid(groomUid);
  return api.patch(`/digital/${uid}/media/settings`, {
    weddingDate: epochMs ?? null,
  });
}

export async function setPhotographerPublished(groomUid, published) {
  const uid = resolveUid(groomUid);
  return api.patch(`/digital/${uid}/media/settings`, {
    photographerPublished: !!published,
  });
}

export async function setGuestRanks(groomUid, ranks) {
  const uid = resolveUid(groomUid);
  return api.patch(`/digital/${uid}/media/settings`, {
    guestRanks: Array.isArray(ranks) ? ranks : [],
  });
}

/**
 * Unauthenticated read of the parent invitation doc. Used by the guest-
 * facing /d/{groomUsername}/{token} page.
 */
export async function getDigitalInvitationPublic(groomUid) {
  if (!groomUid) return null;
  try {
    return await api.get(`/digital/${groomUid}/public`, { skipAuth: true });
  } catch {
    return null;
  }
}

/** Backwards-compat alias for the prior single-file upload entrypoint. */
export async function saveDigitalMediaFile(groomUid, file) {
  return addInvitationMedia(groomUid, file);
}

/**
 * Full removal — clears the entire invitation doc and every file under
 * digitalMedia/{uid}. Server handles both layers atomically.
 */
export async function removeDigitalMedia(groomUid) {
  const uid = resolveUid(groomUid);
  return api.delete(`/digital/${uid}/media`);
}

// ─── Photographer Files ───────────────────────────────────────────────────────

export function subscribePhotographerFiles(groomUid, cb, onErrCb) {
  const uid = resolveUid(groomUid);
  return pollList(`/digital/${uid}/photographer`, cb, onErrCb);
}

/**
 * Public, unauthenticated read used by /d/{groomUsername}/{token}/photos.
 * The server only returns rows when `photographerPublished` is true on the
 * parent doc — otherwise responds with 403, surfaced here as an empty array.
 */
export async function fetchPublishedPhotographerFiles(groomUid) {
  if (!groomUid) return [];
  try {
    return await api.get(`/digital/${groomUid}/photographer`, { skipAuth: true });
  } catch {
    return [];
  }
}

export async function uploadPhotographerFile(groomUid, file) {
  const uid = resolveUid(groomUid);
  const formData = new FormData();
  formData.append("file", file, file.name);
  const data = await api.upload(`/digital/${uid}/photographer/upload`, formData);
  return { url: data?.url ?? null, key: data?.id ?? null };
}

export async function renamePhotographerFile(groomUid, fileId, newName) {
  const uid = resolveUid(groomUid);
  const name = (newName || "").trim();
  if (!name) throw new Error("Name cannot be empty");
  return api.patch(`/digital/${uid}/photographer/${fileId}`, { name });
}

export async function removePhotographerFile(groomUid, fileId) {
  const uid = resolveUid(groomUid);
  return api.delete(`/digital/${uid}/photographer/${fileId}`);
}

/**
 * Storage-only orphan path — kept for back-compat with prior callers that
 * pass a storagePath. The new server handles deletion uniformly when given
 * a fileId, so this just delegates.
 */
export async function removePhotographerFileByPath(groomUid, storagePath) {
  const uid = resolveUid(groomUid);
  if (!storagePath) return;
  return api.delete(`/digital/${uid}/photographer/${encodeURIComponent(storagePath)}`);
}

// ─── Auto-heal stubs (no longer needed) ───────────────────────────────────────
//
// Pre-migration the client walked Storage directly to recover orphans. With
// the REST backend the server owns both layers, so these become no-ops.
// Kept as exports so existing callers don't break.

export async function listPhotographerFilesFromStorage() {
  return [];
}

export async function getLatestDigitalMediaFromStorage() {
  return null;
}

export async function healPhotographerFiles() {
  return 0;
}

export async function healDigitalMedia() {
  return false;
}
