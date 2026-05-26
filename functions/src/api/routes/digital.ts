// Digital-invitation endpoints (Firestore + Storage).
//
// Consolidates four legacy frontend service files (digitalInvitation.js,
// designRequests.js, plus parts of liveLocations/proofs) and one onCall
// function (resetPassword stays in auth.ts) into a single Express router.
//
// Resource layout:
//   Firestore: digitalInvitations/{groomUid}                                — media doc
//              digitalInvitations/{groomUid}/guests/{guestId}                — RSVP list
//              digitalInvitations/{groomUid}/photographerFiles/{fileId}      — photo metadata
//              digitalInvitations/{groomUid}/designRequests/{reqId}          — design workflow
//   Storage:   digitalMedia/{groomUid}/                                       — invite backgrounds
//              photographerFiles/{groomUid}/                                   — wedding photos
//              designMockups/{groomUid}/{reqId}/                              — admin mockups
//
// Authorization (mirror of firestore.rules + storage.rules):
//   - parent doc reads (`/public`): unauthenticated (true)
//   - all other reads/writes: admin OR owning groom
//   - photographerFiles: also public-read when photographerPublished == true
//
// What this file does NOT do:
//   - It does not transcode media or generate thumbnails.
//   - It does not stream design-request status changes; the client polls.
//   - It does not migrate `digitalInvitePreview` (a separate /d/** rewrite
//     with its own caching — kept as a standalone onRequest in index.ts).

import { Router, Request, Response } from "express";
import {
  getFirestore,
  CollectionReference,
  DocumentReference,
  Firestore,
} from "firebase-admin/firestore";
import { getStorage, getDownloadURL } from "firebase-admin/storage";
import busboy from "busboy";
import {
  AuthRequest,
  requireAuth,
  requireAdmin,
} from "../middleware/auth";
import { MAX_BYTES, MAX_LEN } from "../../constants/limits";

// ─── Constants ────────────────────────────────────────────────────────────────

const COLL_ROOT = "digitalInvitations";
const COLL_GUESTS = "guests";
const COLL_PHOTOG = "photographerFiles";
const COLL_DESIGN = "designRequests";

const STORAGE_MEDIA_PREFIX = "digitalMedia";
const STORAGE_PHOTOG_PREFIX = "photographerFiles";
const STORAGE_DESIGN_PREFIX = "designMockups";

const MAX_GUEST_NAME_LEN = MAX_LEN.NAME;
const MAX_GUEST_PHONE_LEN = MAX_LEN.PHONE;
const MAX_GUEST_RANK_LEN = MAX_LEN.GUEST_RANK;
const MAX_GUEST_NOTE_LEN = MAX_LEN.NOTE;
const MAX_BRIDE_NAME_LEN = MAX_LEN.NAME;
const MAX_RANK_ITEMS = 32;
const MAX_GUEST_STATUSES = new Set(["pending", "attending", "absent"]);
const ALLOWED_DESIGN_STATUSES = new Set([
  "submitted",
  "designing",
  "review",
  "revision_requested",
  "approved",
]);

const MAX_INVITE_MEDIA_BYTES = MAX_BYTES.INVITE_MEDIA;
const MAX_PHOTOG_BYTES = MAX_BYTES.PHOTOGRAPHER;
const MAX_MOCKUP_BYTES = MAX_BYTES.MOCKUP;

const ALLOWED_MEDIA_PREFIX = ["image/", "video/"];
const ALLOWED_MOCKUP_PREFIX = ["image/"];

const SAFE_NAME_RE = /[^\w.\-]/g;

export const digitalRouter = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// GUESTS  —  digitalInvitations/{uid}/guests/{guestId}
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * List a groom's digital guests, sorted by createdAt ASC (legacy order).
 * Authorized for admin or owning groom — mirrors `firestore.rules`.
 */
digitalRouter.get(
  "/:uid/guests",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      const snap = await guestsCol(req.params.uid)
        .orderBy("createdAt", "asc")
        .get();
      res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
    }
  }
);

/**
 * Add a guest. Body: `{ name, phone, rank? }`. Always seeds status="pending"
 * and createdAt=now. Returns `{ id, ...record }` so the client can render
 * the row immediately without a round-trip.
 */
digitalRouter.post(
  "/:uid/guests",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const sanitized = sanitizeDigitalGuestCreate(req.body);
    if (!sanitized.ok) {
      res.status(400).json({ error: sanitized.error, field: sanitized.field });
      return;
    }
    try {
      const docRef = await guestsCol(req.params.uid).add({
        ...sanitized.value,
        status: "pending",
        createdAt: Date.now(),
      });
      const snap = await docRef.get();
      res.json({ id: docRef.id, ...snap.data() });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
  }
);

/**
 * Patch a guest. Allowed fields: name, phone, rank, status, note. Unknown
 * keys are dropped. Status is restricted to the same 3 values the UI cycles.
 */
digitalRouter.patch(
  "/:uid/guests/:id",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const sanitized = sanitizeDigitalGuestPatch(req.body);
    if (!sanitized.ok) {
      res.status(400).json({ error: sanitized.error, field: sanitized.field });
      return;
    }
    if (Object.keys(sanitized.value).length === 0) {
      res.status(400).json({ error: "empty_patch" });
      return;
    }
    try {
      await guestsCol(req.params.uid)
        .doc(req.params.id)
        .update(sanitized.value as Record<string, unknown>);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
  }
);

digitalRouter.delete(
  "/:uid/guests/:id",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      await guestsCol(req.params.uid).doc(req.params.id).delete();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "delete_failed", detail: errorMessage(err) });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// MEDIA DOC + media[]  —  digitalInvitations/{uid}
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Read the parent invitation doc. Returns the projected shape (auto-
 * migrates legacy `backgroundUrl` into a synthetic media[0] entry so the
 * frontend can read media[] uniformly).
 */
digitalRouter.get(
  "/:uid/media",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      const snap = await mediaDoc(req.params.uid).get();
      res.json(snap.exists ? projectMediaDoc(snap.data()) : null);
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
    }
  }
);

/**
 * Patch invitation doc settings (weddingDate, photographerPublished,
 * guestRanks, brideName, groomDisplayName). Unknown keys are dropped.
 * Setting `weddingDate: null` clears it (legacy code allowed this).
 */
digitalRouter.patch(
  "/:uid/media/settings",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const sanitized = sanitizeMediaSettings(req.body);
    if (!sanitized.ok) {
      res.status(400).json({ error: sanitized.error, field: sanitized.field });
      return;
    }
    if (Object.keys(sanitized.value).length === 0) {
      res.status(400).json({ error: "empty_patch" });
      return;
    }
    try {
      await mediaDoc(req.params.uid).set(sanitized.value, { merge: true });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
  }
);

/**
 * Upload a new background media item. Multipart `file` field, max 50 MB,
 * `image/*` or `video/*`. Storage path: `digitalMedia/{uid}/m_{ts}.{ext}`.
 * Appends to the media[] array via a read-modify-write so concurrent
 * uploads don't clobber.
 */
digitalRouter.post(
  "/:uid/media/upload",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    let parsed: ParsedMultipart;
    try {
      parsed = await parseMultipart(req, MAX_INVITE_MEDIA_BYTES);
    } catch (err) {
      res.status(400).json({ error: "invalid_multipart", detail: errorMessage(err) });
      return;
    }
    if (!parsed.file) {
      res.status(400).json({ error: "missing_file" });
      return;
    }
    if (parsed.file.truncated) {
      res.status(413).json({ error: "file_too_large", maxBytes: MAX_INVITE_MEDIA_BYTES });
      return;
    }
    if (!hasAllowedPrefix(parsed.file.contentType, ALLOWED_MEDIA_PREFIX)) {
      res.status(415).json({ error: "unsupported_content_type" });
      return;
    }

    try {
      const uid = req.params.uid;
      const ext = pickExtensionFromFilename(parsed.file.filename, "bin");
      const path = `${STORAGE_MEDIA_PREFIX}/${uid}/m_${Date.now()}.${ext}`;
      const url = await uploadAndGetUrl(
        path,
        parsed.file.buffer,
        parsed.file.contentType
      );

      const item = {
        url,
        kind: kindOf(parsed.file.contentType),
        storagePath: path,
        order: Date.now(),
      };

      const docRef = mediaDoc(uid);
      const docSnap = await docRef.get();
      const existing = (docSnap.exists ? docSnap.data()?.media : null) ?? [];
      const migrated = migrateLegacyBackground(docSnap.exists ? docSnap.data() : null, existing);
      await docRef.set({ media: [...migrated, item] }, { merge: true });
      res.json(item);
    } catch (err) {
      res.status(500).json({ error: "upload_failed", detail: errorMessage(err) });
    }
  }
);

/**
 * Delete one media item. Body: `{ storagePath }`. Removes the entry from
 * media[] (read-modify-write) and best-effort deletes the Storage object.
 */
digitalRouter.post(
  "/:uid/media/delete-item",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const storagePath = (req.body?.storagePath ?? "").toString();
    if (!storagePath.startsWith(`${STORAGE_MEDIA_PREFIX}/${req.params.uid}/`)) {
      res.status(400).json({ error: "invalid_storage_path" });
      return;
    }
    try {
      const docRef = mediaDoc(req.params.uid);
      const snap = await docRef.get();
      if (snap.exists) {
        const existing = (snap.data()?.media ?? []) as { storagePath?: string }[];
        const filtered = existing.filter((m) => m.storagePath !== storagePath);
        await docRef.set({ media: filtered }, { merge: true });
      }
      await deleteStorageObjectSilently(storagePath);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "delete_failed", detail: errorMessage(err) });
    }
  }
);

/**
 * Clear the entire invitation doc + every file under digitalMedia/{uid}.
 * Used by the "remove background" admin/groom action.
 */
digitalRouter.delete(
  "/:uid/media",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      await mediaDoc(req.params.uid).delete().catch(() => undefined);
      await deleteStorageFolder(`${STORAGE_MEDIA_PREFIX}/${req.params.uid}/`);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "delete_failed", detail: errorMessage(err) });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// PHOTOGRAPHER FILES  —  digitalInvitations/{uid}/photographerFiles
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * List photographer files (Firestore docs) sorted by uploadedAt DESC.
 * Authorized for admin / groom; also for the public when
 * `photographerPublished === true` on the parent doc.
 */
digitalRouter.get(
  "/:uid/photographer",
  async (req: AuthRequest, res: Response) => {
    const authed = await authenticatePhotographerRead(req);
    if (!authed.ok) {
      res.status(authed.status).json({ error: authed.error });
      return;
    }
    try {
      const snap = await photographerCol(req.params.uid)
        .orderBy("uploadedAt", "desc")
        .get();
      res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
    }
  }
);

/**
 * Upload a photographer file. Multipart `file`, max 200 MB, any content
 * type (the legacy code allowed `application/octet-stream`). Stores under
 * `photographerFiles/{uid}/{ts}_{safeName}` and writes a metadata doc.
 */
digitalRouter.post(
  "/:uid/photographer/upload",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    let parsed: ParsedMultipart;
    try {
      parsed = await parseMultipart(req, MAX_PHOTOG_BYTES);
    } catch (err) {
      res.status(400).json({ error: "invalid_multipart", detail: errorMessage(err) });
      return;
    }
    if (!parsed.file) {
      res.status(400).json({ error: "missing_file" });
      return;
    }
    if (parsed.file.truncated) {
      res.status(413).json({ error: "file_too_large", maxBytes: MAX_PHOTOG_BYTES });
      return;
    }

    try {
      const uid = req.params.uid;
      const safeName = parsed.file.filename.replace(SAFE_NAME_RE, "_");
      const path = `${STORAGE_PHOTOG_PREFIX}/${uid}/${Date.now()}_${safeName}`;
      const url = await uploadAndGetUrl(
        path,
        parsed.file.buffer,
        parsed.file.contentType
      );
      const docRef = await photographerCol(uid).add({
        name: parsed.file.filename,
        url,
        type: parsed.file.contentType,
        storagePath: path,
        uploadedAt: Date.now(),
      });
      res.json({ id: docRef.id, url, storagePath: path });
    } catch (err) {
      res.status(500).json({ error: "upload_failed", detail: errorMessage(err) });
    }
  }
);

/**
 * Rename a photographer file. Body: `{ name }`. Trimmed name must not be
 * empty. Only updates the Firestore doc; Storage object is untouched.
 */
digitalRouter.patch(
  "/:uid/photographer/:fileId",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const name = (req.body?.name ?? "").toString().trim();
    if (!name || name.length > MAX_GUEST_NAME_LEN) {
      res.status(400).json({ error: "invalid_name" });
      return;
    }
    try {
      await photographerCol(req.params.uid)
        .doc(req.params.fileId)
        .update({ name });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
  }
);

/**
 * Delete a photographer file. Reads the doc first to capture storagePath,
 * deletes both layers. Tolerates orphans (missing doc or missing object).
 */
digitalRouter.delete(
  "/:uid/photographer/:fileId",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      const docRef = photographerCol(req.params.uid).doc(req.params.fileId);
      const snap = await docRef.get();
      const storagePath = snap.exists ? snap.data()?.storagePath : null;
      await docRef.delete().catch(() => undefined);
      if (storagePath) await deleteStorageObjectSilently(storagePath);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "delete_failed", detail: errorMessage(err) });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN REQUESTS  —  digitalInvitations/{uid}/designRequests
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Admin-only collectionGroup read across every groom's design requests.
 * Mounted BEFORE the /:uid/design-requests routes so the literal path
 * doesn't get captured as a groomUid.
 */
digitalRouter.get(
  "/design-requests",
  requireAuth,
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      const snap = await getFirestore()
        .collectionGroup(COLL_DESIGN)
        .orderBy("createdAt", "desc")
        .get();
      res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
    }
  }
);

/**
 * List one groom's design requests, sorted newest first. Admin or owning
 * groom only — mirrors `firestore.rules`.
 */
digitalRouter.get(
  "/:uid/design-requests",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      const snap = await designCol(req.params.uid)
        .orderBy("createdAt", "desc")
        .get();
      res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
    }
  }
);

/**
 * Groom submits a new design template. Body: `{ groomUsername, templateData }`.
 * Always seeds status="submitted", empty mockups[], null revisionNotes/approvedAt.
 */
digitalRouter.post(
  "/:uid/design-requests",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const groomUsername = (req.body?.groomUsername ?? "").toString().slice(0, 60);
    const templateData = req.body?.templateData ?? {};
    if (!templateData || typeof templateData !== "object" || Array.isArray(templateData)) {
      res.status(400).json({ error: "invalid_template_data" });
      return;
    }
    const now = Date.now();
    try {
      const docRef = await designCol(req.params.uid).add({
        groomUid: req.params.uid,
        groomUsername,
        status: "submitted",
        templateData,
        mockups: [],
        revisionNotes: null,
        createdAt: now,
        updatedAt: now,
        approvedAt: null,
      });
      res.json({ id: docRef.id });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
  }
);

/**
 * Patch a design request. Accepts any of:
 *   - status: one of the 5 allowed values
 *   - mockups: array (set by mockup-upload endpoint typically)
 *   - revisionNotes: string|null
 *   - approvedAt: number|null
 * Server always stamps `updatedAt: now`. Admin can transition to any status;
 * groom can only transition to approved / revision_requested.
 */
digitalRouter.patch(
  "/:uid/design-requests/:reqId",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const sanitized = sanitizeDesignPatch(req.body, req.caller!.claims.role === "admin");
    if (!sanitized.ok) {
      res.status(400).json({ error: sanitized.error, field: sanitized.field });
      return;
    }
    if (Object.keys(sanitized.value).length === 0) {
      res.status(400).json({ error: "empty_patch" });
      return;
    }
    try {
      await designCol(req.params.uid)
        .doc(req.params.reqId)
        .update({ ...sanitized.value, updatedAt: Date.now() });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
  }
);

/**
 * Admin uploads a mockup image. Multipart `file`, max 50 MB, `image/*`.
 * Appends the new mockup metadata to the request's mockups[] and flips
 * status to "review", clearing any prior revisionNotes.
 */
digitalRouter.post(
  "/:uid/design-requests/:reqId/mockup",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    let parsed: ParsedMultipart;
    try {
      parsed = await parseMultipart(req, MAX_MOCKUP_BYTES);
    } catch (err) {
      res.status(400).json({ error: "invalid_multipart", detail: errorMessage(err) });
      return;
    }
    if (!parsed.file) {
      res.status(400).json({ error: "missing_file" });
      return;
    }
    if (parsed.file.truncated) {
      res.status(413).json({ error: "file_too_large", maxBytes: MAX_MOCKUP_BYTES });
      return;
    }
    if (!hasAllowedPrefix(parsed.file.contentType, ALLOWED_MOCKUP_PREFIX)) {
      res.status(415).json({ error: "unsupported_content_type" });
      return;
    }

    try {
      const { uid, reqId } = req.params;
      const safeName = parsed.file.filename.replace(SAFE_NAME_RE, "_");
      const path = `${STORAGE_DESIGN_PREFIX}/${uid}/${reqId}/${Date.now()}_${safeName}`;
      const url = await uploadAndGetUrl(
        path,
        parsed.file.buffer,
        parsed.file.contentType
      );
      const mockup = {
        url,
        storagePath: path,
        uploadedAt: Date.now(),
        name: parsed.file.filename,
      };

      const docRef = designCol(uid).doc(reqId);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        res.status(404).json({ error: "design_request_not_found" });
        return;
      }
      const existing = (docSnap.data()?.mockups ?? []) as unknown[];
      await docRef.update({
        mockups: [...existing, mockup],
        status: "review",
        revisionNotes: null,
        updatedAt: Date.now(),
      });
      res.json(mockup);
    } catch (err) {
      res.status(500).json({ error: "upload_failed", detail: errorMessage(err) });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC INVITATION READ  —  /digital/:uid/public
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Unauthenticated read of the projected media doc. Used by the guest-facing
 * `/d/{groomUsername}/{token}` page to render the invitation without
 * sign-in. Returns `null` (HTTP 200) when the doc doesn't exist so the
 * client can decide how to render that case.
 */
digitalRouter.get("/:uid/public", async (req: Request, res: Response) => {
  try {
    const snap = await mediaDoc(req.params.uid).get();
    res.json(snap.exists ? projectMediaDoc(snap.data()) : null);
  } catch (err) {
    res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
  }
});

// ─── Firestore + Storage helpers ──────────────────────────────────────────────

function fs(): Firestore {
  return getFirestore();
}

function mediaDoc(uid: string): DocumentReference {
  return fs().doc(`${COLL_ROOT}/${uid}`);
}

function guestsCol(uid: string): CollectionReference {
  return fs().collection(`${COLL_ROOT}/${uid}/${COLL_GUESTS}`);
}

function photographerCol(uid: string): CollectionReference {
  return fs().collection(`${COLL_ROOT}/${uid}/${COLL_PHOTOG}`);
}

function designCol(uid: string): CollectionReference {
  return fs().collection(`${COLL_ROOT}/${uid}/${COLL_DESIGN}`);
}

/**
 * Save a buffer to Storage and return a Firebase download URL. The URL
 * uses a Firebase download token embedded in the link, which stays valid
 * until the token is rotated/revoked — strictly better than the prior
 * 30-day signed URL that expired even while still referenced in
 * Firestore.
 *
 * `getDownloadURL` (firebase-admin/storage ≥ v11.4) does NOT require the
 * `Service Account Token Creator` IAM role that `bucket.file().getSignedUrl()`
 * needs, so it works out of the box on a default Firebase Functions deploy.
 *
 * BUG-002 fix — `resumable: true` lets the GCS client chunk the upload
 * and retry individual chunks on transient errors instead of restarting
 * the entire file on any failure. For the larger uploads we support
 * (photographer files up to 200 MB), this is the difference between a
 * failed flaky network costing the whole upload vs. just a few seconds.
 * For small files there's a tiny extra round trip to start the session,
 * but it's well under a second and worth the reliability win.
 */
async function uploadAndGetUrl(
  path: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const file = getStorage().bucket().file(path);
  await file.save(buffer, { contentType, resumable: true });
  return getDownloadURL(file);
}

/**
 * Best-effort delete of a Storage object. Logs but never throws — the
 * Firestore record (or media[] entry) has already been pruned, and a
 * dangling Storage object is recoverable via a sweep.
 */
async function deleteStorageObjectSilently(path: string): Promise<void> {
  try {
    await getStorage().bucket().file(path).delete();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[digital] storage delete failed", path, err);
  }
}

/**
 * Best-effort delete of every object under a prefix. Used by full-media
 * removal — the Firestore doc deletion is the source of truth.
 */
async function deleteStorageFolder(prefix: string): Promise<void> {
  try {
    const [files] = await getStorage().bucket().getFiles({ prefix });
    await Promise.all(
      files.map((f) =>
        f.delete().catch((err) => {
          // eslint-disable-next-line no-console
          console.warn("[digital] folder delete failed", f.name, err);
        })
      )
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[digital] folder list failed", prefix, err);
  }
}

// ─── Authorization helpers ────────────────────────────────────────────────────

/**
 * Most endpoints: admin OR owning groom (the uid in the path).
 * Mirrors `firestore.rules` `digitalInvitations/{groomUid}` clauses.
 */
function canActOnUid(req: AuthRequest, uid: string): boolean {
  const claims = req.caller!.claims;
  if (claims.role === "admin") return true;
  if (req.caller!.uid === uid) return true;
  return false;
}

/**
 * Photographer-files read: admin / owning groom, OR anyone when the parent
 * doc has photographerPublished === true (face-matching guest page). The
 * caller is allowed to be unauthenticated, so we don't run `requireAuth`
 * before this — we authenticate inline so the public path stays open.
 */
async function authenticatePhotographerRead(
  req: AuthRequest
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const docSnap = await mediaDoc(req.params.uid).get();
  const published =
    docSnap.exists && docSnap.data()?.photographerPublished === true;
  if (published) return { ok: true };

  // Not published — fall back to authenticated admin / owning groom.
  const authHeader = req.headers.authorization ?? "";
  if (!authHeader && !req.query?.token) {
    return { ok: false, status: 401, error: "unauthenticated" };
  }
  try {
    // Reuse requireAuth's verification by importing it would create a cycle;
    // verify inline using the same Admin SDK call.
    const { getAuth } = await import("firebase-admin/auth");
    const token =
      authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length).trim()
        : (req.query?.token as string);
    const decoded = await getAuth().verifyIdToken(token, true);
    req.caller = {
      uid: decoded.uid,
      claims: decoded as unknown as AuthRequest["caller"] extends { claims: infer C } ? C : never,
    };
    if (!canActOnUid(req, req.params.uid)) {
      return { ok: false, status: 403, error: "forbidden" };
    }
    return { ok: true };
  } catch {
    return { ok: false, status: 401, error: "invalid_token" };
  }
}

// ─── Sanitizers ───────────────────────────────────────────────────────────────

type Sanitized<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; field?: string };

interface DigitalGuestCreate {
  name: string;
  phone: string;
  rank?: string;
}

function sanitizeDigitalGuestCreate(
  body: unknown
): Sanitized<DigitalGuestCreate> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }
  const data = body as Record<string, unknown>;
  const name = (data.name ?? "").toString().trim();
  const phone = (data.phone ?? "").toString().trim();
  if (!name || name.length > MAX_GUEST_NAME_LEN) {
    return { ok: false, error: "invalid_name", field: "name" };
  }
  if (!phone || phone.length > MAX_GUEST_PHONE_LEN) {
    return { ok: false, error: "invalid_phone", field: "phone" };
  }
  const rankRaw = (data.rank ?? "").toString().trim();
  const out: DigitalGuestCreate = { name, phone };
  if (rankRaw) {
    if (rankRaw.length > MAX_GUEST_RANK_LEN) {
      return { ok: false, error: "rank_too_long", field: "rank" };
    }
    out.rank = rankRaw;
  }
  return { ok: true, value: out };
}

interface DigitalGuestPatch {
  name?: string;
  phone?: string;
  rank?: string;
  status?: string;
  note?: string;
}

function sanitizeDigitalGuestPatch(
  body: unknown
): Sanitized<DigitalGuestPatch> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }
  const data = body as Record<string, unknown>;
  const out: DigitalGuestPatch = {};

  if (data.name !== undefined) {
    const v = (data.name ?? "").toString().trim();
    if (!v || v.length > MAX_GUEST_NAME_LEN) {
      return { ok: false, error: "invalid_name", field: "name" };
    }
    out.name = v;
  }
  if (data.phone !== undefined) {
    const v = (data.phone ?? "").toString().trim();
    if (!v || v.length > MAX_GUEST_PHONE_LEN) {
      return { ok: false, error: "invalid_phone", field: "phone" };
    }
    out.phone = v;
  }
  if (data.rank !== undefined) {
    const v = (data.rank ?? "").toString().trim();
    if (v.length > MAX_GUEST_RANK_LEN) {
      return { ok: false, error: "rank_too_long", field: "rank" };
    }
    out.rank = v;
  }
  if (data.status !== undefined) {
    const v = (data.status ?? "").toString();
    if (!MAX_GUEST_STATUSES.has(v)) {
      return { ok: false, error: "invalid_status", field: "status" };
    }
    out.status = v;
  }
  if (data.note !== undefined) {
    const v = (data.note ?? "").toString();
    if (v.length > MAX_GUEST_NOTE_LEN) {
      return { ok: false, error: "note_too_long", field: "note" };
    }
    out.note = v;
  }
  return { ok: true, value: out };
}

interface MediaSettings {
  weddingDate?: number | null;
  photographerPublished?: boolean;
  guestRanks?: string[];
  brideName?: string;
  groomDisplayName?: string;
}

function sanitizeMediaSettings(body: unknown): Sanitized<MediaSettings> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }
  const data = body as Record<string, unknown>;
  const out: MediaSettings = {};

  if (data.weddingDate !== undefined) {
    if (data.weddingDate === null) {
      out.weddingDate = null;
    } else if (
      typeof data.weddingDate === "number" &&
      Number.isFinite(data.weddingDate)
    ) {
      out.weddingDate = data.weddingDate;
    } else {
      return { ok: false, error: "invalid_wedding_date", field: "weddingDate" };
    }
  }
  if (data.photographerPublished !== undefined) {
    if (typeof data.photographerPublished !== "boolean") {
      return {
        ok: false,
        error: "invalid_published_flag",
        field: "photographerPublished",
      };
    }
    out.photographerPublished = data.photographerPublished;
  }
  if (data.guestRanks !== undefined) {
    if (!Array.isArray(data.guestRanks)) {
      return { ok: false, error: "invalid_guest_ranks", field: "guestRanks" };
    }
    const cleaned: string[] = [];
    for (const r of data.guestRanks) {
      if (typeof r !== "string") continue;
      const v = r.trim();
      if (!v) continue;
      if (v.length > MAX_GUEST_RANK_LEN) {
        return { ok: false, error: "rank_too_long", field: "guestRanks" };
      }
      if (!cleaned.includes(v)) cleaned.push(v);
      if (cleaned.length >= MAX_RANK_ITEMS) break;
    }
    out.guestRanks = cleaned;
  }
  if (data.brideName !== undefined) {
    const v = (data.brideName ?? "").toString().trim();
    if (v.length > MAX_BRIDE_NAME_LEN) {
      return { ok: false, error: "bride_name_too_long", field: "brideName" };
    }
    out.brideName = v;
  }
  if (data.groomDisplayName !== undefined) {
    const v = (data.groomDisplayName ?? "").toString().trim();
    if (v.length > MAX_BRIDE_NAME_LEN) {
      return { ok: false, error: "groom_name_too_long", field: "groomDisplayName" };
    }
    out.groomDisplayName = v;
  }
  return { ok: true, value: out };
}

interface DesignPatch {
  status?: string;
  mockups?: unknown[];
  revisionNotes?: string | null;
  approvedAt?: number | null;
}

const GROOM_ALLOWED_STATUSES = new Set(["approved", "revision_requested"]);

function sanitizeDesignPatch(
  body: unknown,
  isAdmin: boolean
): Sanitized<DesignPatch> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }
  const data = body as Record<string, unknown>;
  const out: DesignPatch = {};

  if (data.status !== undefined) {
    const v = (data.status ?? "").toString();
    if (!ALLOWED_DESIGN_STATUSES.has(v)) {
      return { ok: false, error: "invalid_status", field: "status" };
    }
    if (!isAdmin && !GROOM_ALLOWED_STATUSES.has(v)) {
      return { ok: false, error: "groom_status_forbidden", field: "status" };
    }
    out.status = v;
  }
  if (data.mockups !== undefined) {
    if (!Array.isArray(data.mockups)) {
      return { ok: false, error: "invalid_mockups", field: "mockups" };
    }
    out.mockups = data.mockups;
  }
  if (data.revisionNotes !== undefined) {
    if (data.revisionNotes === null) {
      out.revisionNotes = null;
    } else if (typeof data.revisionNotes === "string") {
      out.revisionNotes = data.revisionNotes.slice(0, MAX_GUEST_NOTE_LEN);
    } else {
      return { ok: false, error: "invalid_revision_notes", field: "revisionNotes" };
    }
  }
  if (data.approvedAt !== undefined) {
    if (data.approvedAt === null) {
      out.approvedAt = null;
    } else if (
      typeof data.approvedAt === "number" &&
      Number.isFinite(data.approvedAt)
    ) {
      out.approvedAt = data.approvedAt;
    } else {
      return { ok: false, error: "invalid_approved_at", field: "approvedAt" };
    }
  }
  return { ok: true, value: out };
}

// ─── Media-doc projection (legacy compatibility) ──────────────────────────────

/**
 * Project the parent invitation doc into the shape the frontend expects.
 * The legacy single-background fields (backgroundUrl / backgroundType /
 * storagePath) are folded into a synthetic media[0] entry so the UI can
 * read media[] uniformly without a separate migration pass.
 */
function projectMediaDoc(data: FirebaseFirestore.DocumentData | undefined):
  | Record<string, unknown>
  | null {
  if (!data) return null;
  if (Array.isArray(data.media) && data.media.length > 0) return data;
  if (data.backgroundUrl) {
    return {
      ...data,
      media: [
        {
          url: data.backgroundUrl,
          kind: legacyBackgroundKind(data.backgroundType),
          storagePath: data.storagePath || "",
          order: 0,
        },
      ],
    };
  }
  return data;
}

/**
 * Promote a legacy single-background doc to a media[]-shaped doc when the
 * first multi-upload arrives. Returns the migrated array (or the existing
 * one when nothing to migrate).
 */
function migrateLegacyBackground(
  data: FirebaseFirestore.DocumentData | null | undefined,
  existing: unknown[]
): unknown[] {
  if (existing.length > 0) return existing;
  if (!data) return existing;
  const url = data.backgroundUrl;
  if (!url) return existing;
  return [
    {
      url,
      kind: legacyBackgroundKind(data.backgroundType),
      storagePath: data.storagePath || "",
      order: 0,
    },
  ];
}

function legacyBackgroundKind(type: unknown): "video" | "gif" | "image" {
  if (type === "video") return "video";
  if (type === "gif") return "gif";
  return "image";
}

function kindOf(contentType: string): "video" | "gif" | "image" {
  if (contentType.startsWith("video")) return "video";
  if (contentType === "image/gif") return "gif";
  return "image";
}

// ─── Multipart parsing ────────────────────────────────────────────────────────

interface ParsedMultipart {
  fields: Record<string, string>;
  file: {
    buffer: Buffer;
    contentType: string;
    filename: string;
    truncated: boolean;
  } | null;
}

/**
 * Parse a multipart upload buffered in memory, capped at `maxBytes`.
 * Promise resolves once busboy emits `finish` AND any file stream's `end`
 * has fired (busboy emits `finish` only after all parts are complete).
 *
 * Firebase Functions v2 onRequest consumes the request body up front and
 * exposes the raw bytes as `req.rawBody`. Piping `req` directly would
 * feed busboy zero bytes and produce an "Unexpected end of form" error
 * (surfaced to the client as `invalid_multipart`). When rawBody is
 * present we hand it to busboy via `bb.end(rawBody)`; otherwise (tests,
 * local dev) we fall back to piping the request stream.
 */
function parseMultipart(
  req: Request,
  maxBytes: number
): Promise<ParsedMultipart> {
  return new Promise((resolve, reject) => {
    const bb = busboy({
      headers: req.headers,
      limits: { files: 1, fileSize: maxBytes, fields: 16 },
    });
    const result: ParsedMultipart = { fields: {}, file: null };

    bb.on("field", (name, val) => {
      result.fields[name] = val.slice(0, 1024);
    });

    bb.on("file", (_name, stream, info) => {
      const chunks: Buffer[] = [];
      let truncated = false;
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("limit", () => {
        truncated = true;
      });
      stream.on("end", () => {
        result.file = {
          buffer: Buffer.concat(chunks),
          contentType: info.mimeType || "application/octet-stream",
          filename: info.filename ?? "upload.bin",
          truncated,
        };
      });
      stream.on("error", reject);
    });

    bb.on("error", reject);
    bb.on("finish", () => resolve(result));

    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (rawBody) {
      bb.end(rawBody);
    } else {
      req.pipe(bb);
    }
  });
}

function hasAllowedPrefix(contentType: string, prefixes: string[]): boolean {
  return prefixes.some((p) => contentType.startsWith(p));
}

function pickExtensionFromFilename(filename: string, fallback: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return fallback;
  const ext = filename.slice(dot + 1).toLowerCase();
  if (/^[a-z0-9]+$/.test(ext) && ext.length <= 8) return ext;
  return fallback;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "unknown";
}
