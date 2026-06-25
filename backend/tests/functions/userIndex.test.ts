// @vitest-environment node
//
// Pure-logic tests for the read-only user-index resolver
// (domain/users/userIndex.ts). No emulator: the RTDB dependency is an in-memory
// fake injected through the narrow DbPort.
import { describe, it, expect } from "vitest";
import { makeUserIndex } from "../../functions/src/domain/users/userIndex";

function makeIndex(seed: Record<string, unknown> = {}) {
  const tree: any = structuredClone(seed);
  const db = {
    async get(path: string) {
      let node: any = tree;
      for (const k of path.split("/")) {
        if (node === null || node === undefined || typeof node !== "object") return null;
        node = node[k];
      }
      return node === undefined ? null : node;
    },
    async update() {},
    async set() {},
    async remove() {},
  };
  return makeUserIndex({ db });
}

describe("makeUserIndex.resolveUidByUsername", () => {
  it("resolves a known username to its uid", async () => {
    const idx = makeIndex({ usernameIndex: { karim: "uid-karim" } });
    expect(await idx.resolveUidByUsername("karim")).toBe("uid-karim");
  });

  it("returns null for an unknown username", async () => {
    const idx = makeIndex({ usernameIndex: { karim: "uid-karim" } });
    expect(await idx.resolveUidByUsername("nobody")).toBeNull();
  });

  it("returns null when the index is absent entirely", async () => {
    const idx = makeIndex({});
    expect(await idx.resolveUidByUsername("anyone")).toBeNull();
  });

  it("returns null when the index value is not a string (defensive)", async () => {
    const idx = makeIndex({ usernameIndex: { weird: { nested: true } } });
    expect(await idx.resolveUidByUsername("weird")).toBeNull();
  });
});
