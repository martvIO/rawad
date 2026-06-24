// @vitest-environment node
//
// Semantics of the DbPort.transaction (compare-and-set) capability, exercised
// through the in-memory fake. This is the contract the production rtdbPort
// adapter mirrors (RTDB ref(path).transaction): `null` for an absent path,
// `undefined` from the transform ABORTS, and a returned value COMMITS. The
// canonical consumer is the one-shot invite-token claim — modelled directly in
// the last test.
import { describe, it, expect } from "vitest";
import { inMemoryDb } from "./support/inMemoryDb";

describe("DbPort.transaction (compare-and-set)", () => {
  it("commits the transform's return value at an absent path", async () => {
    const { db, tree } = inMemoryDb();
    const r = await db.transaction("a/b/usedAt", (cur) => (cur ? undefined : 100));
    expect(r.committed).toBe(true);
    expect(tree.a.b.usedAt).toBe(100);
  });

  it("passes `null` (not undefined) to the transform for an absent path", async () => {
    const { db } = inMemoryDb();
    let seen: unknown = "unset";
    await db.transaction("missing", (cur) => {
      seen = cur;
      return 1;
    });
    expect(seen).toBeNull();
  });

  it("aborts (no write) when the transform returns undefined", async () => {
    const { db, tree } = inMemoryDb({ slot: { usedAt: 5 } });
    const r = await db.transaction("slot/usedAt", (cur) => (cur ? undefined : 9));
    expect(r.committed).toBe(false);
    expect(tree.slot.usedAt).toBe(5); // untouched
  });

  it("one-shot claim: the first claim commits, a second is rejected", async () => {
    // Models routes/invites.ts: claim `usedAt` only while still empty.
    const { db, tree } = inMemoryDb({ inviteTokens: { tok: {} } });
    const claim = () =>
      db.transaction("inviteTokens/tok/usedAt", (cur) => (cur ? undefined : 1700));

    const first = await claim();
    const second = await claim();

    expect(first.committed).toBe(true);
    expect(second.committed).toBe(false);
    expect(tree.inviteTokens.tok.usedAt).toBe(1700); // the first writer's value
  });
});
