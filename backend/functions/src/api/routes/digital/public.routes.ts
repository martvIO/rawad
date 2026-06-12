import { Request,Response } from "express";
import { parentDoc,designDoc,resolveDefaultDesignId } from "./firestore";
import { projectPublicDoc,safeDetail } from "./project";
import { Router } from "express";

export function registerPublicRoutes(router: Router): void {
// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC INVITATION READ  —  /digital/:uid/public
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Unauthenticated read of the projected media doc. Used by the guest-facing
 * `/d/{groomUsername}/{token}` page to render the invitation without
 * sign-in. Returns `null` (HTTP 200) when the doc doesn't exist so the
 * client can decide how to render that case.
 */
router.get(
  ["/:uid/public", "/:uid/designs/:designId/public"],
  async (req: Request, res: Response) => {
    try {
      const uid = req.params.uid;
      // BOTH public paths are approved-only — an unauthenticated caller who
      // knows (or guesses) a groom uid must never read a draft/pending/rejected
      // invitation. Sent links render from the token's immutable designSnapshot,
      // so gating the live fallback to approved status loses no legitimate view
      // (a not-yet-approved default design returns null instead of leaking).
      const designId = (req.params as { designId?: string }).designId;
      const targetId = designId || (await resolveDefaultDesignId(uid));
      const [dSnap, pSnap] = await Promise.all([
        designDoc(uid, targetId).get(),
        parentDoc(uid).get(),
      ]);
      if (!dSnap.exists) {
        res.json(null);
        return;
      }
      const data = dSnap.data();
      if (data?.designStatus !== "approved") {
        res.json(null);
        return;
      }
      const p = pSnap.exists ? (pSnap.data() as Record<string, unknown>) : {};
      res.json({
        ...(projectPublicDoc(data) ?? {}),
        photographerPublished: p.photographerPublished === true,
      });
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: safeDetail(err) });
    }
  }
);

}
