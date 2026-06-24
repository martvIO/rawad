import { Response } from "express";
import { AuthRequest,requireAuth } from "../../middleware/auth";
import { MAX_DESIGNS_PER_GROOM,MAX_DESIGN_TITLE_LEN } from "./constants";
import { ensureMigrated } from "./firestore";
import { firebaseDigitalDesignStore } from "../../../domain/digital/firebaseDigitalDesignStore";
import { canActOnUid } from "./access";
import { safeDetail } from "./project";
import { Router } from "express";

export function registerDesignsRoutes(router: Router): void {
// ═══════════════════════════════════════════════════════════════════════════════
// DESIGNS CRUD  —  digitalInvitations/{uid}/designs/{designId}
// ═══════════════════════════════════════════════════════════════════════════════

/** List a groom's designs (lightweight rows for the editor switcher). */
router.get(
  "/:uid/designs",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      const uid = req.params.uid;
      const defaultDesignId = await ensureMigrated(uid);
      const designs = await firebaseDigitalDesignStore().list(uid);
      const rows = designs.map((data) => ({
        id: data.id,
        title: data.title ?? "",
        order: typeof data.order === "number" ? data.order : 0,
        createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
        designStatus: data.designStatus ?? "draft",
        designVersion: data.designVersion ?? 1,
        designRejectionNote: data.designRejectionNote ?? null,
        brideName: data.brideName ?? "",
        groomDisplayName: data.groomDisplayName ?? "",
        themeColor: data.themeColor ?? "gold",
        isDefault: data.id === defaultDesignId,
      }));
      rows.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Create a design — blank, or a duplicate of `copyFromId` (deep-copies fields +
 * media[] entries, reusing the source's storage URLs; resets the state machine
 * to draft). Body: `{ title?, copyFromId? }`. Enforces MAX_DESIGNS_PER_GROOM.
 */
router.post(
  "/:uid/designs",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      const uid = req.params.uid;
      await ensureMigrated(uid);
      const titleRaw = (req.body?.title ?? "").toString().trim().slice(0, MAX_DESIGN_TITLE_LEN);
      const copyFromId = (req.body?.copyFromId ?? "").toString();

      const result = await firebaseDigitalDesignStore().create(uid, {
        title: titleRaw,
        copyFromId: copyFromId || null,
        maxDesigns: MAX_DESIGNS_PER_GROOM,
      });
      if (!result.ok) {
        if (result.reason === "too_many_designs") {
          res.status(409).json({ error: "too_many_designs", max: MAX_DESIGNS_PER_GROOM });
          return;
        }
        res.status(404).json({ error: "source_not_found" });
        return;
      }
      res.json({ id: result.id, ...result.payload });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Delete a design. Refuses the last remaining design. If it was the default,
 * another design is promoted to default. Guests assigned to it are reassigned
 * to the new default. Storage files are left in place (cheap; avoids breaking a
 * duplicate that references the same URLs).
 */
router.delete(
  "/:uid/designs/:designId",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      const uid = req.params.uid;
      const targetId = req.params.designId;
      await ensureMigrated(uid);
      const result = await firebaseDigitalDesignStore().remove(uid, targetId);
      if (!result.ok) {
        if (result.reason === "last_design") {
          res.status(409).json({ error: "last_design" });
          return;
        }
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({
        ok: true,
        defaultDesignId: result.defaultDesignId,
        reassignedGuests: result.reassignedGuests,
      });
    } catch (err) {
      res.status(500).json({ error: "delete_failed", detail: safeDetail(err) });
    }
  }
);

}
