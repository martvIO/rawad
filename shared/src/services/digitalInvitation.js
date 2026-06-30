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
//   /digital/:uid/media/settings               — design fields PATCH (see patchDesignFields)
//   /digital/:uid/design/submit|cancel         — groom design state transitions
//   /digital/:uid/design/approve|reject        — admin design state transitions
//   /digital/design-list                       — admin design review grid
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

// ─── Guestbook wishes (groom moderation) ────────────────────────────────────────

export function subscribeDigitalWishes(groomUid, cb, onErrCb) {
  const uid = resolveUid(groomUid);
  return pollList(`/digital/${uid}/wishes`, cb, onErrCb);
}

/** Approve ("approved") or un-publish ("pending") a wish. */
export async function setWishStatus(groomUid, wishId, status) {
  const uid = resolveUid(groomUid);
  return api.patch(`/digital/${uid}/wishes/${wishId}`, { status });
}

/** Reject / remove a wish. */
export async function deleteWish(groomUid, wishId) {
  const uid = resolveUid(groomUid);
  return api.delete(`/digital/${uid}/wishes/${wishId}`);
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
 * Upload a new media item. Returns the newly created entry shape
 * `{ url, kind, storagePath, order }`.
 *
 * `opts.target === "hero"` appends to the separate hero/featured-media array
 * (shown under the greeting); otherwise it appends to the gallery (media[]).
 * `opts` also carries the optional AbortSignal / timeout for api.upload.
 */
export async function addInvitationMedia(groomUid, file, opts) {
  const uid = resolveUid(groomUid);
  const formData = new FormData();
  formData.append("file", file, file.name);
  if (opts?.target) formData.append("target", opts.target);
  return api.upload(`/digital/${uid}/media/upload`, formData, opts);
}

/**
 * Remove one media entry by storagePath. Server prunes the array AND
 * best-effort deletes the Storage object. Pass `opts.target === "hero"` to
 * target the hero/featured-media array instead of the gallery.
 */
export async function removeInvitationMedia(groomUid, item, opts) {
  const uid = resolveUid(groomUid);
  if (!item?.storagePath) return;
  const body = { storagePath: item.storagePath };
  if (opts?.target) body.target = opts.target;
  return api.post(`/digital/${uid}/media/delete-item`, body);
}

export async function setWeddingDate(groomUid, epochMs) {
  const uid = resolveUid(groomUid);
  return api.patch(`/digital/${uid}/media/settings`, {
    weddingDate: epochMs ?? null,
  });
}

export async function setPhotographerPublished(groomUid, published, ack) {
  const uid = resolveUid(groomUid);
  return api.patch(`/digital/${uid}/media/settings`, {
    photographerPublished: !!published,
    // The first publish flip requires the groom's biometric-indexing
    // acknowledgment; the server returns 409 ack_required without it.
    ...(ack === true ? { photographerAck: true } : {}),
  });
}

export async function setGuestRanks(groomUid, ranks) {
  const uid = resolveUid(groomUid);
  return api.patch(`/digital/${uid}/media/settings`, {
    guestRanks: Array.isArray(ranks) ? ranks : [],
  });
}

/**
 * Patch any subset of the groom's design fields in one round trip. Used by
 * the self-serve design editor. Server demotes designStatus back to draft
 * if the design was approved and any design field changes.
 */
export async function patchDesignFields(groomUid, patch) {
  const uid = resolveUid(groomUid);
  return api.patch(`/digital/${uid}/media/settings`, patch || {});
}

// ─── Multiple designs per groom ────────────────────────────────────────────────
// A groom can have several full designs in a `designs` subcollection. The legacy
// functions above operate on the groom's DEFAULT design (server resolves it); the
// `*Design`/`*ById` functions below target a specific designId.

/** Poll the groom's design list (lightweight rows for the editor switcher). */
export function subscribeDesigns(groomUid, cb, onErrCb) {
  const uid = resolveUid(groomUid);
  return pollList(`/digital/${uid}/designs`, cb, onErrCb);
}

/** Create a design — blank, or a duplicate of `copyFromId`. */
export async function createDesign(groomUid, { title, copyFromId } = {}) {
  const uid = resolveUid(groomUid);
  return api.post(`/digital/${uid}/designs`, {
    title: title || "",
    ...(copyFromId ? { copyFromId } : {}),
  });
}

/** Delete a design (server refuses the last one; reassigns guests + default). */
export async function deleteDesign(groomUid, designId) {
  const uid = resolveUid(groomUid);
  return api.delete(`/digital/${uid}/designs/${designId}`);
}

/** Subscribe to one design's full doc (drives the editor body + preview). */
export function subscribeDesign(groomUid, designId, cb, onErrCb, transform) {
  const uid = resolveUid(groomUid);
  return createPoller(
    async () => {
      try {
        return await api.get(`/digital/${uid}/designs/${designId}`);
      } catch (err) {
        logErr(`subscribeDesign(${uid}/${designId})`, err);
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

/** Patch a specific design's fields (editor body). */
export async function patchDesignById(groomUid, designId, patch) {
  const uid = resolveUid(groomUid);
  return api.patch(`/digital/${uid}/designs/${designId}`, patch || {});
}

/** Upload media into a specific design (opts.target "hero" | gallery). */
export async function addDesignMedia(groomUid, designId, file, opts) {
  const uid = resolveUid(groomUid);
  const formData = new FormData();
  formData.append("file", file, file.name);
  if (opts?.target) formData.append("target", opts.target);
  return api.upload(`/digital/${uid}/designs/${designId}/media/upload`, formData, opts);
}

/** Remove one media item from a specific design. */
export async function removeDesignMedia(groomUid, designId, item, opts) {
  const uid = resolveUid(groomUid);
  if (!item?.storagePath) return;
  const body = { storagePath: item.storagePath };
  if (opts?.target) body.target = opts.target;
  return api.post(`/digital/${uid}/designs/${designId}/media/delete-item`, body);
}

/** State-machine transitions for a specific design. */
export async function submitDesignById(groomUid, designId) {
  const uid = resolveUid(groomUid);
  return api.post(`/digital/${uid}/designs/${designId}/design/submit`, {});
}
export async function cancelDesignById(groomUid, designId) {
  const uid = resolveUid(groomUid);
  return api.post(`/digital/${uid}/designs/${designId}/design/cancel`, {});
}
/** Admin override: set a design to any of "approved" | "draft" | "rejected". */
export async function setDesignStatus(groomUid, designId, status, note) {
  return api.post(`/digital/${groomUid}/designs/${designId}/design/set-status`, {
    status,
    ...(note ? { note } : {}),
  });
}

/** Assign (or clear) which design a guest receives. */
export async function assignGuestDesign(groomUid, guestId, designId) {
  const uid = resolveUid(groomUid);
  return api.patch(`/digital/${uid}/guests/${guestId}`, { designId: designId || "" });
}

// ─── Design approval state machine ────────────────────────────────────────────

export async function submitDesignForApproval(groomUid) {
  const uid = resolveUid(groomUid);
  return api.post(`/digital/${uid}/design/submit`, {});
}

export async function cancelDesignSubmission(groomUid) {
  const uid = resolveUid(groomUid);
  return api.post(`/digital/${uid}/design/cancel`, {});
}

export async function approveDigitalDesign(groomUid) {
  return api.post(`/digital/${groomUid}/design/approve`, {});
}

export async function rejectDigitalDesign(groomUid, note) {
  return api.post(`/digital/${groomUid}/design/reject`, { note: note || "" });
}

/**
 * Periodic poll of the admin design list. Mirrors subscribeDigitalGuests
 * shape so the AdminDesigns screen can use the standard useEffect pattern.
 */
export function subscribeAdminDesignList(cb, onErrCb) {
  return createPoller(
    async () => {
      try {
        return await api.get("/digital/design-list");
      } catch (err) {
        logErr("subscribeAdminDesignList", err);
        if (typeof onErrCb === "function") onErrCb(err);
        return [];
      }
    },
    (value) => cb(Array.isArray(value) ? value : []),
    { intervalMs: DIGITAL_POLL_INTERVAL_MS },
  );
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

// ── Admin-editable public demo ────────────────────────────────────────────
// The editable demo design lives under a reserved synthetic uid; the existing
// per-design services (subscribeDesign/patchDesignById/addDesignMedia/…) accept
// it as their groomUid, so admin edits route to /digital/__demo__/designs/demo.
// Must match DEMO_UID in backend constants.ts. NOT wrapped in double underscores
// — Firestore reserves document IDs matching /^__.*__$/.
export const DEMO_DESIGN_UID = "demo-design";
export const DEMO_DESIGN_ID = "demo";

/** Admin: ensure the (blank) editable demo design doc exists. */
export async function ensureDemoDesign() {
  return api.post("/digital/demo/ensure", {});
}

/** Admin: snapshot the current draft into the public demo. */
export async function publishDemoDesign() {
  return api.post("/digital/demo/publish", {});
}

/** Public: the published demo snapshot, or null if nothing is published yet. */
export async function getDemoDesignPublic() {
  try {
    return await api.get("/digital/demo/public", { skipAuth: true });
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget "guest opened this digital invite" ping. Stamps a first-party
 * viewedAt (for the open-rate KPI) + the language they opened in (for localized
 * RSVP reminders). Never throws — analytics must never break the invite page.
 */
export function pingDigitalInviteOpened(token, lang) {
  if (!token) return;
  try {
    api.post("/invites/digital/opened", { token, lang }, { skipAuth: true }).catch(() => {});
  } catch { /* ignore */ }
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
