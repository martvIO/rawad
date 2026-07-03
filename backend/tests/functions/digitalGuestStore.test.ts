// @vitest-environment node
//
// Pure-logic tests for the digital-guest domain module
// (domain/digital/guestStore.ts), including the headline duplicate-phone guard.
// No emulator: the Firestore dependency is the in-memory FirestorePort fake.
import { describe, it, expect } from "vitest";
import { makeDigitalGuestStore } from "../../functions/src/domain/digital/guestStore";
import { inMemoryFirestore } from "./support/inMemoryFirestore";

const GUESTS = "digitalInvitations/groom-1/guests";

// Mirror the route's il-national phone key (digital/sanitize.ilNational).
const natKey = (raw: unknown): string | null => {
  let d = (((raw ?? "") as string).toString()).replace(/\D/g, "");
  if (d.startsWith("972")) d = d.slice(3);
  else if (d.startsWith("0")) d = d.slice(1);
  return d.length === 9 ? d : null;
};
const dedupeFor = (phone: string) => ({
  key: natKey(phone) as string,
  keyOf: (g: Record<string, unknown>) => natKey(g.phone),
});

describe("makeDigitalGuestStore", () => {
  it("list() returns guests ordered by createdAt ASC with id stamped", async () => {
    const { fs } = inMemoryFirestore({
      [GUESTS]: {
        b: { name: "B", createdAt: 200 },
        a: { name: "A", createdAt: 100 },
        c: { name: "C", createdAt: 300 },
      },
    });
    const store = makeDigitalGuestStore({ fs });
    const list = await store.list("groom-1");
    expect(list.map((g) => g.id)).toEqual(["a", "b", "c"]);
    expect(list[0]).toMatchObject({ id: "a", name: "A", createdAt: 100 });
  });

  it("create() persists a new guest when the phone is unique", async () => {
    const { fs, cols } = inMemoryFirestore();
    const store = makeDigitalGuestStore({ fs });
    const res = await store.create(
      "groom-1",
      { name: "Layla", phone: "0501112233", status: "pending", createdAt: 1 },
      dedupeFor("0501112233")
    );
    expect(res).toEqual({ ok: true, id: expect.any(String) });
    expect(cols.get(GUESTS)!.size).toBe(1);
  });

  it("create() rejects a duplicate phone (atomic scan-then-add: one wins)", async () => {
    const { fs, cols } = inMemoryFirestore();
    const store = makeDigitalGuestStore({ fs });
    const base = { name: "Layla", status: "pending", createdAt: 1 };

    const first = await store.create(
      "groom-1",
      { ...base, phone: "0501112233" },
      dedupeFor("0501112233")
    );
    // Same number in a different but phone-equal format must still collide.
    const second = await store.create(
      "groom-1",
      { ...base, name: "Other", phone: "+972501112233" },
      dedupeFor("+972501112233")
    );

    expect(first).toEqual({ ok: true, id: expect.any(String) });
    expect(second).toEqual({ ok: false, reason: "duplicate_phone" });
    expect(cols.get(GUESTS)!.size).toBe(1); // only the first insert landed
  });

  it("patch() shallow-merges an existing guest", async () => {
    const { fs, cols } = inMemoryFirestore({
      [GUESTS]: { g1: { name: "A", phone: "0501112233", status: "pending" } },
    });
    const store = makeDigitalGuestStore({ fs });
    await store.patch("groom-1", "g1", { status: "attending" });
    expect(cols.get(GUESTS)!.get("g1")).toEqual({
      name: "A",
      phone: "0501112233",
      status: "attending",
    });
  });

  it("patchMany() applies many per-guest patches in one bulk write", async () => {
    const { fs, cols } = inMemoryFirestore({
      [GUESTS]: {
        g1: { name: "A", ranks: ["family"] },
        g2: { name: "B", ranks: [] },
        g3: { name: "C", ranks: ["vip"] },
      },
    });
    const store = makeDigitalGuestStore({ fs });
    await store.patchMany("groom-1", [
      { id: "g1", patch: { ranks: ["family", "vip"] } }, // add
      { id: "g2", patch: { ranks: ["vip"] } }, // replace-from-empty
      { id: "g3", patch: { ranks: [] } }, // clear
    ]);
    const col = cols.get(GUESTS)!;
    expect(col.get("g1")).toMatchObject({ name: "A", ranks: ["family", "vip"] });
    expect(col.get("g2")).toMatchObject({ name: "B", ranks: ["vip"] });
    expect(col.get("g3")).toMatchObject({ name: "C", ranks: [] });
  });

  it("patchMany() chunks past the 500-op Firestore batch cap", async () => {
    const seed: Record<string, Record<string, unknown>> = {};
    const updates: { id: string; patch: Record<string, unknown> }[] = [];
    for (let i = 0; i < 550; i++) {
      seed[`g${i}`] = { name: `G${i}`, ranks: [] };
      updates.push({ id: `g${i}`, patch: { ranks: ["tagged"] } });
    }
    const { fs, cols } = inMemoryFirestore({ [GUESTS]: seed });
    const store = makeDigitalGuestStore({ fs });
    await store.patchMany("groom-1", updates); // 550 > 500 → two commits
    const col = cols.get(GUESTS)!;
    expect(col.get("g0")).toMatchObject({ ranks: ["tagged"] });
    expect(col.get("g549")).toMatchObject({ ranks: ["tagged"] });
  });

  it("remove() deletes the guest", async () => {
    const { fs, cols } = inMemoryFirestore({
      [GUESTS]: { g1: { name: "A" } },
    });
    const store = makeDigitalGuestStore({ fs });
    await store.remove("groom-1", "g1");
    expect(cols.get(GUESTS)!.has("g1")).toBe(false);
  });
});
