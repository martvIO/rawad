// Design request service — Firestore-backed.
//
// Workflow:
//   [groom]   submitted          → groom filed a template
//   [admin]   designing          → admin/designer started working
//   [admin]   review             → admin uploaded mockups, awaiting groom review
//   [groom]   revision_requested → groom asked for changes
//   [groom]   approved           → groom approved the design (terminal)
//
// Firestore layout — subcollection under each groom's digital invitation doc:
//   digitalInvitations/{groomUid}/designRequests/{reqId}
//     groomUid, groomUsername, status, templateData, mockups[],
//     revisionNotes, createdAt, updatedAt, approvedAt
import {
  collection, collectionGroup, doc, addDoc, updateDoc, onSnapshot, query, orderBy,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { firestore, storage, auth } from "../firebase.js";

// Subcollection path for a specific groom.
const designCol = (groomUid) =>
  collection(firestore, "digitalInvitations", groomUid, "designRequests");

// Document ref helper.
const designDoc = (groomUid, reqId) =>
  doc(firestore, "digitalInvitations", groomUid, "designRequests", reqId);

function uid(groomUid) {
  const u = groomUid || auth.currentUser?.uid;
  if (!u) throw new Error("Not authenticated");
  return u;
}

// Groom view — only this groom's requests, newest first.
export function subscribeDesignRequests(groomUid, cb) {
  const q = query(designCol(groomUid), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    () => cb([]),
  );
}

// Admin view — every design request across all grooms via collectionGroup.
// Each doc still carries `groomUid` as a denormalised field so admin UI doesn't
// need to walk the path to identify which groom owns the request.
export function subscribeAllDesignRequests(cb) {
  const q = query(collectionGroup(firestore, "designRequests"), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    () => cb([]),
  );
}

// Groom — submit a new design template.
// `templateData` shape: { brideName, groomName, weddingDate, colors, style, notes }
export async function submitDesignTemplate(groomUid, groomUsername, templateData) {
  const u   = uid(groomUid);
  const now = Date.now();
  const ref = await addDoc(designCol(u), {
    groomUid: u,                  // denormalised — admin reads it from collectionGroup
    groomUsername: groomUsername || "",
    status: "submitted",
    templateData: templateData || {},
    mockups: [],
    revisionNotes: null,
    createdAt: now,
    updatedAt: now,
    approvedAt: null,
  });
  return ref.id;
}

// Admin — mark "designing" once they pick up the request.
export async function startDesigning(groomUid, reqId) {
  await updateDoc(designDoc(groomUid, reqId), {
    status: "designing",
    updatedAt: Date.now(),
  });
}

// Admin — upload a mockup image to Storage. Returns the mockup metadata; the
// caller commits it to the Firestore doc via commitMockup.
export async function uploadMockup(groomUid, reqId, file) {
  const u        = uid(groomUid);
  const safeName = file.name.replace(/[^\w.\-]/g, "_");
  const path     = `designMockups/${u}/${reqId}/${Date.now()}_${safeName}`;
  const sr       = storageRef(storage, path);
  await uploadBytes(sr, file, { contentType: file.type || "application/octet-stream" });
  const url = await getDownloadURL(sr);
  return { url, storagePath: path, uploadedAt: Date.now(), name: file.name };
}

// Admin — commit a freshly-uploaded mockup to the request.
export async function commitMockup(groomUid, reqId, existingMockups, newMockup) {
  await updateDoc(designDoc(groomUid, reqId), {
    mockups: [...(existingMockups || []), newMockup],
    status: "review",
    revisionNotes: null,
    updatedAt: Date.now(),
  });
}

// Groom — approve the design.
export async function approveDesign(groomUid, reqId) {
  const now = Date.now();
  await updateDoc(designDoc(groomUid, reqId), {
    status: "approved",
    approvedAt: now,
    updatedAt: now,
  });
}

// Groom — request a revision with free-text notes.
export async function requestRevision(groomUid, reqId, notes) {
  await updateDoc(designDoc(groomUid, reqId), {
    status: "revision_requested",
    revisionNotes: (notes || "").trim() || null,
    updatedAt: Date.now(),
  });
}
