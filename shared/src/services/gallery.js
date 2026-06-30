// People-gallery admin/groom service (authenticated). Backs AdminGallery +
// the groom gallery controls. All calls go through apiClient (Bearer auth).
import { api } from "../utils/apiClient.js";

// Admin monitor
export const listGalleries = () => api.get("/digital/gallery-list");

// Config + approval
export const getGallery = (uid) => api.get(`/digital/${uid}/gallery`);
export const patchGallery = (uid, patch) => api.patch(`/digital/${uid}/gallery`, patch);
export const submitGallery = (uid) => api.post(`/digital/${uid}/gallery/submit`, {});
export const setGalleryStatus = (uid, status, note) =>
  api.post(`/digital/${uid}/gallery/set-status`, { status, note });
export const setGalleryEnabled = (uid, enabled) =>
  api.post(`/digital/${uid}/gallery/enabled`, { enabled });

// Clustering + progress
export const recomputeGallery = (uid) => api.post(`/digital/${uid}/gallery/recompute`, {});
export const getGalleryClusters = (uid) => api.get(`/digital/${uid}/gallery/clusters`);
export const getIndexStatus = (uid) => api.get(`/digital/${uid}/index-status`);
export const getClusterStatus = (uid) => api.get(`/digital/${uid}/cluster-status`);

// Curation
export const hideCluster = (uid, id, hidden) =>
  api.post(`/digital/${uid}/gallery/clusters/${id}/hide`, { hidden });
export const labelCluster = (uid, id, label) =>
  api.post(`/digital/${uid}/gallery/clusters/${id}/label`, { label });
export const linkClusterPhone = (uid, id, phone) =>
  api.post(`/digital/${uid}/gallery/clusters/${id}/link-phone`, { phone });
export const mergeClusters = (uid, sourceId, targetId) =>
  api.post(`/digital/${uid}/gallery/clusters/merge`, { sourceId, targetId });

// Lifecycle
export const eraseFaces = (uid) => api.post(`/digital/${uid}/gallery/erase-faces`, {});
export const sendPhotoLinks = (uid, force) =>
  api.post(`/digital/${uid}/photos/send-links`, { force: !!force });
