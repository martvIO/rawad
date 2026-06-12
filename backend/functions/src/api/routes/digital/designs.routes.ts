import { Response } from "express";
import { AuthRequest,requireAuth } from "../../middleware/auth";
import { MAX_DESIGNS_PER_GROOM,MAX_DESIGN_TITLE_LEN } from "./constants";
import { fs,parentDoc,designsCol,designDoc,ensureMigrated,guestsCol } from "./firestore";
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
      const snap = await designsCol(uid).get();
      const rows = snap.docs.map((d) => {
        const data = d.data() || {};
        return {
          id: d.id,
          title: data.title ?? "",
          order: typeof data.order === "number" ? data.order : 0,
          createdAt: data.createdAt ?? 0,
          designStatus: data.designStatus ?? "draft",
          designVersion: data.designVersion ?? 1,
          designRejectionNote: data.designRejectionNote ?? null,
          brideName: data.brideName ?? "",
          groomDisplayName: data.groomDisplayName ?? "",
          themeColor: data.themeColor ?? "gold",
          isDefault: d.id === defaultDesignId,
        };
      });
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
      const existing = await designsCol(uid).get();
      if (existing.size >= MAX_DESIGNS_PER_GROOM) {
        res.status(409).json({ error: "too_many_designs", max: MAX_DESIGNS_PER_GROOM });
        return;
      }
      const titleRaw = (req.body?.title ?? "").toString().trim().slice(0, MAX_DESIGN_TITLE_LEN);
      const copyFromId = (req.body?.copyFromId ?? "").toString();

      let payload: Record<string, unknown> = {};
      if (copyFromId) {
        const src = await designDoc(uid, copyFromId).get();
        if (!src.exists) {
          res.status(404).json({ error: "source_not_found" });
          return;
        }
        payload = { ...(src.data() as Record<string, unknown>) };
        delete payload.designApprovedAt;
        delete payload.designRejectedAt;
        delete payload.designSubmittedAt;
        delete payload.designRejectionNote;
      }
      payload.title = titleRaw || payload.title || { ar: "تصميم جديد", he: "עיצוב חדש" };
      payload.order = existing.size;
      payload.createdAt = Date.now();
      payload.designStatus = "draft";
      payload.designVersion = 1;

      const ref = await designsCol(uid).add(payload);
      await parentDoc(uid).set({ designCount: existing.size + 1 }, { merge: true });
      res.json({ id: ref.id, ...payload });
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
      const all = await designsCol(uid).get();
      if (all.size <= 1) {
        res.status(409).json({ error: "last_design" });
        return;
      }
      if (!all.docs.some((d) => d.id === targetId)) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const pSnap = await parentDoc(uid).get();
      const currentDefault = pSnap.exists ? (pSnap.data()?.defaultDesignId as string) : null;
      let newDefault = currentDefault;
      if (currentDefault === targetId) {
        const other = all.docs.find((d) => d.id !== targetId);
        newDefault = other ? other.id : null;
      }

      const affected = await guestsCol(uid).where("designId", "==", targetId).get();
      const batch = fs().batch();
      affected.docs.forEach((g) => batch.update(g.ref, { designId: newDefault }));
      batch.delete(designDoc(uid, targetId));
      await batch.commit();

      await parentDoc(uid).set(
        { defaultDesignId: newDefault, designCount: all.size - 1 },
        { merge: true }
      );
      res.json({ ok: true, defaultDesignId: newDefault, reassignedGuests: affected.size });
    } catch (err) {
      res.status(500).json({ error: "delete_failed", detail: safeDetail(err) });
    }
  }
);

}
