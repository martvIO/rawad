import { Router, Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { AuthRequest, requireAuth, requireAdmin } from "../../middleware/auth";
import { ipRateLimit, uidRateLimit } from "../../middleware/rateLimit";
import { RATE } from "../../../constants/rateLimits";
import { HOUR_MS } from "../../../constants/time";
import { writeAudit } from "../../../audit";
import {
  TEMPLATE_IDS,
  STORAGE_TEMPLATE_ASSETS_PREFIX,
  MAX_TEMPLATE_ASSET_BYTES,
} from "./constants";
import { templateAssetsDoc } from "./firestore";
import {
  parseMultipart,
  uploadAndGetUrl,
  deleteStorageObjectSilently,
  isSafeMediaContentType,
  pickExtensionFromFilename,
  ParsedMultipart,
} from "./storage";
import { safeDetail } from "./project";

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE PREVIEW COVERS
//
// The art a prospect sees before opening a demo: the cover per template shown
// on the public /templates gallery, the landing-page strip, and the groom's
// template picker. The admin uploads one image per template; the bytes live in
// Storage and a single pointer doc (appConfig/templateAssets) maps
// templateId → { url, storagePath, updatedAt }.
//
// Why a pointer doc and not a design field: a cover describes the TEMPLATE, not
// any one couple's design. Keeping it out of the design doc preserves the
// bespoke-template hard rule (no new design-doc fields), so mint/sanitize/
// PUBLIC_DESIGN_FIELDS/snapshot paths are all untouched. It also means one
// cheap, cacheable public read serves every surface.
//
// The frontend resolves uploaded → bundled → label-only, so a template with no
// uploaded cover still renders (its bundled art, else a themed ornament).
//
// Mounted with LITERAL `/templates/*` paths so `templates` is never captured as
// a groomUid by the `/:uid/*` routes.
// ═══════════════════════════════════════════════════════════════════════════
export function registerTemplateAssetsRoutes(router: Router): void {
  // Public (no auth): the cover pointer map. Returns {} when nothing has been
  // uploaded yet — callers then fall back to bundled art. Cached for 5 min: the
  // landing page hits this on every visit and covers change ~never.
  router.get(
    "/templates/assets",
    ipRateLimit("templateAssetsRead", RATE.TEMPLATE_ASSETS_READ_PER_IP.limit, HOUR_MS),
    async (_req: Request, res: Response) => {
      try {
        const snap = await templateAssetsDoc().get();
        res.set("Cache-Control", "public, max-age=300");
        res.json({ assets: snap.exists ? (snap.data() ?? {}) : {} });
      } catch (err) {
        res.status(500).json({ error: "read_failed", detail: safeDetail(err) });
      }
    }
  );

  // Admin: upload/replace one template's cover.
  router.post(
    "/templates/:templateId/asset",
    requireAuth,
    requireAdmin,
    uidRateLimit("templateAssetWrite", RATE.TEMPLATE_ASSET_WRITE_PER_ADMIN.limit, HOUR_MS),
    async (req: AuthRequest, res: Response) => {
      const templateId = req.params.templateId;
      // Validate against the AUTHORITATIVE backend enum — never trust a path
      // param as a Storage path segment or a Firestore field name.
      if (!TEMPLATE_IDS.has(templateId)) {
        res.status(400).json({ error: "invalid_template_id" });
        return;
      }

      let parsed: ParsedMultipart;
      try {
        parsed = await parseMultipart(req, MAX_TEMPLATE_ASSET_BYTES);
      } catch (err) {
        res.status(400).json({ error: "invalid_multipart", detail: safeDetail(err) });
        return;
      }
      if (!parsed.file) {
        res.status(400).json({ error: "missing_file" });
        return;
      }
      if (parsed.file.truncated) {
        res.status(413).json({ error: "file_too_large", maxBytes: MAX_TEMPLATE_ASSET_BYTES });
        return;
      }
      // Covers are STILLS: images only (no video), and never image/svg+xml —
      // templateAssets is a public-read bucket, so active markup there would be
      // a JS/phishing host on a Google domain (see isSafeMediaContentType).
      const base = (parsed.file.contentType || "").split(";")[0].trim().toLowerCase();
      if (!isSafeMediaContentType(parsed.file.contentType) || !base.startsWith("image/")) {
        res.status(415).json({ error: "unsupported_content_type" });
        return;
      }

      try {
        // Read the prior pointer BEFORE overwriting, so the superseded object
        // can be swept (best-effort) instead of orphaned in the bucket.
        const snap = await templateAssetsDoc().get();
        const prior = snap.exists
          ? ((snap.data() ?? {})[templateId] as { storagePath?: string } | undefined)
          : undefined;

        const ext = pickExtensionFromFilename(parsed.file.filename, "jpg");
        const path = `${STORAGE_TEMPLATE_ASSETS_PREFIX}/${templateId}/cover_${Date.now()}.${ext}`;
        const url = await uploadAndGetUrl(path, parsed.file.buffer, parsed.file.contentType);
        const updatedAt = Date.now();

        // merge:true — one template's cover must never clobber another's.
        await templateAssetsDoc().set(
          { [templateId]: { url, storagePath: path, updatedAt } },
          { merge: true }
        );

        if (prior?.storagePath && prior.storagePath !== path) {
          await deleteStorageObjectSilently(prior.storagePath);
        }

        await writeAudit(req.caller?.uid ?? "unknown", "templateAssetUploaded", { templateId });
        res.json({ templateId, url, storagePath: path, updatedAt });
      } catch (err) {
        res.status(500).json({ error: "upload_failed", detail: safeDetail(err) });
      }
    }
  );

  // Admin: remove a template's cover (falls back to the bundled art).
  router.delete(
    "/templates/:templateId/asset",
    requireAuth,
    requireAdmin,
    uidRateLimit("templateAssetWrite", RATE.TEMPLATE_ASSET_WRITE_PER_ADMIN.limit, HOUR_MS),
    async (req: AuthRequest, res: Response) => {
      const templateId = req.params.templateId;
      if (!TEMPLATE_IDS.has(templateId)) {
        res.status(400).json({ error: "invalid_template_id" });
        return;
      }
      try {
        const snap = await templateAssetsDoc().get();
        const prior = snap.exists
          ? ((snap.data() ?? {})[templateId] as { storagePath?: string } | undefined)
          : undefined;
        if (!prior) {
          res.json({ ok: true, removed: false });
          return;
        }
        await templateAssetsDoc().set({ [templateId]: FieldValue.delete() }, { merge: true });
        if (prior.storagePath) await deleteStorageObjectSilently(prior.storagePath);
        await writeAudit(req.caller?.uid ?? "unknown", "templateAssetRemoved", { templateId });
        res.json({ ok: true, removed: true });
      } catch (err) {
        res.status(500).json({ error: "delete_failed", detail: safeDetail(err) });
      }
    }
  );
}
