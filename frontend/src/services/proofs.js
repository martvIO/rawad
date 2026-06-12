// Proof-photo service — REST upload + signed-URL fetch.
//
//   POST /api/proofs/upload       driver: multipart upload (returns storagePath)
//   GET  /api/proofs/url?path=... any authed: short-lived download URL

import { api } from "../utils/apiClient.js";

/**
 * Upload a proof photo. The blob must be an image; max 6 MB (server-enforced).
 * Returns the storage path so the caller can persist it on the guest record.
 *
 * @param {string} groomUid
 * @param {string} guestId
 * @param {Blob} blob
 * @param {string} [contentType]  unused (FormData carries the type), retained
 *   for signature compatibility with the legacy SDK version.
 * @returns {Promise<string>} storage path
 */
export async function uploadProofBlob(groomUid, guestId, blob /* contentType unused */) {
  const formData = new FormData();
  formData.append("groomUid", groomUid);
  formData.append("guestId", guestId);
  // Filename matters because busboy uses it to fall back to a content-type
  // extension. Use a deterministic name; the server overrides the path anyway.
  formData.append("file", blob, "proof.jpg");
  const data = await api.upload("/proofs/upload", formData);
  return data?.path ?? null;
}

/**
 * Resolve a signed download URL for a stored proof photo.
 *
 * @param {string} path  storage path returned by uploadProofBlob
 * @returns {Promise<string|null>}
 */
export async function proofDownloadUrl(path) {
  if (!path) return null;
  const data = await api.get(`/proofs/url?path=${encodeURIComponent(path)}`);
  return data?.url ?? null;
}

/**
 * Convert a `data:` URL (the output of a FileReader on a <input type=file>
 * with `capture` attribute) into a Blob suitable for `uploadProofBlob`.
 * Kept here for backwards compat — it is a pure utility.
 */
export function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(",");
  const mime = /data:([^;]+);/.exec(meta)?.[1] ?? "image/jpeg";
  const bin = atob(b64);
  const len = bin.length;
  const u8 = new Uint8Array(len);
  for (let i = 0; i < len; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: mime });
}
