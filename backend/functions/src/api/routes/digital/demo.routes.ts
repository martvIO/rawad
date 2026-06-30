import { Router, Request, Response } from "express";
import { AuthRequest, requireAuth, requireAdmin } from "../../middleware/auth";
import { DEMO_UID, DEMO_DESIGN_ID } from "./constants";
import { demoDesignDoc, demoConfigDoc } from "./firestore";
import { projectPublicDoc, safeDetail } from "./project";

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN-EDITABLE PUBLIC DEMO
//
// The admin edits a normal design doc under the reserved demo uid via the
// existing per-design routes (admin is authorized for any uid). "Publish to
// demo" snapshots that draft — projected through PUBLIC_DESIGN_FIELDS — into a
// separate config doc that the public demo page reads. The editable draft and
// the published snapshot are decoupled, so editing never changes the live demo
// until the admin publishes.
//
// Mounted with LITERAL `/demo/*` paths BEFORE the `/:uid/*` routes so `demo`
// is never captured as a groomUid.
// ═══════════════════════════════════════════════════════════════════════════
export function registerDemoRoutes(router: Router): void {
  // Admin: ensure the editable demo design doc exists (blank — no seeding).
  router.post(
    "/demo/ensure",
    requireAuth,
    requireAdmin,
    async (_req: AuthRequest, res: Response) => {
      try {
        const ref = demoDesignDoc();
        const snap = await ref.get();
        if (!snap.exists) {
          await ref.set({
            title: { ar: "صفحة العرض", he: "דף הדגמה" },
            designStatus: "draft",
            designVersion: 1,
            order: 0,
            createdAt: Date.now(),
          });
        }
        res.json({ uid: DEMO_UID, designId: DEMO_DESIGN_ID });
      } catch (err) {
        res.status(500).json({ error: "ensure_failed", detail: safeDetail(err) });
      }
    }
  );

  // Admin: snapshot the current draft into the published config doc.
  router.post(
    "/demo/publish",
    requireAuth,
    requireAdmin,
    async (_req: AuthRequest, res: Response) => {
      try {
        const snap = await demoDesignDoc().get();
        if (!snap.exists) {
          res.status(404).json({ error: "no_demo_design" });
          return;
        }
        const projected = projectPublicDoc(snap.data()) ?? {};
        const publishedAt = Date.now();
        // Full replace (merge:false) so a field removed in the draft is dropped
        // from the live demo on the next publish.
        await demoConfigDoc().set({ ...projected, publishedAt });
        res.json({ ok: true, publishedAt });
      } catch (err) {
        res.status(500).json({ error: "publish_failed", detail: safeDetail(err) });
      }
    }
  );

  // Public (no auth): the published demo snapshot, or null when nothing has been
  // published yet (the demo page then falls back to its built-in sample).
  router.get("/demo/public", async (_req: Request, res: Response) => {
    try {
      const snap = await demoConfigDoc().get();
      if (!snap.exists) {
        res.json(null);
        return;
      }
      res.set("Cache-Control", "public, max-age=60");
      res.json(snap.data() ?? null);
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: safeDetail(err) });
    }
  });
}
