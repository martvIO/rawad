// Proof-photo uploads. Each photo lives at /proofs/{groomUid}/{guestId}/{ts}.jpg
// in Firebase Storage. Storage rules enforce that only the assigned driver
// may write and only the owning groom (or admin) may read.
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase.js";

export async function uploadProofBlob(groomUid, guestId, blob, contentType = "image/jpeg") {
  const path = `proofs/${groomUid}/${guestId}/${Date.now()}.jpg`;
  const r = ref(storage, path);
  await uploadBytes(r, blob, { contentType });
  return path;
}

export async function proofDownloadUrl(path) {
  if (!path) return null;
  return getDownloadURL(ref(storage, path));
}

// Convert a data: URL (what <input type=file capture> + FileReader gives us)
// into a Blob suitable for uploadBytes.
export function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(",");
  const mime = /data:([^;]+);/.exec(meta)?.[1] ?? "image/jpeg";
  const bin  = atob(b64);
  const len  = bin.length;
  const u8   = new Uint8Array(len);
  for (let i = 0; i < len; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: mime });
}
