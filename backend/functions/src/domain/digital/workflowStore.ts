// Digital design-approval domain module — the deep interface over the design
// doc's workflow fields (designStatus and its timestamps) plus the admin's
// cross-groom design-list (a Firestore collectionGroup read).
//
// It owns the state machine. The guarded transitions (submit/cancel/approve/
// reject) each run as a doc-level transaction (FirestorePort.transactDoc): read
// the current designStatus, allow the transition only from the legal prior
// state, and either write the next state or abort with the current status — so
// two concurrent transitions can't both win. set-status is the admin override
// (no guard). The route keeps authorization, designId resolution (the
// ensureMigrated pre-step), note validation, and the ~40-field list projection.
//
// `now` is injected (Clock) so the stamped timestamps are deterministic under
// test. Unit-testable with the in-memory FirestorePort fake.

import { FirestorePort } from "../ports";

const ROOT = "digitalInvitations";
const DESIGNS = "designs"; // mirrors COLL_DESIGNS in digital/constants.ts
const designDocPath = (uid: string, designId: string) =>
  `${ROOT}/${uid}/${DESIGNS}/${designId}`;

/** Result of a guarded transition: ok (+stamps) or a state-machine rejection. */
type Ok<T> = { ok: true } & T;
type Blocked = { ok: false; status: string };
export type SubmitResult = Ok<{ version: number; submittedAt: number }> | Blocked;
export type CancelResult = Ok<unknown> | Blocked;
export type ApproveResult = Ok<{ approvedAt: number }> | Blocked;
export type RejectResult = Ok<{ rejectedAt: number }> | Blocked;

export type OverrideStatus = "approved" | "draft" | "rejected";

export interface DesignListRow {
  groomUid: string;
  designId: string;
  data: Record<string, unknown>;
}

export interface DigitalWorkflowStore {
  /** Every design across all grooms (admin review grid); route does projection. */
  listDesigns(): Promise<DesignListRow[]>;
  submit(uid: string, designId: string): Promise<SubmitResult>;
  cancel(uid: string, designId: string): Promise<CancelResult>;
  approve(uid: string, designId: string): Promise<ApproveResult>;
  reject(uid: string, designId: string, note: string): Promise<RejectResult>;
  setStatus(
    uid: string,
    designId: string,
    status: OverrideStatus,
    note: string,
  ): Promise<void>;
}

const statusOf = (cur: { data: Record<string, unknown> } | null): string =>
  (cur?.data.designStatus ?? "draft") as string;

export function makeDigitalWorkflowStore(deps: {
  fs: FirestorePort;
  now: () => number;
}): DigitalWorkflowStore {
  const { fs, now } = deps;
  return {
    async listDesigns() {
      const docs = await fs.listGroup(DESIGNS);
      return docs.map((d) => ({
        groomUid: d.parentId,
        designId: d.id,
        data: d.data,
      }));
    },

    async submit(uid, designId) {
      return fs.transactDoc<SubmitResult>(designDocPath(uid, designId), (cur) => {
        const status = statusOf(cur);
        if (status !== "draft" && status !== "rejected") {
          return { abort: true, result: { ok: false, status } };
        }
        const version = Number(cur?.data.designVersion ?? 0) + 1;
        const submittedAt = now();
        return {
          write: {
            designStatus: "pending_approval",
            designSubmittedAt: submittedAt,
            designRejectionNote: null,
            designVersion: version,
          },
          result: { ok: true, version, submittedAt },
        };
      });
    },

    async cancel(uid, designId) {
      return fs.transactDoc<CancelResult>(designDocPath(uid, designId), (cur) => {
        const status = statusOf(cur);
        if (status !== "pending_approval") {
          return { abort: true, result: { ok: false, status } };
        }
        return { write: { designStatus: "draft" }, result: { ok: true } };
      });
    },

    async approve(uid, designId) {
      return fs.transactDoc<ApproveResult>(designDocPath(uid, designId), (cur) => {
        const status = statusOf(cur);
        if (status !== "pending_approval") {
          return { abort: true, result: { ok: false, status } };
        }
        const approvedAt = now();
        return {
          write: {
            designStatus: "approved",
            designApprovedAt: approvedAt,
            designRejectionNote: null,
          },
          result: { ok: true, approvedAt },
        };
      });
    },

    async reject(uid, designId, note) {
      return fs.transactDoc<RejectResult>(designDocPath(uid, designId), (cur) => {
        const status = statusOf(cur);
        if (status !== "pending_approval") {
          return { abort: true, result: { ok: false, status } };
        }
        const rejectedAt = now();
        return {
          write: {
            designStatus: "rejected",
            designRejectedAt: rejectedAt,
            designRejectionNote: note,
          },
          result: { ok: true, rejectedAt },
        };
      });
    },

    async setStatus(uid, designId, status, note) {
      const stampedNow = now();
      const update: Record<string, unknown> = { designStatus: status };
      if (status === "approved") {
        update.designApprovedAt = stampedNow;
        update.designRejectionNote = null;
      } else if (status === "rejected") {
        update.designRejectedAt = stampedNow;
        update.designRejectionNote = note || null;
      } else {
        // draft — back to the groom for editing
        update.designApprovedAt = null;
        update.designRejectionNote = null;
      }
      await fs.setMerge(designDocPath(uid, designId), update);
    },
  };
}
