// @vitest-environment node
//
// Pure-logic tests for the assignment domain module
// (domain/assignments/assignmentStore.ts), including the compensating-rollback
// correctness fix. No emulator: the RTDB + Auth dependencies are the in-memory
// DbPort + AuthPort fakes.
import { describe, it, expect } from "vitest";
import { makeAssignmentStore } from "../../functions/src/domain/assignments/assignmentStore";
import { inMemoryDb } from "./support/inMemoryDb";
import { inMemoryAuth } from "./support/inMemoryAuth";

const baseDb = () => ({
  usernameIndex: { karim: "groom-uid", notgroom: "other-uid" },
  users: { "groom-uid": { role: "groom" }, "other-uid": { role: "driver" } },
});

function make(dbSeed: Record<string, unknown> = {}, claims: Record<string, unknown> = { role: "driver", username: "d1" }) {
  const { db, tree } = inMemoryDb({ ...baseDb(), ...dbSeed });
  const a = inMemoryAuth({ "driver-1": { customClaims: claims } });
  return { store: makeAssignmentStore({ db, auth: a.auth }), tree, auth: a };
}

describe("makeAssignmentStore — list", () => {
  it("returns {} when the driver has no assignments", async () => {
    const { store } = make();
    expect(await store.list("driver-1")).toEqual({});
  });

  it("returns the assignment map", async () => {
    const { store } = make({ driverAssignments: { "driver-1": { g1: true } } });
    expect(await store.list("driver-1")).toEqual({ g1: true });
  });
});

describe("makeAssignmentStore — assign (happy paths)", () => {
  it("writes the assignment and restamps the claim with the union, preserving other claims", async () => {
    const { store, tree, auth } = make();
    const res = await store.assign("driver-1", "karim");
    expect(res).toEqual({ ok: true, groomUid: "groom-uid" });
    expect(tree.driverAssignments["driver-1"]["groom-uid"]).toBe(true);
    expect(auth.users["driver-1"].customClaims).toEqual({
      role: "driver",
      username: "d1",
      assignedGrooms: { "groom-uid": true },
    });
  });

  it("unions a new groom with the driver's existing assignments", async () => {
    const { store, auth } = make({
      driverAssignments: { "driver-1": { "g-old": true } },
    });
    await store.assign("driver-1", "karim");
    expect(auth.users["driver-1"].customClaims!.assignedGrooms).toEqual({
      "g-old": true,
      "groom-uid": true,
    });
  });

  it("404s an unknown groom and writes nothing", async () => {
    const { store, tree } = make();
    expect(await store.assign("driver-1", "ghost")).toEqual({ ok: false, reason: "unknown_groom" });
    expect(tree.driverAssignments).toBeUndefined();
  });

  it("409s when the target is not a groom and writes nothing", async () => {
    const { store, tree } = make();
    expect(await store.assign("driver-1", "notgroom")).toEqual({ ok: false, reason: "target_not_a_groom" });
    expect(tree.driverAssignments).toBeUndefined();
  });
});

describe("makeAssignmentStore — claim-restamp rollback (the fix)", () => {
  it("rolls back a NEWLY-added assignment when the claim restamp fails", async () => {
    const { store, tree, auth } = make();
    auth.failNextClaims(); // setCustomUserClaims throws
    await expect(store.assign("driver-1", "karim")).rejects.toThrow();
    // The just-written assignment was undone — table + claim stay consistent.
    expect(tree.driverAssignments["driver-1"]["groom-uid"]).toBeUndefined();
    expect(auth.users["driver-1"].customClaims).toEqual({ role: "driver", username: "d1" });
  });

  it("does NOT roll back a pre-existing assignment when the restamp fails", async () => {
    const { store, tree, auth } = make({
      driverAssignments: { "driver-1": { "groom-uid": true } },
    });
    auth.failNextClaims();
    await expect(store.assign("driver-1", "karim")).rejects.toThrow();
    // Was already assigned (and consistent) before — left intact; retry self-heals.
    expect(tree.driverAssignments["driver-1"]["groom-uid"]).toBe(true);
  });
});
