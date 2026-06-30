import type { ParsedMultipart } from "./storage";
import { Response } from "express";
import { AuthRequest,requireAuth } from "../../middleware/auth";
import { touchUnindexedPhotographerFiles } from "../../../faceIndex/backfill";
import { STORAGE_MEDIA_PREFIX,DESIGN_FIELDS,MAX_INVITE_MEDIA_BYTES,MAX_HERO_MEDIA_ITEMS,ALLOWED_MEDIA_PREFIX } from "./constants";
import { fs,parentDoc,designDoc,ensureMigrated,resolveDefaultDesignId,resolveDesignId } from "./firestore";
import { uploadAndGetUrl,deleteStorageObjectSilently,deleteStorageFolder,kindOf,parseMultipart,hasAllowedPrefix,pickExtensionFromFilename } from "./storage";
import { canActOnUid } from "./access";
import { sanitizeMediaSettings } from "./sanitize";
import { projectMediaDoc,migrateLegacyBackground,safeDetail } from "./project";
import { sendPhotoLinksForGroom } from "./photoShare.routes";
import { Router } from "express";

export function registerMediaRoutes(router: Router): void {
// ═══════════════════════════════════════════════════════════════════════════════
// MEDIA DOC + media[]  —  digitalInvitations/{uid}
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Read one design (projected). Legacy `/:uid/media` resolves the default
 * design; `/:uid/designs/:designId` reads that specific design. The response
 * merges the parent's operational fields (photographerPublished, guestRanks)
 * so legacy callers that read them off this doc keep working.
 */
router.get(
  ["/:uid/media", "/:uid/designs/:designId"],
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      const uid = req.params.uid;
      const designId = await resolveDesignId(req);
      const [dSnap, pSnap] = await Promise.all([
        designDoc(uid, designId).get(),
        parentDoc(uid).get(),
      ]);
      if (!dSnap.exists) {
        res.json(null);
        return;
      }
      const design = projectMediaDoc(dSnap.data()) as Record<string, unknown>;
      const p = pSnap.exists ? (pSnap.data() as Record<string, unknown>) : {};
      res.json({
        ...design,
        designId,
        photographerPublished: p.photographerPublished === true,
        guestRanks: Array.isArray(p.guestRanks) ? p.guestRanks : [],
      });
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Patch a design's fields. Legacy `/:uid/media/settings` targets the default
 * design; `/:uid/designs/:designId` targets a specific one. Design fields are
 * written to the design doc (editing while approved demotes it to draft — sent
 * tokens carry an immutable snapshot, so they're unaffected). The two
 * operational keys (photographerPublished, guestRanks) are routed to the PARENT
 * doc, so the legacy combined endpoint keeps working during migration.
 */
router.patch(
  ["/:uid/media/settings", "/:uid/designs/:designId"],
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
      const uid = req.params.uid;
      const designId = await resolveDesignId(req);

      const parentPatch: Record<string, unknown> = {};
      const designPatch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(sanitized.value)) {
        if (k === "photographerPublished" || k === "guestRanks") parentPatch[k] = v;
        else designPatch[k] = v;
      }

      if (Object.keys(designPatch).length > 0) {
        const dRef = designDoc(uid, designId);
        const touchesDesign = Object.keys(designPatch).some((k) => DESIGN_FIELDS.has(k));
        if (touchesDesign) {
          const dSnap = await dRef.get();
          if (dSnap.exists && dSnap.data()?.designStatus === "approved") {
            designPatch.designStatus = "draft";
            designPatch.designApprovedAt = null;
          }
        }
        await dRef.set(designPatch, { merge: true });
      }
      if (Object.keys(parentPatch).length > 0) {
        await parentDoc(uid).set(parentPatch, { merge: true });
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Operational settings on the PARENT doc (guestRanks, photographerPublished) —
 * NOT design fields, so they never demote a design. Used by the guests UI and
 * the photographer publish toggle.
 */
router.get(
  "/:uid/settings",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      await ensureMigrated(req.params.uid);
      const snap = await parentDoc(req.params.uid).get();
      const p = snap.exists ? (snap.data() as Record<string, unknown>) : {};
      res.json({
        photographerPublished: p.photographerPublished === true,
        guestRanks: Array.isArray(p.guestRanks) ? p.guestRanks : [],
        defaultDesignId: (p.defaultDesignId as string) ?? null,
      });
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: safeDetail(err) });
    }
  }
);

router.patch(
  "/:uid/settings",
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
    const patch: Record<string, unknown> = {};
    for (const k of ["photographerPublished", "guestRanks"] as const) {
      if (k in sanitized.value) patch[k] = (sanitized.value as Record<string, unknown>)[k];
    }
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: "empty_patch" });
      return;
    }
    try {
      // Detect a photographerPublished false→true flip BEFORE the merge so
      // the face-index backfill runs exactly when photos go live for guests.
      let publishFlippedOn = false;
      if (patch.photographerPublished === true) {
        const before = await parentDoc(req.params.uid).get();
        publishFlippedOn =
          !before.exists || before.data()?.photographerPublished !== true;
      }
      // Publishing turns on biometric face indexing for EVERY guest visible in
      // the photographer's photos. The first publish requires the groom to
      // affirm guests were notified (DPIA lawful-basis gate); that same flip
      // opens `indexingConsentGate`, which faceIndex/trigger.ts checks before
      // indexing any face. Refuse the flip (no write) if the ack is missing.
      if (publishFlippedOn) {
        if (req.body?.photographerAck !== true) {
          res.status(409).json({ error: "ack_required" });
          return;
        }
        patch.indexingConsentGate = true;
      }
      await parentDoc(req.params.uid).set(patch, { merge: true });
      if (publishFlippedOn) {
        // Persist the acknowledgment to the server-only galleryConfig subdoc so
        // it is auditable but never exposed on the public-read parent doc.
        await fs()
          .doc(`digitalInvitations/${req.params.uid}/galleryConfig/config`)
          .set(
            {
              photographerAck: {
                at: Date.now(),
                byUid: req.caller?.uid ?? null,
                version: "photog-ack-v1",
                notifiedGuests: true,
              },
            },
            { merge: true },
          )
          .catch((err) => console.error("[digital] ack persist failed", err));

        // Best-effort: a backfill hiccup must never fail the settings write.
        // Awaited (not fire-and-forget) because Cloud Functions may freeze
        // the instance right after the response is sent.
        await touchUnindexedPhotographerFiles(req.params.uid)
          .then((n) => {
            if (n > 0) console.log(`[digital] publish flip queued ${n} file(s) for face indexing`);
          })
          .catch((err) => console.error("[digital] publish-flip backfill failed", err));

        // If the groom opted in (galleryConfig.autoSendOnPublish), auto-send
        // each guest their "your photos are ready" WhatsApp link. No-ops when
        // WhatsApp/template are unconfigured. Best-effort — never fails publish.
        try {
          const cfgSnap = await fs().doc(`digitalInvitations/${req.params.uid}/galleryConfig/config`).get();
          if (cfgSnap.exists && cfgSnap.data()?.autoSendOnPublish === true) {
            const r = await sendPhotoLinksForGroom(req.params.uid);
            console.log(`[digital] autoSendOnPublish: sent ${r.sent}/${r.considered}`, r.skipped);
          }
        } catch (err) {
          console.error("[digital] autoSendOnPublish failed", err);
        }
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Upload a new background media item. Multipart `file` field, max 50 MB,
 * `image/*` or `video/*`. Storage path: `digitalMedia/{uid}/m_{ts}.{ext}`.
 * Appends to the media[] array via a read-modify-write so concurrent
 * uploads don't clobber.
 */
router.post(
  ["/:uid/media/upload", "/:uid/designs/:designId/media/upload"],
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
      res.status(400).json({ error: "invalid_multipart", detail: safeDetail(err) });
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

    // `target` selects which array the upload appends to: the hero/featured
    // media shown under the greeting ("hero") or the gallery (default).
    const target = parsed.fields.target === "hero" ? "hero" : "gallery";

    try {
      const uid = req.params.uid;
      const designId = await resolveDesignId(req);
      const ext = pickExtensionFromFilename(parsed.file.filename, "bin");
      const prefix = target === "hero" ? "hero" : "m";
      const path = `${STORAGE_MEDIA_PREFIX}/${uid}/${designId}/${prefix}_${Date.now()}.${ext}`;
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

      // BUG-O003 fix — atomic append via transaction (now per design doc).
      const docRef = designDoc(uid, designId);
      await fs().runTransaction(async (tx) => {
        const docSnap = await tx.get(docRef);
        const data = docSnap.exists ? docSnap.data() : null;
        const update: Record<string, unknown> = {};
        if (target === "hero") {
          const existing = (data?.heroMedia ?? []) as unknown[];
          update.heroMedia = [...existing, item].slice(-MAX_HERO_MEDIA_ITEMS);
        } else {
          const existing = (data?.media ?? []) as unknown[];
          const migrated = migrateLegacyBackground(data, existing);
          update.media = [...migrated, item];
        }
        if (data?.designStatus === "approved") {
          update.designStatus = "draft";
          update.designApprovedAt = null;
        }
        tx.set(docRef, update, { merge: true });
      });
      res.json(item);
    } catch (err) {
      res.status(500).json({ error: "upload_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Delete one media item. Body: `{ storagePath }`. Removes the entry from
 * media[] (read-modify-write) and best-effort deletes the Storage object.
 */
router.post(
  ["/:uid/media/delete-item", "/:uid/designs/:designId/media/delete-item"],
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
    // `target` selects which array to prune — hero/featured media or gallery.
    const target = req.body?.target === "hero" ? "hero" : "gallery";
    try {
      const uid = req.params.uid;
      const designId = await resolveDesignId(req);
      // BUG-O003 fix — same read-modify-write race as the upload path (per design doc).
      const docRef = designDoc(uid, designId);
      await fs().runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        if (!snap.exists) return;
        const data = snap.data();
        const field = target === "hero" ? "heroMedia" : "media";
        const existing = (data?.[field] ?? []) as { storagePath?: string }[];
        const filtered = existing.filter((m) => m.storagePath !== storagePath);
        const update: Record<string, unknown> = { [field]: filtered };
        if (data?.designStatus === "approved") {
          update.designStatus = "draft";
          update.designApprovedAt = null;
        }
        tx.set(docRef, update, { merge: true });
      });
      await deleteStorageObjectSilently(storagePath);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "delete_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Clear the entire invitation doc + every file under digitalMedia/{uid}.
 * Used by the "remove background" admin/groom action.
 */
/**
 * Legacy "remove all media" — now scoped to the DEFAULT design: clears its
 * media[]/heroMedia[] and deletes that design's storage folder. The parent doc
 * (operational fields + design pointers) and other designs are preserved.
 */
router.delete(
  "/:uid/media",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      const uid = req.params.uid;
      const designId = await resolveDefaultDesignId(uid);
      await designDoc(uid, designId).set({ media: [], heroMedia: [] }, { merge: true });
      await deleteStorageFolder(`${STORAGE_MEDIA_PREFIX}/${uid}/${designId}/`);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "delete_failed", detail: safeDetail(err) });
    }
  }
);

}
