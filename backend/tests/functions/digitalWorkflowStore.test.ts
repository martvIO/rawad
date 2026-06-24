// @vitest-environment node
//
// Pure-logic tests for the digital design-approval domain module
// (domain/digital/workflowStore.ts): the guarded state transitions (run as
// doc-transactions), the admin collectionGroup list, and the admin override. No
// emulator: the Firestore dependency is the in-memory FirestorePort fake, with a
// fixed clock for the stamped timestamps.
import { describe, it, expect } from "vitest";
import { makeDigitalWorkflowStore } from "../../functions/src/domain/digital/workflowStore";
import { inMemoryFirestore } from "./support/inMemoryFirestore";

const DESIGNS_G1 = "digitalInvitations/g1/designs";
const FIXED = 1_700_000_000_000;

const make = (seed = {}) => {
  const { fs, cols } = inMemoryFirestore(seed);
  return { store: makeDigitalWorkflowStore({ fs, now: () => FIXED }), cols };
};
const designAt = (cols: any, id: string) => cols.get(DESIGNS_G1)!.get(id);

describe("makeDigitalWorkflowStore — list", () => {
  it("listDesigns() returns every groom's designs with groomUid (collectionGroup)", async () => {
    const { store } = make({
      "digitalInvitations/g1/designs": { d1: { title: "A" } },
      "digitalInvitations/g2/designs": { d2: { title: "B" } },
    });
    const rows = await store.listDesigns();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => `${r.groomUid}:${r.designId}`).sort()).toEqual([
      "g1:d1",
      "g2:d2",
    ]);
  });
});

describe("makeDigitalWorkflowStore — guarded transitions", () => {
  it("submit() draft → pending_approval, bumps version, stamps submittedAt", async () => {
    const { store, cols } = make({
      [DESIGNS_G1]: { d1: { designStatus: "draft", designVersion: 2 } },
    });
    const res = await store.submit("g1", "d1");
    expect(res).toEqual({ ok: true, version: 3, submittedAt: FIXED });
    expect(designAt(cols, "d1")).toMatchObject({
      designStatus: "pending_approval",
      designSubmittedAt: FIXED,
      designRejectionNote: null,
      designVersion: 3,
    });
  });

  it("submit() is blocked from approved (returns current status, no write)", async () => {
    const { store, cols } = make({
      [DESIGNS_G1]: { d1: { designStatus: "approved", designVersion: 5 } },
    });
    const res = await store.submit("g1", "d1");
    expect(res).toEqual({ ok: false, status: "approved" });
    expect(designAt(cols, "d1").designVersion).toBe(5); // untouched
  });

  it("a second submit is rejected after the first (doc-transaction guard)", async () => {
    const { store } = make({
      [DESIGNS_G1]: { d1: { designStatus: "draft", designVersion: 0 } },
    });
    const first = await store.submit("g1", "d1");
    const second = await store.submit("g1", "d1");
    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, status: "pending_approval" });
  });

  it("cancel() pending_approval → draft; blocked otherwise", async () => {
    const { store, cols } = make({
      [DESIGNS_G1]: { d1: { designStatus: "pending_approval" } },
    });
    expect(await store.cancel("g1", "d1")).toEqual({ ok: true });
    expect(designAt(cols, "d1").designStatus).toBe("draft");
    expect(await store.cancel("g1", "d1")).toEqual({ ok: false, status: "draft" });
  });

  it("approve() pending_approval → approved with approvedAt; blocked from draft", async () => {
    const { store, cols } = make({
      [DESIGNS_G1]: { d1: { designStatus: "pending_approval" } },
    });
    expect(await store.approve("g1", "d1")).toEqual({ ok: true, approvedAt: FIXED });
    expect(designAt(cols, "d1")).toMatchObject({
      designStatus: "approved",
      designApprovedAt: FIXED,
      designRejectionNote: null,
    });
    expect(await store.approve("g1", "d1")).toEqual({ ok: false, status: "approved" });
  });

  it("reject() pending_approval → rejected with the note; blocked from draft", async () => {
    const { store, cols } = make({
      [DESIGNS_G1]: { d1: { designStatus: "pending_approval" } },
    });
    expect(await store.reject("g1", "d1", "fix the date")).toEqual({
      ok: true,
      rejectedAt: FIXED,
    });
    expect(designAt(cols, "d1")).toMatchObject({
      designStatus: "rejected",
      designRejectedAt: FIXED,
      designRejectionNote: "fix the date",
    });
    expect(await store.reject("g1", "d1", "again")).toEqual({
      ok: false,
      status: "rejected",
    });
  });
});

describe("makeDigitalWorkflowStore — admin override (no guard)", () => {
  it("setStatus('approved') stamps approvedAt + clears note from ANY state", async () => {
    const { store, cols } = make({
      [DESIGNS_G1]: { d1: { designStatus: "rejected", designRejectionNote: "old" } },
    });
    await store.setStatus("g1", "d1", "approved", "");
    expect(designAt(cols, "d1")).toMatchObject({
      designStatus: "approved",
      designApprovedAt: FIXED,
      designRejectionNote: null,
    });
  });

  it("setStatus('rejected') stores the note", async () => {
    const { store, cols } = make({ [DESIGNS_G1]: { d1: { designStatus: "approved" } } });
    await store.setStatus("g1", "d1", "rejected", "needs work");
    expect(designAt(cols, "d1")).toMatchObject({
      designStatus: "rejected",
      designRejectedAt: FIXED,
      designRejectionNote: "needs work",
    });
  });

  it("setStatus('draft') clears approvedAt + note", async () => {
    const { store, cols } = make({
      [DESIGNS_G1]: { d1: { designStatus: "approved", designApprovedAt: 1, designRejectionNote: "x" } },
    });
    await store.setStatus("g1", "d1", "draft", "");
    expect(designAt(cols, "d1")).toMatchObject({
      designStatus: "draft",
      designApprovedAt: null,
      designRejectionNote: null,
    });
  });
});
