import { Response } from "express";
import { AuthRequest,requireAuth } from "../../middleware/auth";
import { firebaseDigitalWishStore } from "../../../domain/digital/firebaseDigitalWishStore";
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
      res.json(await firebaseDigitalWishStore().list(req.params.uid));
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
      await firebaseDigitalWishStore().setStatus(req.params.uid, req.params.wishId, status);
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
      await firebaseDigitalWishStore().remove(req.params.uid, req.params.wishId);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "delete_failed", detail: safeDetail(err) });
    }
  }
);
}
