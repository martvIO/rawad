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
import { POLL_MS } from "../config/index.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const DIGITAL_POLL_INTERVAL_MS = POLL_MS.DIGITAL;

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
 *
 * `transform` (optional) runs against every server result before delivery.
 * Used by callers that need to merge optimistic state into the poll output
 * — see subscribePhotographerFiles for the pending-uploads use case
 * (BUG-O002 fix).
 */
function pollList(endpoint, cb, onErrCb, transform) {
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
    (value) => {
      const arr = Array.isArray(value) ? value : [];
      cb(typeof transform === "function" ? transform(arr) : arr);
    },
    { intervalMs: DIGITAL_POLL_INTERVAL_MS },
  );
}

// ─── Digital Guests ───────────────────────────────────────────────────────────

export function subscribeDigitalGuests(groomUid, cb, onErrCb) {
  const uid = resolveUid(groomUid);
  return pollList(`/digital/${uid}/guests`, cb, onErrCb);
}

/**
 * Add a guest. `ranks` is an array of zero-or-more rank labels (the new
 * multi-rank shape). Legacy single-string `rank` is also accepted and
 * promoted to `[rank]` for backwards compatibility with any old caller.
 */
export async function addDigitalGuest(groomUid, { name, phone, ranks, rank }) {
  const uid = resolveUid(groomUid);
  const body = { name, phone };
  const cleaned = Array.isArray(ranks)
    ? ranks.map((r) => String(r || "").trim()).filter(Boolean)
    : rank
      ? [String(rank).trim()].filter(Boolean)
      : [];
  if (cleaned.length > 0) body.ranks = cleaned;
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
 *
 * `transform(serverDoc) => doc` (optional) runs against each poll result
 * before delivery. Used by the dashboard to splice optimistic media[]
 * entries that the user just uploaded but Firestore hasn't echoed back yet
 * — BUG-O002 fix. Without this, a poll that started before the upload but
 * resolved after the optimistic merge would overwrite the local state with
 * the pre-upload server snapshot, making the file appear to vanish.
 */
export function subscribeDigitalMedia(groomUid, cb, onErrCb, transform) {
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
    (value) => {
      const next = value ?? null;
      cb(typeof transform === "function" ? transform(next) : next);
    },
    { intervalMs: DIGITAL_POLL_INTERVAL_MS },
  );
}

/**
 * Upload a new background media item. Returns the newly created media[]
 * entry shape `{ url, kind, storagePath, order }`.
 */
export async function addInvitationMedia(groomUid, file, opts) {
  const uid = resolveUid(groomUid);
  const formData = new FormData();
  formData.append("file", file, file.name);
  return api.upload(`/digital/${uid}/media/upload`, formData, opts);
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

/**
 * Subscribe to the groom's photographer files list. Optional `transform`
 * runs on each poll result; the photographer page uses it to preserve
 * recently-uploaded items that haven't propagated yet (BUG-O002 fix).
 */
export function subscribePhotographerFiles(groomUid, cb, onErrCb, transform) {
  const uid = resolveUid(groomUid);
  return pollList(`/digital/${uid}/photographer`, cb, onErrCb, transform);
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

export async function uploadPhotographerFile(groomUid, file, opts) {
  const uid = resolveUid(groomUid);
  const formData = new FormData();
  formData.append("file", file, file.name);
  const data = await api.upload(`/digital/${uid}/photographer/upload`, formData, opts);
  // Returns the full record so callers can register the upload as a
  // pending optimistic entry. `key` kept for back-compat with old callers.
  return {
    id: data?.id ?? null,
    url: data?.url ?? null,
    storagePath: data?.storagePath ?? null,
    key: data?.id ?? null,
    name: file.name,
    type: file.type,
    uploadedAt: Date.now(),
  };
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
