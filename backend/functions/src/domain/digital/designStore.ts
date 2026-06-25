// Digital-design domain module — the deep interface over the Firestore
// `digitalInvitations/{uid}/designs` subcollection plus the parent doc's
// design pointers (defaultDesignId / designCount).
//
// It owns the design-lifecycle INVARIANTS the route used to inline:
//   - create: enforce the per-groom cap, deep-copy a source design while resetting
//     its workflow state, stamp order/createdAt/draft, and bump the parent count.
//   - delete: refuse the last design; if the deleted one was the default, promote
//     another; reassign that design's guests to the new default and delete the
//     design in ONE atomic batch; then fix the parent's default + count.
//
// Lazy v1→v2 migration (ensureMigrated) stays in the route as a pre-step — it is
// an orthogonal data-migration concern, not part of the CRUD contract. `now` is
// injected (Clock) and `maxDesigns` is passed by the caller so the domain owns no
// route constants. Unit-testable with the in-memory FirestorePort fake.

import { FirestorePort, FsBatchOp } from "../ports";

const ROOT = "digitalInvitations";
const DESIGNS = "designs";
const GUESTS = "guests";
const designsPath = (uid: string) => `${ROOT}/${uid}/${DESIGNS}`;
const designDocPath = (uid: string, id: string) => `${designsPath(uid)}/${id}`;
const guestsPath = (uid: string) => `${ROOT}/${uid}/${GUESTS}`;
const parentPath = (uid: string) => `${ROOT}/${uid}`;

export interface DigitalDesignRecord extends Record<string, unknown> {
  id: string;
}

export type CreateDesignResult =
  | { ok: true; id: string; payload: Record<string, unknown> }
  | { ok: false; reason: "too_many_designs" | "source_not_found" };

export type DeleteDesignResult =
  | { ok: true; defaultDesignId: string | null; reassignedGuests: number }
  | { ok: false; reason: "last_design" | "not_found" };

export interface DigitalDesignStore {
  /** Raw design docs ({ id, ...fields }); the route projects + sorts for the API. */
  list(uid: string): Promise<DigitalDesignRecord[]>;
  create(
    uid: string,
    opts: { title: string; copyFromId: string | null; maxDesigns: number },
  ): Promise<CreateDesignResult>;
  remove(uid: string, targetId: string): Promise<DeleteDesignResult>;
}

export function makeDigitalDesignStore(deps: {
  fs: FirestorePort;
  now: () => number;
}): DigitalDesignStore {
  const { fs, now } = deps;
  return {
    async list(uid) {
      const docs = await fs.list(designsPath(uid));
      return docs.map((d) => ({ id: d.id, ...d.data }));
    },

    async create(uid, { title, copyFromId, maxDesigns }) {
      const existing = await fs.list(designsPath(uid));
      if (existing.length >= maxDesigns) {
        return { ok: false, reason: "too_many_designs" };
      }

      let payload: Record<string, unknown> = {};
      if (copyFromId) {
        const src = await fs.get(designDocPath(uid, copyFromId));
        if (!src) return { ok: false, reason: "source_not_found" };
        // Deep-copy fields + media URLs, but reset the approval state machine.
        payload = { ...src.data };
        delete payload.designApprovedAt;
        delete payload.designRejectedAt;
        delete payload.designSubmittedAt;
        delete payload.designRejectionNote;
      }
      payload.title =
        title || payload.title || { ar: "تصميم جديد", he: "עיצוב חדש" };
      payload.order = existing.length;
      payload.createdAt = now();
      payload.designStatus = "draft";
      payload.designVersion = 1;

      const id = await fs.add(designsPath(uid), payload);
      await fs.setMerge(parentPath(uid), { designCount: existing.length + 1 });
      return { ok: true, id, payload };
    },

    async remove(uid, targetId) {
      const all = await fs.list(designsPath(uid));
      if (all.length <= 1) return { ok: false, reason: "last_design" };
      if (!all.some((d) => d.id === targetId)) {
        return { ok: false, reason: "not_found" };
      }

      const parent = await fs.get(parentPath(uid));
      const currentDefault =
        (parent?.data.defaultDesignId as string | undefined) ?? null;
      let newDefault = currentDefault;
      if (currentDefault === targetId) {
        const other = all.find((d) => d.id !== targetId);
        newDefault = other ? other.id : null;
      }

      // Reassign this design's guests to the new default AND delete the design in
      // a single atomic batch (was a Firestore WriteBatch in the route).
      const affected = await fs.findByField(
        guestsPath(uid),
        "designId",
        targetId,
      );
      const ops: FsBatchOp[] = affected.map((g) => ({
        type: "update",
        docPath: `${guestsPath(uid)}/${g.id}`,
        patch: { designId: newDefault },
      }));
      ops.push({ type: "delete", docPath: designDocPath(uid, targetId) });
      await fs.batchWrite(ops);

      await fs.setMerge(parentPath(uid), {
        defaultDesignId: newDefault,
        designCount: all.length - 1,
      });
      return {
        ok: true,
        defaultDesignId: newDefault,
        reassignedGuests: affected.length,
      };
    },
  };
}
