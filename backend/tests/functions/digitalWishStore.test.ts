// @vitest-environment node
//
// Pure-logic tests for the digital-wish (guestbook) domain module
// (domain/digital/wishStore.ts). No emulator: the Firestore dependency is the
// in-memory FirestorePort fake, and `now` is a fixed clock so approvedAt is
// deterministic.
import { describe, it, expect } from "vitest";
import { makeDigitalWishStore } from "../../functions/src/domain/digital/wishStore";
import { inMemoryFirestore } from "./support/inMemoryFirestore";

const WISHES = "digitalInvitations/groom-1/wishes";
const FIXED = 1_700_000_000_000;

const make = (seed = {}) => {
  const { fs, cols } = inMemoryFirestore(seed);
  return { store: makeDigitalWishStore({ fs, now: () => FIXED }), cols };
};

describe("makeDigitalWishStore", () => {
  it("list() returns wishes newest-first by submittedAt", async () => {
    const { store } = make({
      [WISHES]: {
        a: { who: "A", submittedAt: 100 },
        c: { who: "C", submittedAt: 300 },
        b: { who: "B", submittedAt: 200 },
      },
    });
    const list = await store.list("groom-1");
    expect(list.map((w) => w.id)).toEqual(["c", "b", "a"]);
  });

  it("list() treats a missing submittedAt as oldest (not dropped)", async () => {
    const { store } = make({
      [WISHES]: {
        withTime: { who: "A", submittedAt: 500 },
        noTime: { who: "B" },
      },
    });
    const list = await store.list("groom-1");
    expect(list.map((w) => w.id)).toEqual(["withTime", "noTime"]);
  });

  it("setStatus('approved') stamps approvedAt with the injected clock", async () => {
    const { store, cols } = make({
      [WISHES]: { w1: { who: "A", status: "pending", approvedAt: null } },
    });
    await store.setStatus("groom-1", "w1", "approved");
    expect(cols.get(WISHES)!.get("w1")).toMatchObject({
      status: "approved",
      approvedAt: FIXED,
    });
  });

  it("setStatus('pending') clears approvedAt", async () => {
    const { store, cols } = make({
      [WISHES]: { w1: { who: "A", status: "approved", approvedAt: 123 } },
    });
    await store.setStatus("groom-1", "w1", "pending");
    expect(cols.get(WISHES)!.get("w1")).toMatchObject({
      status: "pending",
      approvedAt: null,
    });
  });

  it("remove() deletes the wish", async () => {
    const { store, cols } = make({ [WISHES]: { w1: { who: "A" } } });
    await store.remove("groom-1", "w1");
    expect(cols.get(WISHES)!.has("w1")).toBe(false);
  });
});
