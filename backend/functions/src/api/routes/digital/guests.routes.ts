import { Response } from "express";
import { AuthRequest,requireAuth } from "../../middleware/auth";
import { firebaseDigitalGuestStore } from "../../../domain/digital/firebaseDigitalGuestStore";
import { canActOnUid } from "./access";
import { coerceRanks,ilNational,sanitizeDigitalGuestCreate,sanitizeDigitalGuestPatch } from "./sanitize";
import { safeDetail } from "./project";
import { Router } from "express";

/** Upper bound on a single bulk guest-patch request (keeps the body bounded). */
const MAX_BULK_GUEST_UPDATES = 1000;

export function registerGuestsRoutes(router: Router): void {
// ═══════════════════════════════════════════════════════════════════════════════
// GUESTS  —  digitalInvitations/{uid}/guests/{guestId}
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * List a groom's digital guests, sorted by createdAt ASC (legacy order).
 * Authorized for admin or owning groom — mirrors `firestore.rules`.
 */
router.get(
  "/:uid/guests",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      res.json(await firebaseDigitalGuestStore().list(req.params.uid));
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Add a guest. Body: `{ name, phone, ranks? }` where `ranks` is an array
 * of zero-or-more rank strings (each must already exist in the parent
 * doc's `guestRanks`; the server does not enforce that — it accepts any
 * string ≤ MAX_GUEST_RANK_LEN and dedupes). Legacy single `rank: string`
 * is still accepted and folded into `[rank]`. Always seeds status="pending"
 * and createdAt=now. Returns `{ id, ...record }` so the client can render
 * the row immediately without a round-trip.
 */
router.post(
  "/:uid/guests",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const sanitized = sanitizeDigitalGuestCreate(req.body);
    if (!sanitized.ok) {
      res.status(400).json({ error: sanitized.error, field: sanitized.field });
      return;
    }
    try {
      // Block a duplicate phone within THIS groom's digital guest list. The
      // scan-then-add runs in one Firestore transaction inside the store, so two
      // concurrent submits with the same phone can't both pass the check (the
      // legacy read-then-add could). sanitize guarantees a normalisable phone,
      // so newNat is non-null here.
      const newNat = ilNational(sanitized.value.phone);
      const record = {
        ...sanitized.value,
        status: "pending",
        createdAt: Date.now(),
      };
      const result = await firebaseDigitalGuestStore().create(
        req.params.uid,
        record,
        {
          key: newNat ?? "",
          keyOf: (g) => ilNational(((g.phone ?? "") as unknown as string).toString()),
        }
      );
      if (!result.ok) {
        res.status(409).json({ error: "duplicate_phone", field: "phone" });
        return;
      }
      res.json({ id: result.id, ...record });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Patch a guest. Allowed fields: name, phone, ranks, status, note. Unknown
 * keys are dropped. Status is restricted to the same 3 values the UI cycles.
 * `ranks` always replaces (pass `[]` to clear). Legacy `rank: string` is
 * also accepted and folded into `ranks: [rank]`.
 */
router.patch(
  "/:uid/guests/:id",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const sanitized = sanitizeDigitalGuestPatch(req.body);
    if (!sanitized.ok) {
      res.status(400).json({ error: sanitized.error, field: sanitized.field });
      return;
    }
    if (Object.keys(sanitized.value).length === 0) {
      res.status(400).json({ error: "empty_patch" });
      return;
    }
    try {
      await firebaseDigitalGuestStore().patch(
        req.params.uid,
        req.params.id,
        sanitized.value as Record<string, unknown>
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Bulk-patch guests in ONE request → ONE Firestore batch (chunked at 500 inside
 * the store), so a bulk role edit doesn't hit the server with N calls. Body:
 * `{ updates: [{ id, ranks }] }` — roles-only; `ranks` REPLACES per guest (the
 * client computes Add vs Replace against each guest's existing ranks). Duplicate
 * ids collapse to the last one. Rejects an empty or oversized batch.
 */
router.patch(
  "/:uid/guests",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const updates = Array.isArray(body.updates) ? body.updates : null;
    if (!updates || updates.length === 0) {
      res.status(400).json({ error: "empty_updates" });
      return;
    }
    if (updates.length > MAX_BULK_GUEST_UPDATES) {
      res.status(400).json({ error: "too_many_updates" });
      return;
    }
    // Dedupe by id (last write wins) and sanitize ranks per row.
    const byId = new Map<string, Record<string, unknown>>();
    for (const raw of updates as unknown[]) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        res.status(400).json({ error: "invalid_update" });
        return;
      }
      const row = raw as Record<string, unknown>;
      const id = (row.id ?? "").toString().trim();
      if (!id) {
        res.status(400).json({ error: "invalid_id", field: "id" });
        return;
      }
      const ranksResult = coerceRanks(row);
      if (!ranksResult.ok) {
        res.status(400).json({ error: ranksResult.error, field: ranksResult.field });
        return;
      }
      if (ranksResult.value === undefined) {
        res.status(400).json({ error: "empty_patch", field: "ranks" });
        return;
      }
      byId.set(id, { ranks: ranksResult.value });
    }
    const clean = [...byId.entries()].map(([id, patch]) => ({ id, patch }));
    try {
      await firebaseDigitalGuestStore().patchMany(req.params.uid, clean);
      res.json({ ok: true, count: clean.length });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: safeDetail(err) });
    }
  }
);

router.delete(
  "/:uid/guests/:id",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      await firebaseDigitalGuestStore().remove(req.params.uid, req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "delete_failed", detail: safeDetail(err) });
    }
  }
);
}
