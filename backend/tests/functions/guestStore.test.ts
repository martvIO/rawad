// @vitest-environment node
//
// Contract test for the in-memory GuestStore adapter — the test-side adapter at
// the guest data-access seam. Proves the double honours the GuestStore interface
// (id stamping, absent -> []/null, shallow-merge patch, idempotent remove) so
// that the handler tests built on it (guestsHandlers.test.ts) are trustworthy.
import { describe, it, expect } from "vitest";
import { inMemoryGuestStore } from "./support/inMemoryGuestStore";

describe("inMemoryGuestStore (GuestStore contract)", () => {
  it("create() stamps a generated id + groomUid and round-trips via get()", async () => {
    const { store } = inMemoryGuestStore();
    const created = await store.create("groom-1", {
      name: "Layla",
      status: "pending",
    });
    expect(created.id).toBeTruthy();
    expect(created.groomUid).toBe("groom-1");
    expect(created.name).toBe("Layla");
    const got = await store.get("groom-1", created.id);
    expect(got).toEqual(created);
  });

  it("listByGroom() returns [] for an absent groom (not an error)", async () => {
    const { store } = inMemoryGuestStore();
    expect(await store.listByGroom("nobody")).toEqual([]);
  });

  it("get() returns null for an absent guest", async () => {
    const { store } = inMemoryGuestStore();
    expect(await store.get("groom-1", "missing")).toBeNull();
  });

  it("listByGroom() returns a groom's guests, each stamped with id + groomUid", async () => {
    const { store } = inMemoryGuestStore({
      "groom-1": { g1: { name: "A" }, g2: { name: "B" } },
    });
    const list = await store.listByGroom("groom-1");
    expect(list).toHaveLength(2);
    expect(list.map((g) => g.id).sort()).toEqual(["g1", "g2"]);
    expect(list.every((g) => g.groomUid === "groom-1")).toBe(true);
  });

  it("patch() shallow-merges into an existing guest", async () => {
    const { store } = inMemoryGuestStore({
      "groom-1": { g1: { name: "A", status: "pending" } },
    });
    await store.patch("groom-1", "g1", { status: "delivered" });
    expect(await store.get("groom-1", "g1")).toMatchObject({
      name: "A",
      status: "delivered",
    });
  });

  it("patch() on a missing guest is a no-op (mirrors RTDB .update)", async () => {
    const { store } = inMemoryGuestStore();
    await expect(
      store.patch("groom-1", "missing", { status: "delivered" })
    ).resolves.toBeUndefined();
    expect(await store.get("groom-1", "missing")).toBeNull();
  });

  it("remove() deletes and is idempotent", async () => {
    const { store, grooms } = inMemoryGuestStore({
      "groom-1": { g1: { name: "A" } },
    });
    await store.remove("groom-1", "g1");
    expect(await store.get("groom-1", "g1")).toBeNull();
    await expect(store.remove("groom-1", "g1")).resolves.toBeUndefined();
    expect(grooms.get("groom-1")?.size ?? 0).toBe(0);
  });

  it("listAll() flattens guests across grooms", async () => {
    const { store } = inMemoryGuestStore({
      "groom-1": { g1: { name: "A" } },
      "groom-2": { g2: { name: "B" } },
    });
    const all = await store.listAll();
    expect(all).toHaveLength(2);
    expect(all.map((g) => g.groomUid).sort()).toEqual(["groom-1", "groom-2"]);
  });
});
