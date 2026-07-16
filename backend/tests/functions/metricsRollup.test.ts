// Pure-logic tests for the guest-experience metrics rollups. These pin the
// invariants the whole dashboard rests on: one visit must contribute each metric
// exactly once, percentiles must never be invented, and a public payload must
// never be able to create arbitrary fields on the rollup document.
import { describe, it, expect } from "vitest";
import {
  MS_EDGES,
  CLS_EDGES,
  bucketIndex,
  dayKey,
  rollupDocId,
  histPercentile,
  mergeHist,
  clampNum,
  buildRollupIncrement,
  expandIncrements,
} from "../../functions/src/api/analytics/metricsRollup";

describe("bucketIndex", () => {
  it("puts a value in the first bucket whose edge it does not exceed", () => {
    expect(bucketIndex(0, MS_EDGES)).toBe(0);
    expect(bucketIndex(250, MS_EDGES)).toBe(0); // inclusive upper edge
    expect(bucketIndex(251, MS_EDGES)).toBe(1);
    expect(bucketIndex(1000, MS_EDGES)).toBe(2);
    expect(bucketIndex(1001, MS_EDGES)).toBe(3);
  });

  it("puts anything past the last edge in the open-ended overflow bucket", () => {
    expect(bucketIndex(30000, MS_EDGES)).toBe(7);
    expect(bucketIndex(30001, MS_EDGES)).toBe(MS_EDGES.length); // b8
    expect(bucketIndex(999999, MS_EDGES)).toBe(MS_EDGES.length);
  });

  it("bands CLS on the Core Web Vitals thresholds", () => {
    expect(bucketIndex(0.1, CLS_EDGES)).toBe(0); // good
    expect(bucketIndex(0.2, CLS_EDGES)).toBe(1); // needs improvement
    expect(bucketIndex(0.9, CLS_EDGES)).toBe(2); // poor
  });
});

describe("dayKey / rollupDocId", () => {
  it("builds a UTC yyyymmdd key", () => {
    expect(dayKey(Date.UTC(2026, 6, 16, 12, 0, 0))).toBe(20260716);
    expect(dayKey(Date.UTC(2026, 0, 1, 0, 0, 0))).toBe(20260101);
  });

  it("is UTC-stable across the local-midnight boundary", () => {
    // 22:30 UTC and 23:30 UTC on the same UTC day share a key regardless of the
    // reader's timezone — the property that makes concurrent writers agree.
    expect(dayKey(Date.UTC(2026, 6, 16, 22, 30))).toBe(dayKey(Date.UTC(2026, 6, 16, 23, 30)));
    expect(dayKey(Date.UTC(2026, 6, 17, 0, 30))).toBe(20260717);
  });

  it("scopes a doc id by surface, template and day", () => {
    expect(rollupDocId("guest", "destination-love", 20260716)).toBe("guest_destination-love_20260716");
    // Demo traffic lands in a DIFFERENT doc than guest traffic for the same day.
    expect(rollupDocId("demo", "destination-love", 20260716)).not.toBe(
      rollupDocId("guest", "destination-love", 20260716),
    );
  });
});

describe("histPercentile", () => {
  const hist = { b0: 10, b1: 10, b2: 10, b3: 10 }; // 40 samples ≤2000ms

  it("returns null for an empty/absent histogram rather than a fake zero", () => {
    expect(histPercentile(undefined, MS_EDGES, 0.5)).toBeNull();
    expect(histPercentile({}, MS_EDGES, 0.5)).toBeNull();
    expect(histPercentile({ b0: 0 }, MS_EDGES, 0.5)).toBeNull();
  });

  it("reports the upper edge of the bucket the percentile falls in", () => {
    expect(histPercentile(hist, MS_EDGES, 0.5)).toBe(500); // 20th sample → b1
    expect(histPercentile(hist, MS_EDGES, 0.9)).toBe(2000); // 36th sample → b3
  });

  // null must mean "no samples" and NOTHING else. A caller comparing templates
  // ("which is slowest?") skips nulls, so if the open-ended tail also returned
  // null the SLOWEST possible result would vanish from the comparison and a fast
  // template would be reported as the worst.
  it("reports the last edge as a lower bound in the open-ended tail, not null", () => {
    // Everything landed past 30s: we know it was AT LEAST 30s, not how much more.
    expect(histPercentile({ b8: 5 }, MS_EDGES, 0.5)).toBe(30000);
  });

  it("reserves null exclusively for 'no samples'", () => {
    expect(histPercentile({}, MS_EDGES, 0.9)).toBeNull();
    expect(histPercentile({ b0: 0, b8: 0 }, MS_EDGES, 0.9)).toBeNull();
    // Any sample at all → a number, never null.
    expect(histPercentile({ b8: 1 }, MS_EDGES, 0.9)).toBe(30000);
  });

  it("ranks a tail percentile as worse than a fast one (the comparison that broke)", () => {
    const fast = histPercentile({ b0: 10 }, MS_EDGES, 0.9);
    const slow = histPercentile({ b8: 10 }, MS_EDGES, 0.9);
    expect(slow).toBeGreaterThan(fast);
  });

  it("handles a single sample", () => {
    expect(histPercentile({ b2: 1 }, MS_EDGES, 0.5)).toBe(1000);
  });
});

describe("mergeHist", () => {
  it("sums per-day histograms into one view", () => {
    expect(mergeHist({ b0: 1, b1: 2 }, { b1: 3, b2: 4 })).toEqual({ b0: 1, b1: 5, b2: 4 });
  });
  it("tolerates missing sides", () => {
    expect(mergeHist(undefined, { b0: 1 })).toEqual({ b0: 1 });
    expect(mergeHist({ b0: 1 }, undefined)).toEqual({ b0: 1 });
  });
});

describe("clampNum", () => {
  it("clamps rather than rejects (a bad clock should not lose the visit)", () => {
    expect(clampNum(-5, 0, 100)).toBe(0);
    expect(clampNum(500, 0, 100)).toBe(100);
    expect(clampNum(50, 0, 100)).toBe(50);
  });
  it("rejects non-finite / non-numeric junk", () => {
    for (const bad of [NaN, Infinity, "12", null, undefined, {}]) {
      expect(clampNum(bad, 0, 100)).toBeUndefined();
    }
  });
});

describe("buildRollupIncrement", () => {
  it("counts a load and buckets its load timings", () => {
    const inc = buildRollupIncrement({
      surface: "guest",
      templateId: "classic",
      phase: "load",
      t: { sealedMs: 900, readyMs: 2500, ttfbMs: 120 },
    });
    expect(inc.loads).toBe(1);
    expect(inc["hist.sealed.b2"]).toBe(1); // 900 → ≤1000
    expect(inc["hist.ready.b4"]).toBe(1); // 2500 → ≤4000
    expect(inc["sum.sealed"]).toBe(900);
    expect(inc["n.sealed"]).toBe(1);
    expect(inc.finals).toBeUndefined();
  });

  it("counts a final and buckets the vitals", () => {
    const inc = buildRollupIncrement({
      surface: "guest",
      templateId: "classic",
      phase: "final",
      t: { lcpMs: 1800, inpMs: 90, cls: 0.03 },
    });
    expect(inc.finals).toBe(1);
    expect(inc["hist.lcp.b3"]).toBe(1);
    expect(inc["cls.good"]).toBe(1);
    expect(inc.loads).toBeUndefined();
  });

  // The load-bearing invariant: the two phases own DISJOINT fields, enforced
  // server-side so a buggy or replayed client cannot double-count one visit.
  it("IGNORES load timings echoed back in a final payload", () => {
    const inc = buildRollupIncrement({
      surface: "guest",
      templateId: "classic",
      phase: "final",
      t: { sealedMs: 900, readyMs: 2500, ttfbMs: 120, lcpMs: 1800 },
    });
    const keys = Object.keys(inc);
    expect(keys.filter((k) => k.startsWith("hist.sealed"))).toEqual([]);
    expect(keys.filter((k) => k.startsWith("hist.ready"))).toEqual([]);
    expect(keys.filter((k) => k.startsWith("sum.sealed"))).toEqual([]);
    expect(inc["n.ttfb"]).toBeUndefined();
    expect(inc["hist.lcp.b3"]).toBe(1); // the field final DOES own
  });

  it("IGNORES vitals sent early in a load payload", () => {
    const inc = buildRollupIncrement({
      surface: "guest",
      templateId: "classic",
      phase: "load",
      t: { sealedMs: 900, lcpMs: 1800, cls: 0.5, inpMs: 90 },
    });
    const keys = Object.keys(inc);
    expect(keys.filter((k) => k.startsWith("hist.lcp"))).toEqual([]);
    expect(keys.filter((k) => k.startsWith("hist.inp"))).toEqual([]);
    expect(keys.filter((k) => k.startsWith("cls."))).toEqual([]);
    expect(inc["hist.sealed.b2"]).toBe(1);
  });

  it("accepts tap fields in EITHER phase (a guest may tap before or after ready)", () => {
    const inLoad = buildRollupIncrement({
      surface: "guest", templateId: "classic", phase: "load",
      t: { tapDelayMs: 3000, tapKind: "tap" },
    });
    expect(inLoad["tapKinds.tap"]).toBe(1);
    expect(inLoad["hist.tap.b4"]).toBe(1); // 3000 → ≤4000

    const inFinal = buildRollupIncrement({
      surface: "guest", templateId: "classic", phase: "final",
      t: { tapDelayMs: 3000, tapKind: "tap" },
    });
    expect(inFinal["tapKinds.tap"]).toBe(1);
    expect(inFinal["hist.tap.b4"]).toBe(1);
  });

  it("keeps an auto-open countable but distinct from a real tap", () => {
    const inc = buildRollupIncrement({
      surface: "guest", templateId: "classic", phase: "load",
      t: { tapDelayMs: 5000, tapKind: "auto" },
    });
    expect(inc["tapKinds.auto"]).toBe(1);
    expect(inc["tapKinds.tap"]).toBeUndefined();
  });

  it("drops an unknown tapKind instead of creating a field from a public payload", () => {
    const inc = buildRollupIncrement({
      surface: "guest", templateId: "classic", phase: "load",
      t: { tapKind: "__proto__" as never },
    });
    expect(Object.keys(inc).some((k) => k.startsWith("tapKinds."))).toBe(false);
  });

  it("clamps an absurd duration into the overflow bucket instead of dropping it", () => {
    const inc = buildRollupIncrement({
      surface: "guest", templateId: "classic", phase: "load",
      t: { sealedMs: 9e12 },
    });
    expect(inc["hist.sealed.b8"]).toBe(1);
    expect(inc["sum.sealed"]).toBe(600000); // clamped, so the mean can't explode
  });

  it("skips non-numeric junk without throwing", () => {
    const inc = buildRollupIncrement({
      surface: "guest", templateId: "classic", phase: "load",
      t: { sealedMs: "fast" as never, readyMs: NaN },
    });
    expect(inc.loads).toBe(1);
    expect(Object.keys(inc).some((k) => k.startsWith("hist."))).toBe(false);
  });

  it("records a phase even with no timings at all", () => {
    expect(buildRollupIncrement({ surface: "demo", templateId: "classic", phase: "load" })).toEqual({ loads: 1 });
  });
});

describe("expandIncrements", () => {
  const id = (n: number) => n;

  // Guards a bug class that would be invisible until the dashboard read back
  // empty: Firestore's set() treats "a.b.c" as a LITERAL field name (only
  // update() reads it as a path), so the rollup must be written nested.
  it("nests dotted paths instead of leaving literal dotted field names", () => {
    const out = expandIncrements({ "hist.sealed.b2": 1, "sum.sealed": 900 }, id);
    expect(out).toEqual({ hist: { sealed: { b2: 1 } }, sum: { sealed: 900 } });
    expect(out["hist.sealed.b2"]).toBeUndefined();
  });

  it("keeps top-level counters flat", () => {
    expect(expandIncrements({ loads: 1 }, id)).toEqual({ loads: 1 });
  });

  it("merges sibling leaves under one shared parent", () => {
    expect(expandIncrements({ "hist.sealed.b1": 1, "hist.sealed.b2": 2, "hist.ready.b0": 3 }, id)).toEqual({
      hist: { sealed: { b1: 1, b2: 2 }, ready: { b0: 3 } },
    });
  });

  it("applies the wrapper to every leaf (FieldValue.increment in production)", () => {
    const out = expandIncrements({ "cls.good": 1 }, (n) => ({ __inc__: n }));
    expect(out).toEqual({ cls: { good: { __inc__: 1 } } });
  });

  it("round-trips a real payload into the shape the aggregator reads", () => {
    const inc = buildRollupIncrement({
      surface: "guest", templateId: "classic", phase: "load",
      t: { sealedMs: 900, readyMs: 2500 },
    });
    const doc = expandIncrements(inc, id) as any;
    // The aggregator reads doc.hist.sealed.bN — this is the contract between
    // the writer and composeTemplateMetrics.
    expect(doc.hist.sealed.b2).toBe(1);
    expect(doc.hist.ready.b4).toBe(1);
    expect(doc.n.sealed).toBe(1);
  });

  it("returns an empty object for no increments", () => {
    expect(expandIncrements({}, id)).toEqual({});
  });
});
