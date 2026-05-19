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
// Firestore layout — all digital invitation data nested under one path per groom:
//   digitalInvitations/{groomUid}                              — background media (doc)
//   digitalInvitations/{groomUid}/guests/{guestId}             — RSVP list
//   digitalInvitations/{groomUid}/photographerFiles/{fileId}   — photographer uploads
//   digitalInvitations/{groomUid}/designRequests/{reqId}       — design workflow (see designRequests.js)

import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot,
  query, orderBy, getDoc,
} from "firebase/firestore";
import {
  ref as storageRef, uploadBytes, getDownloadURL, listAll, getMetadata,
  deleteObject,
} from "firebase/storage";
import { firestore, storage, auth } from "../firebase.js";
import { callable } from "./_helpers.js";
import { logErr } from "../utils/logger.js";

// ── Per-guest digital invite tokens (callable Cloud Functions) ────────────────
// createDigitalGuestInvite — groom/admin → { token, expiresAt }
// submitDigitalGuestInvite — public  → marks guest status from the invite link
export const createDigitalGuestInvite = callable("createDigitalGuestInvite");
export const submitDigitalGuestInvite = callable("submitDigitalGuestInvite");

// ── Collection / document references ─────────────────────────────────────────
const guestsCol = (uid) => collection(firestore, "digitalInvitations", uid, "guests");
const mediaDoc  = (uid) => doc(firestore, "digitalInvitations", uid);
const filesCol  = (uid) => collection(firestore, "digitalInvitations", uid, "photographerFiles");

function resolveUid(groomUid) {
  const uid = groomUid || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated — please reload and log in again");
  return uid;
}

// ── Digital Guests ─────────────────────────────────────────────────────────────

// Real-time subscription (Firestore onSnapshot is auth-safe and persists offline)
// Error handler intentionally does NOT call cb — clearing the list on a transient
// permission-denied / network blip would make legitimately-uploaded data vanish.
export function subscribeDigitalGuests(groomUid, cb) {
  const q = query(guestsCol(groomUid), orderBy("createdAt", "asc"));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    (err) => logErr("subscribeDigitalGuests", err),
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
    (err) => logErr("subscribeDigitalMedia", err),
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
  // Delete Firestore doc first, then sweep ALL Storage objects in the user's
  // digitalMedia folder. Otherwise the Storage-fallback scan would resurface
  // the most recent file and the "deleted" background would reappear.
  try { await deleteDoc(mediaDoc(uid)); }
  catch (err) { logErr("removeDigitalMedia:deleteDoc", err); }
  try {
    const folder = storageRef(storage, `digitalMedia/${uid}`);
    const listing = await listAll(folder);
    await Promise.all(listing.items.map(it =>
      deleteObject(it).catch(err => logErr("removeDigitalMedia:deleteObject", err))
    ));
  } catch (err) {
    logErr("removeDigitalMedia:listAll", err);
  }
}

// ── Photographer Files ─────────────────────────────────────────────────────────

export function subscribePhotographerFiles(groomUid, cb) {
  const q = query(filesCol(groomUid), orderBy("uploadedAt", "desc"));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    (err) => logErr("subscribePhotographerFiles", err),
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
  // Read first to find the Storage path, then delete both layers. If the
  // Firestore doc is missing (orphan case), fileId is itself the storagePath.
  const ref = doc(filesCol(uid), fileId);
  let storagePath = null;
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) storagePath = snap.data().storagePath || null;
  } catch (err) {
    logErr("removePhotographerFile:getDoc", err);
  }
  try { await deleteDoc(ref); }
  catch (err) { logErr("removePhotographerFile:deleteDoc", err); }
  if (storagePath) {
    try { await deleteObject(storageRef(storage, storagePath)); }
    catch (err) { logErr("removePhotographerFile:deleteObject", err); }
  }
}

// Delete a Storage-only orphan (no Firestore doc). Used when the user deletes
// an entry that came from listPhotographerFilesFromStorage and was never healed.
export async function removePhotographerFileByPath(groomUid, storagePath) {
  resolveUid(groomUid);
  if (!storagePath) return;
  try { await deleteObject(storageRef(storage, storagePath)); }
  catch (err) { logErr("removePhotographerFileByPath", err); }
}

// ── Storage-direct listing (source of truth for display) ──────────────────────
//
// Firestore docs are an optional metadata layer. Storage is authoritative — if a
// file exists in Storage, the user should see it, even when the Firestore doc
// hasn't been written yet (pre-deploy orphans) or a transient subscribe error
// happened. These helpers walk Storage directly via listAll().

// Photographer folder list. Each item gets a fresh download URL and metadata.
// Returns: [{ key, name, url, type, storagePath, uploadedAt }]
export async function listPhotographerFilesFromStorage(groomUid) {
  const uid = resolveUid(groomUid);
  const folder = storageRef(storage, `photographerFiles/${uid}`);
  let listing;
  try {
    listing = await listAll(folder);
  } catch (err) {
    logErr("listPhotographerFilesFromStorage:listAll", err);
    return [];
  }
  const items = await Promise.all(listing.items.map(async (it) => {
    try {
      const [url, meta] = await Promise.all([getDownloadURL(it), getMetadata(it)]);
      // Filename pattern uploadPhotographerFile uses: `${Date.now()}_${safeName}`
      const tsMatch = it.name.match(/^(\d{10,})_/);
      const uploadedAt = tsMatch ? Number(tsMatch[1])
        : (meta.timeCreated ? Date.parse(meta.timeCreated) : null);
      // Strip the timestamp prefix for display
      const displayName = it.name.replace(/^\d{10,}_/, "");
      return {
        key:         it.fullPath,
        name:        displayName,
        url,
        type:        meta.contentType || "",
        storagePath: it.fullPath,
        uploadedAt,
      };
    } catch (err) {
      logErr("listPhotographerFilesFromStorage:item", err);
      return null;
    }
  }));
  return items.filter(Boolean);
}

// Latest background-media file in the digitalMedia folder for this groom.
// uploadName pattern: `background_${Date.now()}.${ext}`
// Returns: { url, type, storagePath } | null
export async function getLatestDigitalMediaFromStorage(groomUid) {
  const uid = resolveUid(groomUid);
  const folder = storageRef(storage, `digitalMedia/${uid}`);
  let listing;
  try {
    listing = await listAll(folder);
  } catch (err) {
    logErr("getLatestDigitalMediaFromStorage:listAll", err);
    return null;
  }
  if (!listing.items.length) return null;
  // Latest by embedded timestamp in filename, fallback to lexicographic.
  const tsOf = (n) => { const m = n.match(/background_(\d{10,})\./); return m ? Number(m[1]) : 0; };
  const latest = listing.items.slice().sort((a, b) => tsOf(b.name) - tsOf(a.name))[0];
  try {
    const [url, meta] = await Promise.all([getDownloadURL(latest), getMetadata(latest)]);
    const ct = meta.contentType || "";
    const type = ct.startsWith("video") ? "video"
               : ct === "image/gif"     ? "gif"
               : "image";
    return { url, type, storagePath: latest.fullPath };
  } catch (err) {
    logErr("getLatestDigitalMediaFromStorage:item", err);
    return null;
  }
}

// ── Auto-heal: write missing Firestore docs for orphan Storage objects ───────
//
// Pre-deploy uploads landed in Storage but their Firestore metadata writes were
// rejected by default-deny. After the rules deploy, on the next page load we
// reconcile by `addDoc` / `setDoc`-ing matching metadata. Idempotent — each call
// only writes what's missing.

export async function healPhotographerFiles(groomUid, storageList, firestoreList) {
  const uid = resolveUid(groomUid);
  const known = new Set((firestoreList || []).map(f => f.storagePath).filter(Boolean));
  const orphans = (storageList || []).filter(s => !known.has(s.storagePath));
  for (const o of orphans) {
    try {
      await addDoc(filesCol(uid), {
        name:        o.name,
        url:         o.url,
        type:        o.type || "",
        storagePath: o.storagePath,
        uploadedAt:  o.uploadedAt ?? Date.now(),
      });
    } catch (err) {
      logErr("healPhotographerFiles:addDoc", err);
    }
  }
  return orphans.length;
}

export async function healDigitalMedia(groomUid, storageLatest, firestoreDoc) {
  if (!storageLatest) return false;
  const uid = resolveUid(groomUid);
  if (firestoreDoc?.storagePath === storageLatest.storagePath) return false;
  try {
    await setDoc(mediaDoc(uid), {
      backgroundUrl:  storageLatest.url,
      backgroundType: storageLatest.type,
      storagePath:    storageLatest.storagePath,
    });
    return true;
  } catch (err) {
    logErr("healDigitalMedia:setDoc", err);
    return false;
  }
}
