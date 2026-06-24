// @vitest-environment node
//
// Unit tests for the persistent (cross-instance) auth rate limiter
// (rateLimitPersistent.ts). No emulator: the RTDB dependency is the in-memory
// DbPort fake (which implements the transaction op). A controllable clock drives
// window expiry.
import { describe, it, expect } from "vitest";
import {
  allowPersistent,
  failureCountPersistent,
  recordFailurePersistent,
  clearFailuresPersistent,
} from "../../functions/src/rateLimitPersistent";
import { inMemoryDb } from "./support/inMemoryDb";

const clockOf = (start = 1_000_000) => {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
};

describe("allowPersistent", () => {
  it("allows up to the cap, then denies; resets after the window", async () => {
    const { db } = inMemoryDb();
    const c = clockOf();
    const hit = () => allowPersistent(db, "login:1.2.3.4", 2, 60_000, c.now);

    expect(await hit()).toBe(true); // 1
    expect(await hit()).toBe(true); // 2
    expect(await hit()).toBe(false); // 3 — over cap
    c.advance(60_001); // window elapsed
    expect(await hit()).toBe(true); // fresh window
  });

  it("sanitises dotted keys into a legal RTDB path", async () => {
    const { db, tree } = inMemoryDb();
    await allowPersistent(db, "login:1.2.3.4", 5, 60_000);
    // '.' and ':' are replaced; the bucket lands under /rateLimits.
    const keys = Object.keys(tree.rateLimits ?? {});
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toContain(".");
  });

  it("FAIL-OPENS (allows) when the store throws", async () => {
    const throwing = {
      async get() { throw new Error("down"); },
      async update() { throw new Error("down"); },
      async set() { throw new Error("down"); },
      async remove() { throw new Error("down"); },
      async transaction() { throw new Error("down"); },
    } as any;
    expect(await allowPersistent(throwing, "login:x", 1, 60_000)).toBe(true);
  });
});

describe("failure lockout counters", () => {
  it("counts failures, reports them, and clears on success", async () => {
    const { db } = inMemoryDb();
    const c = clockOf();
    const key = "login_acct:karim";

    expect(await failureCountPersistent(db, key, c.now)).toBe(0);
    await recordFailurePersistent(db, key, 3_600_000, c.now);
    await recordFailurePersistent(db, key, 3_600_000, c.now);
    expect(await failureCountPersistent(db, key, c.now)).toBe(2);

    await clearFailuresPersistent(db, key);
    expect(await failureCountPersistent(db, key, c.now)).toBe(0);
  });

  it("a failure window expires (count drops to 0)", async () => {
    const { db } = inMemoryDb();
    const c = clockOf();
    const key = "login_acct:karim";
    await recordFailurePersistent(db, key, 3_600_000, c.now);
    expect(await failureCountPersistent(db, key, c.now)).toBe(1);
    c.advance(3_600_001);
    expect(await failureCountPersistent(db, key, c.now)).toBe(0);
  });

  it("failureCount FAIL-OPENS to 0 when the store throws", async () => {
    const throwing = { async get() { throw new Error("down"); } } as any;
    expect(await failureCountPersistent(throwing, "k")).toBe(0);
  });
});
