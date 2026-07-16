// Pure helpers for the guest-experience metrics rollups.
//
// WHY ROLLUPS AND NOT RAW EVENTS: every invitation load reports its timings, so a
// raw per-load collection would grow without bound — and `/admin/analytics`
// deliberately reads its whole working set once per window (see admin.ts). A
// boundless events collection would turn that endpoint into a full-table scan and
// eventually take the dashboard down. Instead each load atomically increments ONE
// bounded document per (surface × template × day): the distribution is preserved
// as HISTOGRAM BUCKETS, so we can still answer p50/p90 without keeping the raw
// rows. Doc count is ~surfaces × templates × days — a few thousand a year, cheap
// to query by a single `day >= …` range.
//
// I/O-free by design, so it unit-tests without the emulator (mirrors aggregate.ts).

type AnyRec = Record<string, unknown>;

/** Millisecond histogram edges. Chosen around the experience they describe:
 *  ≤1s feels instant, ~2–4s is the "is it broken?" zone, >8s is the village-4G
 *  loading wall the audit flagged. 9 buckets (b0..b8). */
export const MS_EDGES = [250, 500, 1000, 2000, 4000, 8000, 15000, 30000];

/** CLS bands from the Core Web Vitals thresholds (good ≤0.1, needs-improvement
 *  ≤0.25, else poor). */
export const CLS_EDGES = [0.1, 0.25];

/** The surfaces we bucket separately. "guest" is real invitation traffic; "demo"
 *  and "gallery" are prospect traffic and are NEVER merged into guest funnels. */
export const METRIC_SURFACES = ["guest", "demo", "gallery"] as const;
export type MetricSurface = (typeof METRIC_SURFACES)[number];

/** How an invitation ended up open. Only "tap" is a real guest tap. */
export const TAP_KINDS = ["tap", "auto", "skip", "failsafe", "seen"] as const;

/** Index of `v` in an ascending-edge histogram: 0..edges.length. */
export function bucketIndex(v: number, edges: number[]): number {
  for (let i = 0; i < edges.length; i++) {
    if (v <= edges[i]) return i;
  }
  return edges.length;
}

/** UTC day key, e.g. 20260716. UTC (not Asia/Jerusalem) because Cloud Functions
 *  run in UTC and the key must be stable regardless of who writes it; daily
 *  charts are therefore UTC-bucketed (a 2–3h shift vs local — immaterial at the
 *  day granularity these trends are read at). */
export function dayKey(ms: number): number {
  const d = new Date(ms);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

/** Document id for one (surface, template, day) rollup bucket. */
export function rollupDocId(surface: string, templateId: string, day: number): string {
  return `${surface}_${templateId}_${day}`;
}

/**
 * Estimate a percentile from histogram counts. Buckets are ranges, so the result
 * is the UPPER EDGE of the bucket the percentile falls in — i.e. "p90 ≤ 4000ms",
 * deliberately conservative rather than falsely precise. The open-ended final
 * bucket returns null (we only know it exceeded the last edge, and inventing a
 * number there would be the kind of fabricated metric the aggregator forbids).
 */
export function histPercentile(
  hist: Record<string, number> | undefined,
  edges: number[],
  q: number,
): number | null {
  if (!hist) return null;
  const counts: number[] = [];
  let total = 0;
  for (let i = 0; i <= edges.length; i++) {
    const c = Number(hist[`b${i}`] ?? 0) || 0;
    counts.push(c);
    total += c;
  }
  if (total === 0) return null;
  const target = total * q;
  let seen = 0;
  for (let i = 0; i < counts.length; i++) {
    seen += counts[i];
    if (seen >= target) return i < edges.length ? edges[i] : null;
  }
  return null;
}

/** Sum two histogram maps (used to merge a template's days into one view). */
export function mergeHist(
  a: Record<string, number> | undefined,
  b: Record<string, number> | undefined,
): Record<string, number> {
  const out: Record<string, number> = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b ?? {})) out[k] = (out[k] ?? 0) + (Number(v) || 0);
  return out;
}

/** A clamped, finite number or undefined — never trust a public payload. */
export function clampNum(v: unknown, min: number, max: number): number | undefined {
  const n = typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
}

export interface MetricsPayload {
  surface: string;
  templateId: string;
  phase: "load" | "final";
  t?: AnyRec;
}

// PHASE FIELD OWNERSHIP — the reason the two-phase transport needs no dedup.
// One visit reports twice (load, then final at page-hide), and each phase owns a
// DISJOINT set of metrics. Enforcing that here, server-side, is what makes the
// histograms correct: if a client (buggy, replayed, or hostile) echoes the load
// timings back in its final payload, they are ignored rather than counted twice.
const LOAD_FIELDS: [string, string][] = [
  ["sealed", "sealedMs"],
  ["ready", "readyMs"],
  ["ttfb", "ttfbMs"],
];
const FINAL_FIELDS: [string, string][] = [
  ["lcp", "lcpMs"],
  ["inp", "inpMs"],
];

/**
 * Build the dotted-path increment map for one metrics report. The caller wraps
 * each value in FieldValue.increment() and does a single merge:true set — so the
 * write is atomic with no transaction and concurrent guests can't clobber.
 *
 * Tap fields are phase-agnostic (a guest may tap before OR after the page is
 * ready, so the client sends them in whichever phase first knows them, exactly
 * once — it latches the value).
 */
export function buildRollupIncrement(p: MetricsPayload): Record<string, number> {
  const t = p.t ?? {};
  const inc: Record<string, number> = {};
  const bump = (path: string, by = 1) => {
    inc[path] = (inc[path] ?? 0) + by;
  };

  const isLoad = p.phase === "load";
  bump(isLoad ? "loads" : "finals");

  // Duration metrics: histogram (for percentiles) + running sum/count (for means).
  const durations: [string, unknown][] = [
    ...(isLoad ? LOAD_FIELDS : FINAL_FIELDS).map(
      ([name, field]) => [name, t[field]] as [string, unknown],
    ),
    ["tap", t.tapDelayMs],
  ];
  for (const [name, raw] of durations) {
    const v = clampNum(raw, 0, 600000);
    if (v === undefined) continue;
    bump(`hist.${name}.b${bucketIndex(v, MS_EDGES)}`);
    bump(`sum.${name}`, v);
    bump(`n.${name}`);
  }

  // CLS is a unitless layout-shift score, not a duration — banded, not bucketed.
  // Final-phase only (it is not settled at load time).
  if (!isLoad) {
    const cls = clampNum(t.cls, 0, 10);
    if (cls !== undefined) bump(`cls.${["good", "ni", "poor"][bucketIndex(cls, CLS_EDGES)]}`);
  }

  // How it opened. Unknown kinds are dropped rather than creating arbitrary
  // fields on the doc from a public payload.
  const kind = typeof t.tapKind === "string" ? t.tapKind : null;
  if (kind && (TAP_KINDS as readonly string[]).includes(kind)) bump(`tapKinds.${kind}`);

  return inc;
}
