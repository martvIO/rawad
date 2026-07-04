import type { ParsedMultipart } from "./storage";
import { Response } from "express";
import { AuthRequest,requireAuth } from "../../middleware/auth";
import { uidRateLimit } from "../../middleware/rateLimit";
import { HOUR_MS } from "../../../constants/time";
import { RATE } from "../../../constants/rateLimits";
import { touchUnindexedPhotographerFiles } from "../../../faceIndex/backfill";
import { STORAGE_PHOTOG_PREFIX,MAX_GUEST_NAME_LEN,MAX_PHOTOG_BYTES,MAX_PHOTOG_LEGACY_BYTES,SAFE_NAME_RE } from "./constants";
import { photographerCol } from "./firestore";
import { uploadAndGetUrl,createUploadSession,getUploadedObjectInfo,deleteStorageObjectSilently,parseMultipart,isSafeMediaContentType } from "./storage";
import { canActOnUid,authenticatePhotographerRead } from "./access";
import { safeDetail } from "./project";
import { Router } from "express";

export function registerPhotographerRoutes(router: Router): void {
// ═══════════════════════════════════════════════════════════════════════════════
// PHOTOGRAPHER FILES  —  digitalInvitations/{uid}/photographerFiles
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * List photographer files (Firestore docs) sorted by uploadedAt DESC.
 * Authorized for admin / groom; also for the public when
 * `photographerPublished === true` on the parent doc.
 */
router.get(
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
      res.status(500).json({ error: "read_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Upload a photographer file. Multipart `file`, max 200 MB, any content
 * type (the legacy code allowed `application/octet-stream`). Stores under
 * `photographerFiles/{uid}/{ts}_{safeName}` and writes a metadata doc.
 */
router.post(
  "/:uid/photographer/upload",
  requireAuth,
  uidRateLimit("photogUpload", RATE.PHOTOG_UPLOAD_PER_USER.limit, HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    let parsed: ParsedMultipart;
    try {
      // This THROUGH-FUNCTION path buffers the whole body in 512 MiB memory, so it
      // is capped at the smaller legacy limit. Large files use /create-upload.
      parsed = await parseMultipart(req, MAX_PHOTOG_LEGACY_BYTES);
    } catch (err) {
      res.status(400).json({ error: "invalid_multipart", detail: safeDetail(err) });
      return;
    }
    if (!parsed.file) {
      res.status(400).json({ error: "missing_file" });
      return;
    }
    if (parsed.file.truncated) {
      res.status(413).json({ error: "file_too_large", maxBytes: MAX_PHOTOG_LEGACY_BYTES });
      return;
    }
    // image/* or video/* only, and NOT image/svg+xml. photographerFiles is
    // public-read once published; previously ANY content-type (incl. text/html
    // and script-bearing SVG) was accepted and served inline from the Google
    // Storage domain — a phishing / JS-host vector. (isSafeMediaContentType)
    if (!isSafeMediaContentType(parsed.file.contentType)) {
      res.status(415).json({ error: "unsupported_content_type" });
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
      res.status(500).json({ error: "upload_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * DIRECT UPLOAD — step 1. Mint a GCS resumable upload session so the browser can
 * PUT the file straight to Storage, bypassing the function (no 512 MiB buffering,
 * no 2-min timeout → multi-GB videos, hours-long uploads, faster). Body:
 * `{ name, contentType, size }`. Returns `{ uploadUrl, storagePath }`.
 */
router.post(
  "/:uid/photographer/create-upload",
  requireAuth,
  uidRateLimit("photogUpload", RATE.PHOTOG_UPLOAD_PER_USER.limit, HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const uid = req.params.uid;
    const name = (req.body?.name ?? "upload.bin").toString();
    const contentType = (req.body?.contentType ?? "application/octet-stream").toString();
    const size = Number(req.body?.size);
    if (!isSafeMediaContentType(contentType)) {
      res.status(415).json({ error: "unsupported_content_type" });
      return;
    }
    if (!Number.isFinite(size) || size <= 0 || size > MAX_PHOTOG_BYTES) {
      res.status(413).json({ error: "file_too_large", maxBytes: MAX_PHOTOG_BYTES });
      return;
    }
    try {
      const safeName = name.replace(SAFE_NAME_RE, "_").slice(0, 200) || "upload.bin";
      const rand = Math.random().toString(36).slice(2, 8);
      const path = `${STORAGE_PHOTOG_PREFIX}/${uid}/${Date.now()}_${rand}_${safeName}`;
      const origin = (req.get("origin") || "").toString() || undefined;
      const uploadUrl = await createUploadSession(path, contentType, origin);
      res.json({ uploadUrl, storagePath: path });
    } catch (err) {
      res.status(500).json({ error: "create_upload_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * DIRECT UPLOAD — step 2. After the browser finishes the direct PUT, register the
 * finalized object: verify it exists under THIS uid's folder + is a safe media
 * type, then write the metadata doc (whose onCreate triggers face indexing). Body:
 * `{ storagePath, name }`. Returns `{ id, url, storagePath, type }`.
 */
router.post(
  "/:uid/photographer/register",
  requireAuth,
  uidRateLimit("photogRegister", RATE.PHOTOG_REGISTER_PER_USER.limit, HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const uid = req.params.uid;
    const storagePath = (req.body?.storagePath ?? "").toString();
    const name = ((req.body?.name ?? "").toString().trim() || "upload").slice(0, MAX_GUEST_NAME_LEN);
    // Path must be inside THIS uid's photographer folder — no traversal / cross-tenant.
    const prefix = `${STORAGE_PHOTOG_PREFIX}/${uid}/`;
    if (!storagePath.startsWith(prefix) || storagePath.includes("..")) {
      res.status(400).json({ error: "invalid_path" });
      return;
    }
    try {
      const info = await getUploadedObjectInfo(storagePath);
      if (!info) {
        res.status(404).json({ error: "object_not_found" });
        return;
      }
      if (!isSafeMediaContentType(info.contentType)) {
        await deleteStorageObjectSilently(storagePath);
        res.status(415).json({ error: "unsupported_content_type" });
        return;
      }
      const docRef = await photographerCol(uid).add({
        name,
        url: info.url,
        type: info.contentType,
        storagePath,
        uploadedAt: Date.now(),
      });
      res.json({ id: docRef.id, url: info.url, storagePath, type: info.contentType });
    } catch (err) {
      res.status(500).json({ error: "register_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Queue face-indexing for every photographer image that has no fresh index
 * row. Backfills uploads that predate the indexing trigger and recovers
 * failed/stale rows (the trigger's freshness check makes re-touching an
 * already-indexed file a no-op). Returns `{ queued }`.
 */
router.post(
  "/:uid/photographer/reindex",
  requireAuth,
  uidRateLimit("photogReindex", RATE.PHOTO_REINDEX_PER_USER.limit, HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      const queued = await touchUnindexedPhotographerFiles(req.params.uid);
      res.json({ ok: true, queued });
    } catch (err) {
      res.status(500).json({ error: "reindex_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Rename a photographer file. Body: `{ name }`. Trimmed name must not be
 * empty. Only updates the Firestore doc; Storage object is untouched.
 */
router.patch(
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
      res.status(500).json({ error: "write_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Delete a photographer file. Reads the doc first to capture storagePath,
 * deletes both layers. Tolerates orphans (missing doc or missing object).
 */
router.delete(
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
      res.status(500).json({ error: "delete_failed", detail: safeDetail(err) });
    }
  }
);

}
