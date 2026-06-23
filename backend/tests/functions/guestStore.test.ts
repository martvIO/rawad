// @vitest-environment node
//
// Pure-logic tests for the guest domain module (domain/guests/guestStore.ts).
// No emulator: the RTDB dependency is an in-memory fake injected through the
// narrow DbPort (the second adapter). Mirrors tests/functions/userStore.test.ts.
import { describe, it, expect } from "vitest";
import { makeGuestStore } from "../../functions/src/domain/guests/guestStore";

// ─── In-memory DbPort fake (tree-backed, same shape as userStore.test.ts) ─────
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
  return { store: makeGuestStore({ db, newId: () => `g${++n}` }), tree };
}

describe("makeGuestStore (guest domain module)", () => {
  it("create() persists under a fresh id and round-trips via get()", async () => {
    const { store, tree } = makeStore();
    const created = await store.create("groom-1", { name: "Layla", status: "pending" });
    expect(created).toEqual({
      id: "g1",
      groomUid: "groom-1",
      name: "Layla",
      status: "pending",
    });
    expect(getAt(tree, "guestsByGroom/groom-1/g1")).toEqual({
      name: "Layla",
      status: "pending",
    });
    expect(await store.get("groom-1", "g1")).toEqual(created);
  });

  it("listByGroom() returns [] for an absent groom (not an error)", async () => {
    const { store } = makeStore();
    expect(await store.listByGroom("nobody")).toEqual([]);
  });

  it("get() returns null for an absent guest", async () => {
    const { store } = makeStore();
    expect(await store.get("groom-1", "missing")).toBeNull();
  });

  it("listByGroom() stamps id + groomUid on each record", async () => {
    const { store } = makeStore({
      guestsByGroom: { "groom-1": { a: { name: "A" }, b: { name: "B" } } },
    });
    const list = await store.listByGroom("groom-1");
    expect(list).toHaveLength(2);
    expect(list.map((g) => g.id).sort()).toEqual(["a", "b"]);
    expect(list.every((g) => g.groomUid === "groom-1")).toBe(true);
  });

  it("patch() shallow-merges — unspecified siblings survive", async () => {
    const { store, tree } = makeStore({
      guestsByGroom: { "groom-1": { a: { name: "A", phone: "+1", status: "pending" } } },
    });
    await store.patch("groom-1", "a", { status: "delivered" });
    expect(getAt(tree, "guestsByGroom/groom-1/a")).toEqual({
      name: "A",
      phone: "+1",
      status: "delivered",
    });
  });

  it("remove() deletes the guest", async () => {
    const { store, tree } = makeStore({
      guestsByGroom: { "groom-1": { a: { name: "A" } } },
    });
    await store.remove("groom-1", "a");
    expect(getAt(tree, "guestsByGroom/groom-1/a")).toBeNull();
  });

  it("listAll() flattens guests across grooms with groomUid stamped", async () => {
    const { store } = makeStore({
      guestsByGroom: {
        "groom-1": { a: { name: "A" } },
        "groom-2": { b: { name: "B" } },
      },
    });
    const all = await store.listAll();
    expect(all).toHaveLength(2);
    expect(all.map((g) => g.groomUid).sort()).toEqual(["groom-1", "groom-2"]);
  });
});
