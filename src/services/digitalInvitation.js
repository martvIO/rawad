// Digital invitation service — Cloud Firestore for data, Firebase Storage for files.
//
// WHY Firestore (not RTDB):
//   Firebase RTDB SDK writes can be silently rejected by the server when the
//   SDK's WebSocket hasn't re-authenticated yet (happens briefly after login).
//   The SDK applies writes to the local cache, resolves the Promise as "success",
//   then rolls back silently when the server rejects — data disappears on refresh.
//   Firestore SDK has a separate, more reliable auth layer: addDoc/setDoc/updateDoc
//   all wait for confirmed server writes and throw real errors on rejection.
//
// Firestore collections:
//   digitalGuests/{groomUid}/guests/{guestId}    — guest documents
//   digitalMedia/{groomUid}                      — single media document per groom
//   photographerFiles/{groomUid}/files/{fileId}  — photographer upload documents

import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { firestore, storage, auth } from "../firebase.js";
import { callable } from "./_helpers.js";

// ── Per-guest digital invite tokens (callable Cloud Functions) ────────────────
// createDigitalGuestInvite — groom/admin → { token, expiresAt }
// submitDigitalGuestInvite — public  → marks guest status from the invite link
export const createDigitalGuestInvite = callable("createDigitalGuestInvite");
export const submitDigitalGuestInvite = callable("submitDigitalGuestInvite");

// ── Collection / document references ─────────────────────────────────────────
const guestsCol = (uid) => collection(firestore, `digitalGuests/${uid}/guests`);
const mediaDoc  = (uid) => doc(firestore, "digitalMedia", uid);
const filesCol  = (uid) => collection(firestore, `photographerFiles/${uid}/files`);

function resolveUid(groomUid) {
  const uid = groomUid || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated — please reload and log in again");
  return uid;
}

// ── Digital Guests ─────────────────────────────────────────────────────────────

// Real-time subscription (Firestore onSnapshot is auth-safe and persists offline)
export function subscribeDigitalGuests(groomUid, cb) {
  const q = query(guestsCol(groomUid), orderBy("createdAt", "asc"));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    () => cb([]),
  );
}

// addDoc confirms the write on the server before resolving — no silent rollbacks
export async function addDigitalGuest(groomUid, { name, phone }) {
  const uid = resolveUid(groomUid);
  const ref = await addDoc(guestsCol(uid), {
    name, phone, status: "pending", createdAt: Date.now(),
  });
  return ref.id;
}

export async function updateDigitalGuest(groomUid, guestId, patch) {
  const uid = resolveUid(groomUid);
  await updateDoc(doc(guestsCol(uid), guestId), patch);
}

export async function removeDigitalGuest(groomUid, guestId) {
  const uid = resolveUid(groomUid);
  await deleteDoc(doc(guestsCol(uid), guestId));
}

// Stub kept for import compatibility (onSnapshot handles all reads now)
export async function fetchDigitalGuests() { return []; }

// ── Background Media ───────────────────────────────────────────────────────────

export function subscribeDigitalMedia(groomUid, cb) {
  return onSnapshot(
    mediaDoc(groomUid),
    (snap) => cb(snap.exists() ? snap.data() : null),
    () => cb(null),
  );
}

export async function saveDigitalMediaFile(groomUid, file) {
  const uid  = resolveUid(groomUid);
  const ext  = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `digitalMedia/${uid}/background_${Date.now()}.${ext}`;
  const sr   = storageRef(storage, path);
  await uploadBytes(sr, file, { contentType: file.type });
  const url  = await getDownloadURL(sr);
  const type = file.type.startsWith("video") ? "video"
             : file.type === "image/gif"      ? "gif"
             : "image";
  // setDoc confirms write on server
  await setDoc(mediaDoc(uid), { backgroundUrl: url, backgroundType: type, storagePath: path });
  return { url, type };
}

export async function removeDigitalMedia(groomUid) {
  const uid = resolveUid(groomUid);
  await deleteDoc(mediaDoc(uid));
}

// ── Photographer Files ─────────────────────────────────────────────────────────

export function subscribePhotographerFiles(groomUid, cb) {
  const q = query(filesCol(groomUid), orderBy("uploadedAt", "desc"));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    () => cb([]),
  );
}

export async function uploadPhotographerFile(groomUid, file) {
  const uid      = resolveUid(groomUid);
  const safeName = file.name.replace(/[^\w.\-]/g, "_");
  const path     = `photographerFiles/${uid}/${Date.now()}_${safeName}`;
  const sr       = storageRef(storage, path);
  await uploadBytes(sr, file, { contentType: file.type || "application/octet-stream" });
  const url    = await getDownloadURL(sr);
  const docRef = await addDoc(filesCol(uid), {
    name: file.name, url, type: file.type || "",
    storagePath: path, uploadedAt: Date.now(),
  });
  return { url, key: docRef.id };
}

export async function renamePhotographerFile(groomUid, fileId, newName) {
  const uid  = resolveUid(groomUid);
  const name = (newName || "").trim();
  if (!name) throw new Error("Name cannot be empty");
  await updateDoc(doc(filesCol(uid), fileId), { name });
}

export async function removePhotographerFile(groomUid, fileId) {
  const uid = resolveUid(groomUid);
  await deleteDoc(doc(filesCol(uid), fileId));
}
