// @vitest-environment node
//
// Pure-logic tests for the digital-design domain module
// (domain/digital/designStore.ts): the create cap + copy-with-workflow-reset and
// the delete default-promotion + atomic guest-reassignment invariants. No
// emulator: the Firestore dependency is the in-memory FirestorePort fake, with a
// fixed clock for createdAt.
import { describe, it, expect } from "vitest";
import { makeDigitalDesignStore } from "../../functions/src/domain/digital/designStore";
import { inMemoryFirestore } from "./support/inMemoryFirestore";

const DESIGNS = "digitalInvitations/g1/designs";
const GUESTS = "digitalInvitations/g1/guests";
const PARENTS = "digitalInvitations"; // the parent doc g1 lives here
const FIXED = 1_700_000_000_000;

const make = (seed = {}) => {
  const { fs, cols } = inMemoryFirestore(seed);
  return { store: makeDigitalDesignStore({ fs, now: () => FIXED }), cols };
};

describe("makeDigitalDesignStore — create", () => {
  it("creates a blank draft: default title, order, createdAt, bumps parent count", async () => {
    const { store, cols } = make();
    const res = await store.create("g1", { title: "", copyFromId: null, maxDesigns: 8 });
    expect(res).toMatchObject({ ok: true });
    if (!res.ok) return;
    expect(res.payload).toMatchObject({
      title: { ar: "تصميم جديد", he: "עיצוב חדש" },
      order: 0,
      createdAt: FIXED,
      designStatus: "draft",
      designVersion: 1,
    });
    expect(cols.get(DESIGNS)!.size).toBe(1);
    expect(cols.get(PARENTS)!.get("g1")).toMatchObject({ designCount: 1 });
  });

  it("uses the provided title when present", async () => {
    const { store } = make();
    const res = await store.create("g1", { title: "My Design", copyFromId: null, maxDesigns: 8 });
    if (!res.ok) throw new Error("expected ok");
    expect(res.payload.title).toBe("My Design");
  });

  it("enforces the per-groom cap", async () => {
    const { store } = make({
      [DESIGNS]: { a: { order: 0 }, b: { order: 1 } },
    });
    const res = await store.create("g1", { title: "x", copyFromId: null, maxDesigns: 2 });
    expect(res).toEqual({ ok: false, reason: "too_many_designs" });
  });

  it("copies a source design but resets its workflow state", async () => {
    const { store, cols } = make({
      [DESIGNS]: {
        src: {
          order: 0,
          brideName: "Layla",
          themeColor: "rose",
          designStatus: "approved",
          designApprovedAt: 123,
          designRejectedAt: 456,
          designSubmittedAt: 789,
          designRejectionNote: "nope",
        },
      },
    });
    const res = await store.create("g1", { title: "Copy", copyFromId: "src", maxDesigns: 8 });
    if (!res.ok) throw new Error("expected ok");
    expect(res.payload).toMatchObject({
      brideName: "Layla", // copied
      themeColor: "rose", // copied
      title: "Copy",
      order: 1, // appended after the source
      designStatus: "draft", // reset
      designVersion: 1,
      createdAt: FIXED,
    });
    // Workflow timestamps/notes are NOT carried over.
    expect(res.payload.designApprovedAt).toBeUndefined();
    expect(res.payload.designRejectedAt).toBeUndefined();
    expect(res.payload.designSubmittedAt).toBeUndefined();
    expect(res.payload.designRejectionNote).toBeUndefined();
    expect(cols.get(DESIGNS)!.size).toBe(2);
  });

  it("404s when the copy source is missing", async () => {
    const { store } = make({ [DESIGNS]: { a: { order: 0 } } });
    const res = await store.create("g1", { title: "x", copyFromId: "ghost", maxDesigns: 8 });
    expect(res).toEqual({ ok: false, reason: "source_not_found" });
  });
});

describe("makeDigitalDesignStore — remove", () => {
  const seed = () => ({
    [PARENTS]: { g1: { defaultDesignId: "d1", designCount: 2 } },
    [DESIGNS]: { d1: { order: 0, title: "A" }, d2: { order: 1, title: "B" } },
    [GUESTS]: {
      gu1: { name: "X", designId: "d1" },
      gu2: { name: "Y", designId: "d2" },
    },
  });

  it("refuses to delete the last design", async () => {
    const { store } = make({ [DESIGNS]: { only: { order: 0 } } });
    expect(await store.remove("g1", "only")).toEqual({ ok: false, reason: "last_design" });
  });

  it("404s an unknown design", async () => {
    const { store } = make(seed());
    expect(await store.remove("g1", "ghost")).toEqual({ ok: false, reason: "not_found" });
  });

  it("deleting the DEFAULT promotes another and reassigns its guests atomically", async () => {
    const { store, cols } = make(seed());
    const res = await store.remove("g1", "d1");
    expect(res).toEqual({ ok: true, defaultDesignId: "d2", reassignedGuests: 1 });
    expect(cols.get(DESIGNS)!.has("d1")).toBe(false); // deleted
    expect(cols.get(GUESTS)!.get("gu1")!.designId).toBe("d2"); // reassigned
    expect(cols.get(GUESTS)!.get("gu2")!.designId).toBe("d2"); // untouched
    expect(cols.get(PARENTS)!.get("g1")).toMatchObject({
      defaultDesignId: "d2",
      designCount: 1,
    });
  });

  it("deleting a NON-default leaves the default and reassigns only its guests", async () => {
    const { store, cols } = make(seed());
    const res = await store.remove("g1", "d2");
    expect(res).toEqual({ ok: true, defaultDesignId: "d1", reassignedGuests: 1 });
    expect(cols.get(DESIGNS)!.has("d2")).toBe(false);
    expect(cols.get(GUESTS)!.get("gu2")!.designId).toBe("d1");
    expect(cols.get(GUESTS)!.get("gu1")!.designId).toBe("d1"); // untouched
    expect(cols.get(PARENTS)!.get("g1")).toMatchObject({
      defaultDesignId: "d1",
      designCount: 1,
    });
  });
});
