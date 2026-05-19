// Design request service — Firestore-backed.
//
// Workflow:
//   [groom]   submitted          → groom filed a template
//   [admin]   designing          → admin/designer started working
//   [admin]   review             → admin uploaded mockups, awaiting groom review
//   [groom]   revision_requested → groom asked for changes
//   [groom]   approved           → groom approved the design (terminal)
//
// Layout (flat collection):
//   designRequests/{reqId}
//     groomUid, groomUsername, status, templateData, mockups[],
//     revisionNotes, createdAt, updatedAt, approvedAt
import {
  collection, doc, addDoc, updateDoc, onSnapshot, query, where, orderBy,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { firestore, storage, auth } from "../firebase.js";

const designCol = () => collection(firestore, "designRequests");

function uid(groomUid) {
  const u = groomUid || auth.currentUser?.uid;
  if (!u) throw new Error("Not authenticated");
  return u;
}

// Groom view — only this groom's requests, newest first.
export function subscribeDesignRequests(groomUid, cb) {
  const q = query(
    designCol(),
    where("groomUid", "==", groomUid),
    orderBy("createdAt", "desc"),
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    () => cb([]),
  );
}

// Admin view — all requests across all grooms.
export function subscribeAllDesignRequests(cb) {
  const q = query(designCol(), orderBy("createdAt", "desc"));
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
  const ref = await addDoc(designCol(), {
    groomUid: u,
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
export async function startDesigning(reqId) {
  await updateDoc(doc(designCol(), reqId), {
    status: "designing",
    updatedAt: Date.now(),
  });
}

// Admin — upload a mockup image. Appends to mockups[] and moves status to "review".
export async function uploadMockup(groomUid, reqId, file) {
  const u        = uid(groomUid);
  const safeName = file.name.replace(/[^\w.\-]/g, "_");
  const path     = `designMockups/${u}/${reqId}/${Date.now()}_${safeName}`;
  const sr       = storageRef(storage, path);
  await uploadBytes(sr, file, { contentType: file.type || "application/octet-stream" });
  const url = await getDownloadURL(sr);

  // We re-fetch the current document via the snapshot callback in the caller,
  // so the consumer is responsible for passing the existing mockups array.
  return { url, storagePath: path, uploadedAt: Date.now(), name: file.name };
}

// Admin — commit a freshly-uploaded mockup to the request.
export async function commitMockup(reqId, existingMockups, newMockup) {
  await updateDoc(doc(designCol(), reqId), {
    mockups: [...(existingMockups || []), newMockup],
    status: "review",
    revisionNotes: null,
    updatedAt: Date.now(),
  });
}

// Groom — approve the design.
export async function approveDesign(reqId) {
  const now = Date.now();
  await updateDoc(doc(designCol(), reqId), {
    status: "approved",
    approvedAt: now,
    updatedAt: now,
  });
}

// Groom — request a revision with free-text notes.
export async function requestRevision(reqId, notes) {
  await updateDoc(doc(designCol(), reqId), {
    status: "revision_requested",
    revisionNotes: (notes || "").trim() || null,
    updatedAt: Date.now(),
  });
}
