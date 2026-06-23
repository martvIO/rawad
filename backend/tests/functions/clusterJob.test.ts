// @vitest-environment node
//
// Regression tests for the clustering job's two correctness fixes:
//   1. commitInChunks must SURFACE write failures (it used to swallow every
//      error with .catch(() => undefined), so a partial write still stamped
//      phase:"done" + clusterDirty:false — silent People-gallery corruption).
//   2. clusterLockIsHeld gates the mutual-exclusion lock so a concurrent
//      on-demand + scheduled recompute can't delete-then-rewrite over each
//      other, while a crashed run (stale startedAt) can still be taken over.
//
// Both are exported pure-ish units, so they're tested directly without a live
// Firestore. The full recomputeClusters concurrency path needs the emulator and
// is exercised by the integration suite.
import { describe, it, expect } from "vitest";
import {
  commitInChunks,
  clusterLockIsHeld,
  CLUSTER_LOCK_STALE_MS,
} from "../../functions/src/faceIndex/clusterJob";

describe("commitInChunks", () => {
  it("returns 0 when every write succeeds", async () => {
    const thunks = Array.from({ length: 5 }, () => () => Promise.resolve("ok"));
    expect(await commitInChunks(thunks, 2)).toBe(0);
  });

  it("counts failures instead of swallowing them, and still runs the rest", async () => {
    let ran = 0;
    const thunks = [
      () => { ran++; return Promise.resolve("ok"); },
      () => { ran++; return Promise.reject(new Error("quota")); },
      () => { ran++; return Promise.resolve("ok"); },
      () => { ran++; return Promise.reject(new Error("permission")); },
    ];
    const failures = await commitInChunks(thunks, 2);
    expect(failures).toBe(2);
    expect(ran).toBe(4); // allSettled — one rejection never aborts the batch
  });
});

describe("clusterLockIsHeld", () => {
  const now = 1_000_000_000_000;

  it("is held while a fresh run is clustering", () => {
    expect(clusterLockIsHeld({ phase: "clustering", startedAt: now - 1000 }, now)).toBe(true);
  });

  it("is NOT held once the run is done", () => {
    expect(clusterLockIsHeld({ phase: "done", startedAt: now - 1000 }, now)).toBe(false);
  });

  it("is NOT held when a clustering run is stale (crashed) — allows takeover", () => {
    expect(
      clusterLockIsHeld({ phase: "clustering", startedAt: now - CLUSTER_LOCK_STALE_MS - 1 }, now),
    ).toBe(false);
  });

  it("is NOT held when no job status exists yet", () => {
    expect(clusterLockIsHeld(undefined, now)).toBe(false);
  });
});
