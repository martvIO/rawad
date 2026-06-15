// People-gallery routes — progress, clustering, the approval state machine,
// the admin kill-switch, and cluster curation. All server-mediated; the
// peopleClusters / galleryConfig docs are deny-all in firestore.rules.
//
//   GET   /:uid/index-status              indexing progress (admin/groom)
//   GET   /:uid/cluster-status            clustering job status (admin/groom)
//   POST  /:uid/gallery/recompute         recompute people now (admin/groom)
//   GET   /:uid/gallery                   gallery config (admin/groom)
//   PATCH /:uid/gallery                   edit cover/title/layout (admin/groom)
//   GET   /:uid/gallery/clusters          person tiles for curation (admin/groom)
//   POST  /:uid/gallery/submit            draft|rejected → pending (groom/admin)
//   POST  /:uid/gallery/approve|reject|set-status   admin
//   POST  /:uid/gallery/enabled           kill-switch on/off (admin)
//   POST  /:uid/gallery/clusters/:id/(hide|label|link-phone|remove-photo)  curation
//   POST  /:uid/gallery/clusters/merge    merge two people (admin/groom)
//   GET   /gallery-list                   all galleries for the admin monitor

import { Router, Response } from "express";
import { getFirestore } from "firebase-admin/firestore";
import { AuthRequest, requireAuth, requireAdmin } from "../../middleware/auth";
import { uidRateLimit } from "../../middleware/rateLimit";
import { HOUR_MS } from "../../../constants/time";
import { canActOnUid } from "./access";
import { safeDetail } from "./project";
import { recomputeClusters } from "../../../faceIndex/clusterJob";

const GALLERY_STATUSES = ["draft", "pending_approval", "approved", "rejected"] as const;
type GalleryStatus = (typeof GALLERY_STATUSES)[number];

function fs() {
  return getFirestore();
}
function configRef(uid: string) {
  return fs().doc(`digitalInvitations/${uid}/galleryConfig/config`);
}
function clustersCol(uid: string) {
  return fs().collection(`digitalInvitations/${uid}/peopleClusters`);
}

const DEFAULT_CONFIG = {
  galleryStatus: "draft" as GalleryStatus,
  enabled: false,
  title: null as unknown,
  layout: "grid",
  coverPhoto: null as unknown,
  autoSendOnPublish: false,
  galleryVersion: 1,
  gallerySubmittedAt: null as number | null,
  galleryApprovedAt: null as number | null,
  galleryRejectedAt: null as number | null,
  galleryRejectionNote: null as string | null,
};

async function readConfig(uid: string): Promise<Record<string, unknown>> {
  const snap = await configRef(uid).get();
  return snap.exists ? { ...DEFAULT_CONFIG, ...snap.data() } : { ...DEFAULT_CONFIG };
}

export function registerGalleryRoutes(router: Router): void {
  const ownerOr403 = (req: AuthRequest, res: Response): boolean => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return false;
    }
    return true;
  };

  // ── Progress ────────────────────────────────────────────────────────────
  router.get("/:uid/index-status", requireAuth, async (req: AuthRequest, res: Response) => {
    if (!ownerOr403(req, res)) return;
    const uid = req.params.uid;
    try {
      const [files, faces] = await Promise.all([
        fs().collection(`digitalInvitations/${uid}/photographerFiles`).get(),
        fs().collection(`digitalInvitations/${uid}/photoFaces`).get(),
      ]);
      const images = files.docs.filter((d) => String(d.data().type ?? "").startsWith("image/"));
      const rowsByFile = new Map(faces.docs.map((d) => [d.id, d.data()]));
      let indexed = 0, failed = 0, faceCount = 0;
      for (const img of images) {
        const row = rowsByFile.get(img.id);
        if (!row) continue;
        if (row.status === "ok") { indexed++; faceCount += Number(row.faceCount ?? 0); }
        else if (row.status && row.status !== "ok") failed++;
      }
      res.json({
        totalImages: images.length,
        indexed,
        failed,
        pending: Math.max(0, images.length - indexed - failed),
        faceCount,
      });
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: safeDetail(err) });
    }
  });

  router.get("/:uid/cluster-status", requireAuth, async (req: AuthRequest, res: Response) => {
    if (!ownerOr403(req, res)) return;
    try {
      const snap = await fs().doc(`digitalInvitations/${req.params.uid}/jobStatus/clustering`).get();
      res.json(snap.exists ? snap.data() : { phase: "idle" });
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: safeDetail(err) });
    }
  });

  // ── Clustering ──────────────────────────────────────────────────────────
  router.post(
    "/:uid/gallery/recompute",
    requireAuth,
    uidRateLimit("galleryRecompute", 12, HOUR_MS),
    async (req: AuthRequest, res: Response) => {
      if (!ownerOr403(req, res)) return;
      try {
        const result = await recomputeClusters(req.params.uid);
        res.json({ ok: true, ...result });
      } catch (err) {
        res.status(500).json({ error: "recompute_failed", detail: safeDetail(err) });
      }
    },
  );

  router.get("/:uid/gallery/clusters", requireAuth, async (req: AuthRequest, res: Response) => {
    if (!ownerOr403(req, res)) return;
    try {
      const snap = await clustersCol(req.params.uid).orderBy("photoCount", "desc").get();
      res.json(
        snap.docs.map((d) => {
          const c = d.data();
          return {
            id: d.id,
            rep: { url: c.rep?.url ?? null, box: c.rep?.box ?? null },
            photoCount: c.photoCount ?? 0,
            memberCount: c.memberCount ?? (c.members?.length ?? 0),
            label: c.label ?? null,
            hidden: !!c.hidden,
            linkedPhone: c.linkedPhone ?? null,
            manual: !!c.manual,
          };
        }),
      );
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: safeDetail(err) });
    }
  });

  // ── Gallery config ────────────────────────────────────────────────────────
  router.get("/:uid/gallery", requireAuth, async (req: AuthRequest, res: Response) => {
    if (!ownerOr403(req, res)) return;
    try {
      res.json(await readConfig(req.params.uid));
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: safeDetail(err) });
    }
  });

  router.patch("/:uid/gallery", requireAuth, async (req: AuthRequest, res: Response) => {
    if (!ownerOr403(req, res)) return;
    const uid = req.params.uid;
    const body = req.body ?? {};
    const patch: Record<string, unknown> = {};
    if ("title" in body) patch.title = body.title;
    if ("layout" in body && (body.layout === "grid" || body.layout === "masonry")) patch.layout = body.layout;
    if ("coverPhoto" in body) patch.coverPhoto = body.coverPhoto;
    if ("autoSendOnPublish" in body) patch.autoSendOnPublish = body.autoSendOnPublish === true;
    if (!Object.keys(patch).length) {
      res.status(400).json({ error: "no_fields" });
      return;
    }
    try {
      const cur = await readConfig(uid);
      // Editing an approved gallery sends it back to draft for re-approval.
      if (cur.galleryStatus === "approved") {
        patch.galleryStatus = "draft";
        patch.galleryApprovedAt = null;
      }
      await configRef(uid).set(patch, { merge: true });
      res.json({ ok: true, ...(await readConfig(uid)) });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: safeDetail(err) });
    }
  });

  // ── Approval state machine ─────────────────────────────────────────────────
  router.post("/:uid/gallery/submit", requireAuth, async (req: AuthRequest, res: Response) => {
    if (!ownerOr403(req, res)) return;
    const uid = req.params.uid;
    try {
      const cur = await readConfig(uid);
      if (cur.galleryStatus !== "draft" && cur.galleryStatus !== "rejected") {
        res.status(409).json({ error: "bad_state", status: cur.galleryStatus });
        return;
      }
      await configRef(uid).set(
        {
          galleryStatus: "pending_approval",
          gallerySubmittedAt: Date.now(),
          galleryRejectionNote: null,
          galleryVersion: Number(cur.galleryVersion ?? 1) + 1,
        },
        { merge: true },
      );
      res.json({ ok: true, ...(await readConfig(uid)) });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: safeDetail(err) });
    }
  });

  router.post(
    "/:uid/gallery/set-status",
    requireAuth,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      const uid = req.params.uid;
      const status = String(req.body?.status ?? "");
      const note = typeof req.body?.note === "string" ? req.body.note.slice(0, 500) : null;
      if (!GALLERY_STATUSES.includes(status as GalleryStatus)) {
        res.status(400).json({ error: "bad_status" });
        return;
      }
      try {
        const patch: Record<string, unknown> = { galleryStatus: status };
        if (status === "approved") { patch.galleryApprovedAt = Date.now(); patch.galleryRejectionNote = null; }
        if (status === "rejected") { patch.galleryRejectedAt = Date.now(); patch.galleryRejectionNote = note; }
        await configRef(uid).set(patch, { merge: true });
        res.json({ ok: true, ...(await readConfig(uid)) });
      } catch (err) {
        res.status(500).json({ error: "write_failed", detail: safeDetail(err) });
      }
    },
  );

  router.post("/:uid/gallery/enabled", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await configRef(req.params.uid).set({ enabled: req.body?.enabled === true }, { merge: true });
      res.json({ ok: true, ...(await readConfig(req.params.uid)) });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: safeDetail(err) });
    }
  });

  router.get("/gallery-list", requireAuth, requireAdmin, async (_req: AuthRequest, res: Response) => {
    try {
      const snap = await fs().collectionGroup("galleryConfig").get();
      const rows = snap.docs
        .filter((d) => d.id === "config")
        .map((d) => {
          const uid = d.ref.parent.parent?.id ?? "";
          const c = d.data();
          return {
            uid,
            galleryStatus: c.galleryStatus ?? "draft",
            enabled: !!c.enabled,
            title: c.title ?? null,
            galleryRejectionNote: c.galleryRejectionNote ?? null,
          };
        });
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: safeDetail(err) });
    }
  });

  // ── Curation (sets manual:true so recompute preserves the edit) ────────────
  const curate = (
    path: string,
    apply: (data: Record<string, unknown>, body: Record<string, unknown>) => Record<string, unknown> | null,
  ) =>
    router.post(`/:uid/gallery/clusters/:clusterId/${path}`, requireAuth, async (req: AuthRequest, res: Response) => {
      if (!ownerOr403(req, res)) return;
      try {
        const ref = clustersCol(req.params.uid).doc(req.params.clusterId);
        const snap = await ref.get();
        if (!snap.exists) { res.status(404).json({ error: "cluster_not_found" }); return; }
        const patch = apply(snap.data() ?? {}, req.body ?? {});
        if (!patch) { res.status(400).json({ error: "bad_request" }); return; }
        await ref.set({ ...patch, manual: true, updatedAt: Date.now() }, { merge: true });
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: "write_failed", detail: safeDetail(err) });
      }
    });

  curate("hide", (_d, b) => ({ hidden: b.hidden === true }));
  curate("label", (_d, b) => ({ label: typeof b.label === "string" || (b.label && typeof b.label === "object") ? b.label : null }));
  curate("link-phone", (_d, b) => ({ linkedPhone: typeof b.phone === "string" && b.phone ? b.phone : null }));
  curate("remove-photo", (d, b) => {
    const fileId = String(b.fileId ?? "");
    if (!fileId) return null;
    const members = ((d.members as { fileId?: string }[]) || []).filter((m) => m.fileId !== fileId);
    const photoCount = new Set(members.map((m) => m.fileId)).size;
    return { members, photoCount, memberCount: members.length };
  });

  router.post("/:uid/gallery/clusters/merge", requireAuth, async (req: AuthRequest, res: Response) => {
    if (!ownerOr403(req, res)) return;
    const sourceId = String(req.body?.sourceId ?? "");
    const targetId = String(req.body?.targetId ?? "");
    if (!sourceId || !targetId || sourceId === targetId) {
      res.status(400).json({ error: "bad_request" });
      return;
    }
    try {
      const col = clustersCol(req.params.uid);
      const [src, tgt] = await Promise.all([col.doc(sourceId).get(), col.doc(targetId).get()]);
      if (!src.exists || !tgt.exists) { res.status(404).json({ error: "cluster_not_found" }); return; }
      const merged = [...((tgt.data()?.members as unknown[]) || []), ...((src.data()?.members as unknown[]) || [])];
      const photoCount = new Set(merged.map((m) => (m as { fileId?: string }).fileId)).size;
      await col.doc(targetId).set(
        { members: merged, photoCount, memberCount: merged.length, manual: true, updatedAt: Date.now() },
        { merge: true },
      );
      await col.doc(sourceId).delete();
      res.json({ ok: true, targetId, photoCount });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: safeDetail(err) });
    }
  });
}
