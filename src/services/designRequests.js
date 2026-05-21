// Design-request service — REST replacement.
//
// Endpoints (all under /api/digital):
//   GET   /digital/design-requests                                 admin: global list
//   GET   /digital/:uid/design-requests                            groom: own list
//   POST  /digital/:uid/design-requests                            groom: submit template
//   PATCH /digital/:uid/design-requests/:reqId                     status updates
//   POST  /digital/:uid/design-requests/:reqId/mockup              admin: upload mockup
//
// The status-transition rules from the legacy code are now enforced on the
// server (admin can transition to any value; groom can only set
// approved / revision_requested).

import { api } from "../utils/apiClient.js";
import { createPoller } from "../utils/poller.js";
import { getStoredUid } from "../utils/tokenManager.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const DESIGN_REQ_POLL_INTERVAL_MS = 15 * 1000;

function uid(groomUid) {
  const u = groomUid || getStoredUid();
  if (!u) throw new Error("Not authenticated");
  return u;
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

/**
 * Groom view — newest-first list of their own design requests.
 */
export function subscribeDesignRequests(groomUid, cb) {
  return createPoller(
    () => api.get(`/digital/${uid(groomUid)}/design-requests`),
    (value) => cb(Array.isArray(value) ? value : []),
    { intervalMs: DESIGN_REQ_POLL_INTERVAL_MS },
  );
}

/**
 * Admin view — every design request across all grooms (server uses Firestore
 * collectionGroup). Each row carries `groomUid` so the admin UI can render
 * without joining on a profile lookup.
 */
export function subscribeAllDesignRequests(cb) {
  return createPoller(
    () => api.get("/digital/design-requests"),
    (value) => cb(Array.isArray(value) ? value : []),
    { intervalMs: DESIGN_REQ_POLL_INTERVAL_MS },
  );
}

// ─── Groom workflow ───────────────────────────────────────────────────────────

/**
 * Submit a brand-new design template.
 * `templateData` shape: `{ brideName, groomName, weddingDate, colors, style, notes }`.
 */
export async function submitDesignTemplate(groomUid, groomUsername, templateData) {
  const result = await api.post(`/digital/${uid(groomUid)}/design-requests`, {
    groomUsername: groomUsername || "",
    templateData: templateData || {},
  });
  return result?.id ?? null;
}

/**
 * Groom marks a request approved.
 */
export async function approveDesign(groomUid, reqId) {
  return api.patch(`/digital/${uid(groomUid)}/design-requests/${reqId}`, {
    status: "approved",
    approvedAt: Date.now(),
  });
}

/**
 * Groom asks for a revision with free-text notes.
 */
export async function requestRevision(groomUid, reqId, notes) {
  return api.patch(`/digital/${uid(groomUid)}/design-requests/${reqId}`, {
    status: "revision_requested",
    revisionNotes: (notes || "").trim() || null,
  });
}

// ─── Admin workflow ───────────────────────────────────────────────────────────

/**
 * Admin marks a request as actively being designed.
 */
export async function startDesigning(groomUid, reqId) {
  return api.patch(`/digital/${uid(groomUid)}/design-requests/${reqId}`, {
    status: "designing",
  });
}

/**
 * Admin uploads a mockup. Server appends it to the request's mockups[] and
 * flips status to "review" (clearing any prior revisionNotes).
 *
 * Returns the new mockup record `{ url, storagePath, uploadedAt, name }`.
 */
export async function uploadMockup(groomUid, reqId, file) {
  const formData = new FormData();
  formData.append("file", file, file.name);
  return api.upload(
    `/digital/${uid(groomUid)}/design-requests/${reqId}/mockup`,
    formData,
  );
}

/**
 * Legacy compat: in the SDK version the client read the existing mockups,
 * appended the new one, and wrote the union. The server now owns that
 * read-modify-write inside the mockup-upload endpoint, so this is a no-op
 * kept for callers that haven't been updated yet.
 */
export async function commitMockup() {
  return null;
}
