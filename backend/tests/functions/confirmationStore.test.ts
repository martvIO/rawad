// @vitest-environment node
//
// Pure-logic tests for the confirmation domain module
// (domain/confirmations/confirmationStore.ts). No emulator: the RTDB dependency
// is an in-memory fake injected through the narrow DbPort (the second adapter).
// Mirrors tests/functions/guestStore.test.ts.
import { describe, it, expect } from "vitest";
import { makeConfirmationStore } from "../../functions/src/domain/confirmations/confirmationStore";

// ─── In-memory DbPort fake (tree-backed, same shape as guestStore.test.ts) ────
function getAt(tree: any, path: string) {
  let node = tree;
  for (const k of path.split("/")) {
    if (node === null || node === undefined || typeof node !== "object") return null;
    node = node[k];
  }
  return node === undefined ? null : node;
}
function setAt(tree: any, path: string, value: unknown) {
  const parts = path.split("/");
  const last = parts.pop()!;
  let node = tree;
  for (const k of parts) {
    if (typeof node[k] !== "object" || node[k] === null) node[k] = {};
    node = node[k];
  }
  if (value === null) delete node[last];
  else node[last] = value;
}
function makeStore(seed: any = {}) {
  const tree = structuredClone(seed);
  const db = {
    async get(path: string) {
      return getAt(tree, path);
    },
    async update(updates: Record<string, unknown>) {
      for (const [p, v] of Object.entries(updates)) setAt(tree, p, v);
    },
    async set(path: string, value: unknown) {
      setAt(tree, path, value);
    },
    async remove(path: string) {
      setAt(tree, path, null);
    },
  };
  let n = 0;
  return { store: makeConfirmationStore({ db, newId: () => `c${++n}` }), tree };
}

describe("makeConfirmationStore (confirmation domain module)", () => {
  it("create() persists under a fresh id and round-trips via get()", async () => {
    const { store, tree } = makeStore();
    const created = await store.create({
      groomUid: "groom-1",
      submittedName: "Layla Khoury",
      confirmedAt: 111,
    });
    expect(created).toEqual({
      id: "c1",
      groomUid: "groom-1",
      submittedName: "Layla Khoury",
      confirmedAt: 111,
    });
    // The persisted node carries the field bag WITHOUT the synthetic id.
    expect(getAt(tree, "confirmations/c1")).toEqual({
      groomUid: "groom-1",
      submittedName: "Layla Khoury",
      confirmedAt: 111,
    });
    expect(await store.get("c1")).toEqual(created);
  });

  it("get() returns null for an absent confirmation", async () => {
    const { store } = makeStore();
    expect(await store.get("missing")).toBeNull();
  });

  it("listAll() returns [] when /confirmations is absent (not an error)", async () => {
    const { store } = makeStore();
    expect(await store.listAll()).toEqual([]);
  });

  it("listAll() flattens every record with its id stamped", async () => {
    const { store } = makeStore({
      confirmations: {
        a: { groomUid: "g1", submittedName: "A B" },
        b: { groomUid: "g2", submittedName: "C D" },
      },
    });
    const all = await store.listAll();
    expect(all).toHaveLength(2);
    expect(all.map((c) => c.id).sort()).toEqual(["a", "b"]);
    expect(all.find((c) => c.id === "a")!.groomUid).toBe("g1");
  });

  it("patch() shallow-merges — unspecified siblings survive", async () => {
    const { store, tree } = makeStore({
      confirmations: {
        a: { groomUid: "g1", submittedName: "A B", confirmedAt: 1 },
      },
    });
    await store.patch("a", { attachedGuestId: "guest-9" });
    expect(getAt(tree, "confirmations/a")).toEqual({
      groomUid: "g1",
      submittedName: "A B",
      confirmedAt: 1,
      attachedGuestId: "guest-9",
    });
  });
});
