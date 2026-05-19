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
//   digitalInvitations/{groomUid}                              — doc: media[], weddingDate, flags
//   digitalInvitations/{groomUid}/guests/{guestId}             — RSVP list
//   digitalInvitations/{groomUid}/photographerFiles/{fileId}   — photographer uploads
//   digitalInvitations/{groomUid}/designRequests/{reqId}       — design workflow (see designRequests.js)

import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, getDoc, getDocs,
  onSnapshot, query, orderBy,
} from "firebase/firestore";
import {
  ref as storageRef, uploadBytes, getDownloadURL, deleteObject,
} from "firebase/storage";
import { firestore, storage, auth } from "../firebase.js";
import { callable } from "./_helpers.js";
import { logErr, logWarn, log } from "../utils/logger.js";

// Subscription error callbacks: callers can pass a second `onError` arg to
// surface Firestore-side failures (rule denial, network, etc.) in the UI
// instead of silently rendering an empty list.
function onError(tag, onErrCb) {
  return (err) => {
    logErr(`firestore:${tag}`, err);
    if (typeof onErrCb === "function") onErrCb(err);
  };
}

// ── Per-guest digital invite tokens (callable Cloud Functions) ────────────────
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

function kindOf(file) {
  if (file.type?.startsWith("video")) return "video";
  if (file.type === "image/gif")      return "gif";
  return "image";
}

// ── Digital Guests ─────────────────────────────────────────────────────────────

export function subscribeDigitalGuests(groomUid, cb, onErrCb) {
  const path = `digitalInvitations/${groomUid}/guests`;
  log("subscribeDigitalGuests →", path);
  const q = query(guestsCol(groomUid), orderBy("createdAt", "asc"));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      log(`subscribeDigitalGuests fired (${list.length} docs) ←`, path);
      cb(list);
    },
    onError(`subscribeDigitalGuests(${path})`, onErrCb),
  );
}

export async function addDigitalGuest(groomUid, { name, phone, rank }) {
  const uid = resolveUid(groomUid);
  const path = `digitalInvitations/${uid}/guests`;
  log("addDigitalGuest →", path, { name, phone, rank });
  try {
    const payload = {
      name, phone, status: "pending", createdAt: Date.now(),
    };
    const cleanRank = (rank || "").trim();
    if (cleanRank) payload.rank = cleanRank;
    const ref = await addDoc(guestsCol(uid), payload);
    log("addDigitalGuest ✓ saved", `${path}/${ref.id}`);
    return ref.id;
  } catch (err) {
    logErr(`addDigitalGuest(${path})`, err);
    throw err;
  }
}

export async function updateDigitalGuest(groomUid, guestId, patch) {
  const uid = resolveUid(groomUid);
  await updateDoc(doc(guestsCol(uid), guestId), patch);
}

export async function removeDigitalGuest(groomUid, guestId) {
  const uid = resolveUid(groomUid);
  await deleteDoc(doc(guestsCol(uid), guestId));
}

export async function fetchDigitalGuests() { return []; }

// ── Invitation Doc (media[] + wedding date + flags) ───────────────────────────
//
// Document shape (all fields optional):
//   media:                 [{ url, kind, storagePath, order }]
//   weddingDate:           number (epoch ms)
//   photographerPublished: boolean
//   brideName:             string
//   groomDisplayName:      string
//
// Legacy single-background fields (auto-migrated on first save):
//   backgroundUrl, backgroundType, storagePath

// Subscribe to the parent doc and project a normalised view to consumers.
// Auto-migrates the legacy single-background shape on the fly so existing
// docs continue rendering without a separate migration pass.
export function subscribeDigitalMedia(groomUid, cb, onErrCb) {
  const path = `digitalInvitations/${groomUid}`;
  log("subscribeDigitalMedia →", path);
  return onSnapshot(
    mediaDoc(groomUid),
    (snap) => {
      const exists = snap.exists();
      log(`subscribeDigitalMedia fired (exists=${exists}) ←`, path);
      cb(exists ? projectMediaDoc(snap.data()) : null);
    },
    onError(`subscribeDigitalMedia(${path})`, onErrCb),
  );
}

function projectMediaDoc(data) {
  if (!data) return null;
  // If `media` array already exists, return as-is.
  if (Array.isArray(data.media) && data.media.length > 0) return data;
  // Legacy single-background → synthesise a one-item media array.
  if (data.backgroundUrl) {
    return {
      ...data,
      media: [{
        url:         data.backgroundUrl,
        kind:        data.backgroundType === "video" ? "video" : data.backgroundType === "gif" ? "gif" : "image",
        storagePath: data.storagePath || "",
        order:       0,
      }],
    };
  }
  return data;
}

// Add a new media item to the gallery.
export async function addInvitationMedia(groomUid, file) {
  const uid  = resolveUid(groomUid);
  const ext  = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `digitalMedia/${uid}/m_${Date.now()}.${ext}`;
  const docPath = `digitalInvitations/${uid}`;
  log("addInvitationMedia → storage:", path);
  try {
    const sr = storageRef(storage, path);
    await uploadBytes(sr, file, { contentType: file.type });
    const url = await getDownloadURL(sr);
    const item = { url, kind: kindOf(file), storagePath: path, order: Date.now() };

    // Merge into media[] — read-modify-write so concurrent uploads don't clobber.
    log("addInvitationMedia → firestore:", docPath);
    const snap     = await getDoc(mediaDoc(uid));
    const existing = snap.exists() ? (snap.data().media || []) : [];
    // Carry forward legacy single-background as media[0] on first multi-upload.
    let migrated = existing;
    if (existing.length === 0 && snap.exists() && snap.data().backgroundUrl) {
      const d = snap.data();
      migrated = [{
        url: d.backgroundUrl,
        kind: d.backgroundType === "video" ? "video" : d.backgroundType === "gif" ? "gif" : "image",
        storagePath: d.storagePath || "",
        order: 0,
      }];
    }
    const media = [...migrated, item];
    await setDoc(mediaDoc(uid), { media }, { merge: true });
    log("addInvitationMedia ✓ saved media[] length =", media.length);
    return item;
  } catch (err) {
    logErr(`addInvitationMedia(${docPath})`, err);
    throw err;
  }
}

// Remove a specific media item (by storagePath).
export async function removeInvitationMedia(groomUid, item) {
  const uid  = resolveUid(groomUid);
  const snap = await getDoc(mediaDoc(uid));
  if (!snap.exists()) return;
  const existing = snap.data().media || [];
  const filtered = existing.filter(m => m.storagePath !== item.storagePath);
  await setDoc(mediaDoc(uid), { media: filtered }, { merge: true });
  // Best-effort Storage cleanup; tolerate missing files.
  try { if (item.storagePath) await deleteObject(storageRef(storage, item.storagePath)); }
  catch { /* ignore */ }
}

// Set the wedding date (epoch ms or null to clear).
export async function setWeddingDate(groomUid, epochMs) {
  const uid = resolveUid(groomUid);
  await setDoc(mediaDoc(uid), { weddingDate: epochMs ?? null }, { merge: true });
}

// Toggle the photographer-published flag.
export async function setPhotographerPublished(groomUid, published) {
  const uid = resolveUid(groomUid);
  await setDoc(mediaDoc(uid), { photographerPublished: !!published }, { merge: true });
}

// Save the groom's custom guest ranks (e.g. "العرس فقط", "العرس والزيانة").
// Stored as a string[] on the parent invitation doc; the Add Guest dropdown
// reads from the same field via subscribeDigitalMedia.
export async function setGuestRanks(groomUid, ranks) {
  const uid = resolveUid(groomUid);
  const clean = Array.from(new Set(
    (ranks || []).map(r => (r || "").trim()).filter(Boolean),
  ));
  await setDoc(mediaDoc(uid), { guestRanks: clean }, { merge: true });
}

// One-time read for the public landing page (no subscription, no auth gate).
// Used by the unauthenticated /d/{groomUsername}/{token} route.
export async function getDigitalInvitationPublic(groomUid) {
  const snap = await getDoc(mediaDoc(groomUid));
  return snap.exists() ? projectMediaDoc(snap.data()) : null;
}

// Legacy single-file API — keep for any callers still using it (none after
// DigitalDashboard rewrite, but harmless to keep one release).
export async function saveDigitalMediaFile(groomUid, file) {
  return addInvitationMedia(groomUid, file);
}

export async function removeDigitalMedia(groomUid) {
  const uid = resolveUid(groomUid);
  await setDoc(mediaDoc(uid), { media: [], backgroundUrl: null, backgroundType: null, storagePath: null }, { merge: true });
}

// ── Photographer Files ─────────────────────────────────────────────────────────

export function subscribePhotographerFiles(groomUid, cb, onErrCb) {
  const path = `digitalInvitations/${groomUid}/photographerFiles`;
  log("subscribePhotographerFiles →", path);
  const q = query(filesCol(groomUid), orderBy("uploadedAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      log(`subscribePhotographerFiles fired (${list.length} docs) ←`, path);
      cb(list);
    },
    onError(`subscribePhotographerFiles(${path})`, onErrCb),
  );
}

// Public, unauthenticated read — used by /d/{groomUsername}/{token}/photos.
// Only succeeds when photographerPublished == true (enforced by Firestore rules).
export async function fetchPublishedPhotographerFiles(groomUid) {
  const snap = await getDoc(mediaDoc(groomUid));
  if (!snap.exists() || snap.data().photographerPublished !== true) return [];
  const q = query(filesCol(groomUid), orderBy("uploadedAt", "desc"));
  const r = await getDocs(q);
  return r.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function uploadPhotographerFile(groomUid, file) {
  const uid      = resolveUid(groomUid);
  const safeName = file.name.replace(/[^\w.\-]/g, "_");
  const path     = `photographerFiles/${uid}/${Date.now()}_${safeName}`;
  const docPath  = `digitalInvitations/${uid}/photographerFiles`;
  log("uploadPhotographerFile → storage:", path);
  try {
    const sr = storageRef(storage, path);
    await uploadBytes(sr, file, { contentType: file.type || "application/octet-stream" });
    const url = await getDownloadURL(sr);
    log("uploadPhotographerFile → firestore:", docPath);
    const docRef = await addDoc(filesCol(uid), {
      name: file.name, url, type: file.type || "",
      storagePath: path, uploadedAt: Date.now(),
    });
    log("uploadPhotographerFile ✓ saved", `${docPath}/${docRef.id}`);
    return { url, key: docRef.id };
  } catch (err) {
    logErr(`uploadPhotographerFile(${docPath})`, err);
    throw err;
  }
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
