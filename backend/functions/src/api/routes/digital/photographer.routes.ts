import type { ParsedMultipart } from "./storage";
import { Response } from "express";
import { AuthRequest,requireAuth } from "../../middleware/auth";
import { uidRateLimit } from "../../middleware/rateLimit";
import { HOUR_MS } from "../../../constants/time";
import { RATE } from "../../../constants/rateLimits";
import { touchUnindexedPhotographerFiles } from "../../../faceIndex/backfill";
import { STORAGE_PHOTOG_PREFIX,MAX_GUEST_NAME_LEN,MAX_PHOTOG_BYTES,SAFE_NAME_RE } from "./constants";
import { photographerCol } from "./firestore";
import { uploadAndGetUrl,deleteStorageObjectSilently,parseMultipart } from "./storage";
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
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    let parsed: ParsedMultipart;
    try {
      parsed = await parseMultipart(req, MAX_PHOTOG_BYTES);
    } catch (err) {
      res.status(400).json({ error: "invalid_multipart", detail: safeDetail(err) });
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
      res.status(500).json({ error: "upload_failed", detail: safeDetail(err) });
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
