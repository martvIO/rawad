import { Response } from "express";
import { AuthRequest,requireAuth } from "../../middleware/auth";
import { wishesCol } from "./firestore";
import { canActOnUid } from "./access";
import { safeDetail } from "./project";
import { Router } from "express";

export function registerWishesRoutes(router: Router): void {
// ═══════════════════════════════════════════════════════════════════════════════
// GUESTBOOK WISHES (moderation)  —  digitalInvitations/{uid}/wishes
// ═══════════════════════════════════════════════════════════════════════════════

// List every wish (any status) for the groom's moderation panel.
router.get(
  "/:uid/wishes",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) { res.status(403).json({ error: "forbidden" }); return; }
    try {
      const snap = await wishesCol(req.params.uid).get();
      const wishes = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })
      ) as Array<Record<string, unknown>>;
      wishes.sort((a, b) => (Number(b.submittedAt) || 0) - (Number(a.submittedAt) || 0));
      res.json(wishes);
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: safeDetail(err) });
    }
  }
);

// Approve ("approved") or un-publish ("pending") a wish.
router.patch(
  "/:uid/wishes/:wishId",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) { res.status(403).json({ error: "forbidden" }); return; }
    const status = (req.body?.status ?? "").toString();
    if (status !== "approved" && status !== "pending") { res.status(400).json({ error: "invalid_status" }); return; }
    try {
      await wishesCol(req.params.uid).doc(req.params.wishId).update({
        status, approvedAt: status === "approved" ? Date.now() : null,
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: safeDetail(err) });
    }
  }
);

// Reject / remove a wish.
router.delete(
  "/:uid/wishes/:wishId",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) { res.status(403).json({ error: "forbidden" }); return; }
    try {
      await wishesCol(req.params.uid).doc(req.params.wishId).delete();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "delete_failed", detail: safeDetail(err) });
    }
  }
);
}
