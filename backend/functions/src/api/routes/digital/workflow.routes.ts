import { getFirestore } from "firebase-admin/firestore";
import { Response } from "express";
import { AuthRequest,requireAuth,requireAdmin } from "../../middleware/auth";
import { COLL_DESIGNS,MAX_REJECT_NOTE_LEN } from "./constants";
import { fs,designDoc,resolveDesignId } from "./firestore";
import { canActOnUid } from "./access";
import { safeDetail } from "./project";
import { Router } from "express";

export function registerWorkflowRoutes(router: Router): void {
// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN APPROVAL STATE MACHINE  —  fields on digitalInvitations/{uid}
// ═══════════════════════════════════════════════════════════════════════════════
//
// designStatus transitions:
//   draft | rejected      → POST /design/submit  → pending_approval
//   pending_approval      → POST /design/cancel  → draft  (groom)
//   pending_approval      → POST /design/approve → approved (admin)
//   pending_approval      → POST /design/reject  → rejected (admin)
//   approved              → any design-field edit → draft (handled in PATCH
//                                                  /media/settings + media
//                                                  upload + delete-item)
//
// Already-distributed invite tokens carry a designSnapshot embedded at mint
// time, so demoting back to draft never alters the invitation that a guest
// already opened.

/**
 * Admin-only: list every groom's invitation doc with their current design
 * status + the fields the admin needs to render the review grid. Mounted
 * BEFORE /:uid/* so the literal path isn't captured as a groomUid.
 */
router.get(
  "/design-list",
  requireAuth,
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      const snap = await getFirestore().collectionGroup(COLL_DESIGNS).get();
      const rows = snap.docs.map((d) => {
        const data = d.data() || {};
        const groomUid = d.ref.parent.parent?.id ?? "";
        return {
          groomUid,
          designId: d.id,
          title: data.title ?? "",
          order: typeof data.order === "number" ? data.order : 0,
          brideName: data.brideName ?? "",
          groomDisplayName: data.groomDisplayName ?? "",
          weddingDate: data.weddingDate ?? null,
          venue: data.venue ?? "",
          venueAddress: data.venueAddress ?? "",
          customMessage: data.customMessage ?? "",
          themeColor: data.themeColor ?? "gold",
          fontFamily: data.fontFamily ?? "amiri",
          story: data.story ?? "",
          events: Array.isArray(data.events) ? data.events : [],
          giftIban: data.giftIban ?? "",
          giftNote: data.giftNote ?? "",
          musicUrl: data.musicUrl ?? "",
          storyEnabled: data.storyEnabled ?? true,
          eventsEnabled: data.eventsEnabled ?? true,
          countdownEnabled: data.countdownEnabled ?? true,
          galleryEnabled: data.galleryEnabled ?? true,
          giftEnabled: data.giftEnabled ?? true,
          musicEnabled: data.musicEnabled ?? true,
          footerDockEnabled: data.footerDockEnabled ?? true,
          eyebrow: data.eyebrow ?? "",
          monogram: data.monogram ?? "",
          venueCity: data.venueCity ?? "",
          accessNote: data.accessNote ?? "",
          dressCode: data.dressCode ?? "",
          storyTimeline: Array.isArray(data.storyTimeline) ? data.storyTimeline : [],
          details: Array.isArray(data.details) ? data.details : [],
          hotels: Array.isArray(data.hotels) ? data.hotels : [],
          wishes: Array.isArray(data.wishes) ? data.wishes : [],
          mealOptions: Array.isArray(data.mealOptions) ? data.mealOptions : [],
          mediaCaptions: data.mediaCaptions ?? {},
          detailsEnabled: data.detailsEnabled ?? true,
          venueEnabled: data.venueEnabled ?? true,
          guestbookEnabled: data.guestbookEnabled ?? true,
          envelopeEnabled: data.envelopeEnabled ?? true,
          rsvpCompanionsEnabled: data.rsvpCompanionsEnabled ?? true,
          rsvpMealEnabled: data.rsvpMealEnabled ?? true,
          rsvpSongEnabled: data.rsvpSongEnabled ?? true,
          media: Array.isArray(data.media) ? data.media : [],
          heroMedia: Array.isArray(data.heroMedia) ? data.heroMedia : [],
          heroMediaEnabled: data.heroMediaEnabled ?? true,
          designStatus: data.designStatus ?? "draft",
          designSubmittedAt: data.designSubmittedAt ?? null,
          designApprovedAt: data.designApprovedAt ?? null,
          designRejectedAt: data.designRejectedAt ?? null,
          designRejectionNote: data.designRejectionNote ?? null,
          designVersion: data.designVersion ?? 1,
        };
      });
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Groom submits design for admin approval. Allowed only from draft|rejected.
 * Increments designVersion, clears any rejection note, stamps designSubmittedAt.
 */
router.post(
  ["/:uid/design/submit", "/:uid/designs/:designId/design/submit"],
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      const docRef = designDoc(req.params.uid, await resolveDesignId(req));
      const result = await fs().runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        const data = snap.exists ? snap.data() : null;
        const status = (data?.designStatus ?? "draft") as string;
        if (status !== "draft" && status !== "rejected") {
          return { ok: false as const, error: "invalid_state", status };
        }
        const version = Number(data?.designVersion ?? 0) + 1;
        const now = Date.now();
        tx.set(
          docRef,
          {
            designStatus: "pending_approval",
            designSubmittedAt: now,
            designRejectionNote: null,
            designVersion: version,
          },
          { merge: true }
        );
        return { ok: true as const, version, submittedAt: now };
      });
      if (!result.ok) {
        res.status(409).json({ error: result.error, currentStatus: result.status });
        return;
      }
      res.json({ ok: true, designVersion: result.version, designSubmittedAt: result.submittedAt });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Groom cancels a pending submission, dropping back to draft so they can
 * keep editing without admin intervention.
 */
router.post(
  ["/:uid/design/cancel", "/:uid/designs/:designId/design/cancel"],
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      const docRef = designDoc(req.params.uid, await resolveDesignId(req));
      const result = await fs().runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        const data = snap.exists ? snap.data() : null;
        const status = (data?.designStatus ?? "draft") as string;
        if (status !== "pending_approval") {
          return { ok: false as const, error: "invalid_state", status };
        }
        tx.set(docRef, { designStatus: "draft" }, { merge: true });
        return { ok: true as const };
      });
      if (!result.ok) {
        res.status(409).json({ error: result.error, currentStatus: result.status });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Admin approves a pending design. Stamps designApprovedAt and clears the
 * rejection note (in case the groom resubmitted after a prior rejection).
 */
router.post(
  ["/:uid/design/approve", "/:uid/designs/:designId/design/approve"],
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const docRef = designDoc(req.params.uid, await resolveDesignId(req));
      const result = await fs().runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        const data = snap.exists ? snap.data() : null;
        const status = (data?.designStatus ?? "draft") as string;
        if (status !== "pending_approval") {
          return { ok: false as const, error: "invalid_state", status };
        }
        const now = Date.now();
        tx.set(
          docRef,
          {
            designStatus: "approved",
            designApprovedAt: now,
            designRejectionNote: null,
          },
          { merge: true }
        );
        return { ok: true as const, approvedAt: now };
      });
      if (!result.ok) {
        res.status(409).json({ error: result.error, currentStatus: result.status });
        return;
      }
      res.json({ ok: true, designApprovedAt: result.approvedAt });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Admin rejects a pending design with an explanatory note the groom will
 * see in their Design tab. Body: `{ note: string }`.
 */
router.post(
  ["/:uid/design/reject", "/:uid/designs/:designId/design/reject"],
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const note = (req.body?.note ?? "").toString().trim();
    if (!note) {
      res.status(400).json({ error: "missing_note", field: "note" });
      return;
    }
    if (note.length > MAX_REJECT_NOTE_LEN) {
      res.status(400).json({ error: "note_too_long", field: "note" });
      return;
    }
    try {
      const docRef = designDoc(req.params.uid, await resolveDesignId(req));
      const result = await fs().runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        const data = snap.exists ? snap.data() : null;
        const status = (data?.designStatus ?? "draft") as string;
        if (status !== "pending_approval") {
          return { ok: false as const, error: "invalid_state", status };
        }
        const now = Date.now();
        tx.set(
          docRef,
          {
            designStatus: "rejected",
            designRejectedAt: now,
            designRejectionNote: note,
          },
          { merge: true }
        );
        return { ok: true as const, rejectedAt: now };
      });
      if (!result.ok) {
        res.status(409).json({ error: result.error, currentStatus: result.status });
        return;
      }
      res.json({ ok: true, designRejectedAt: result.rejectedAt });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Admin override: set a design to ANY of approved | draft | rejected, from any
 * current state (no state-machine guard). Powers the admin's manual status
 * switcher. Body: `{ status, note? }` (note only used for rejected).
 */
router.post(
  "/:uid/designs/:designId/design/set-status",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const status = (req.body?.status ?? "").toString();
    if (status !== "approved" && status !== "draft" && status !== "rejected") {
      res.status(400).json({ error: "invalid_status", field: "status" });
      return;
    }
    const note = (req.body?.note ?? "").toString().trim().slice(0, MAX_REJECT_NOTE_LEN);
    try {
      const docRef = designDoc(req.params.uid, req.params.designId);
      const now = Date.now();
      const update: Record<string, unknown> = { designStatus: status };
      if (status === "approved") {
        update.designApprovedAt = now;
        update.designRejectionNote = null;
      } else if (status === "rejected") {
        update.designRejectedAt = now;
        update.designRejectionNote = note || null;
      } else {
        // draft — back to the groom for editing
        update.designApprovedAt = null;
        update.designRejectionNote = null;
      }
      await docRef.set(update, { merge: true });
      res.json({ ok: true, designStatus: status });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: safeDetail(err) });
    }
  }
);

}
