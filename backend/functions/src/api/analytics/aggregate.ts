// Pure aggregation helpers for the admin analytics dashboard.
//
// These functions take RAW records (already read from RTDB / Firestore by the
// `/admin/analytics` route) and return the pre-computed numbers the page renders.
// They are deliberately I/O-free so they can be unit-tested without the emulator
// (see tests/functions/analyticsAggregate.test.ts) and so the browser never has
// to aggregate all-grooms data itself.
//
// HONESTY CONSTRAINTS (these reflect what the data model actually records):
//   - guest.deliveredAt is a localized HH:MM *string*, not a timestamp — so there
//     is NO delivery time-series; delivery is a current-state count only.
//   - Digital invite-OPEN is tracked first-party (guest.viewedAt, stamped by
//     /invites/digital/opened) → digitalOpened/digitalOpenRatePct. Physical
//     invites still have only "sent" (inviteLinkSentAt) and "confirmed".
//   - Stripe only records paymentStatus pending|paid (no "failed") — failedCount
//     is surfaced as 0 rather than fabricated.
//   - Load/open TIMINGS come from metricsDaily histogram rollups, so percentiles
//     are bucket UPPER EDGES ("p90 ≤ 4s"), and a percentile landing in the
//     open-ended tail returns null rather than an invented number.
//   - Demo/gallery (prospect) traffic is reported ONLY in demoEngagement; it is
//     never merged into the guest funnel or a template's guest-facing timings.

import { MS_EDGES, histPercentile, mergeHist } from "./metricsRollup";

type AnyRec = Record<string, unknown>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Per-plan ILS amounts, mirroring PLAN_AMOUNTS_ILS in routes/payments.ts. Used
 *  only as a fallback when a paid user record lacks a stored paymentAmountIls. */
const PLAN_AMOUNTS_ILS: Record<string, number> = { premium: 1500, vip: 2000 };

/** Physical delivery statuses, mirroring ALLOWED_STATUS in routes/guests.ts. */
const DELIVERY_STATUSES = [
  "pending", "enroute", "delivered", "no_answer", "wrong_address", "refused",
] as const;

export type AnalyticsWindow = "30d" | "90d" | "all";

/** Window → trend span + bucket width. "all" buckets weekly over a year so the
 *  series stays bounded; 30d/90d bucket daily. */
const WINDOWS: Record<AnalyticsWindow, { spanMs: number; stepMs: number }> = {
  "30d": { spanMs: 30 * DAY_MS, stepMs: DAY_MS },
  "90d": { spanMs: 90 * DAY_MS, stepMs: DAY_MS },
  "all": { spanMs: 365 * DAY_MS, stepMs: 7 * DAY_MS },
};

export function normalizeWindow(w: unknown): AnalyticsWindow {
  return w === "90d" || w === "all" ? w : "30d";
}

/** The trend span for a window — exported so the route can bound its
 *  metricsDaily query to exactly the range the aggregator will report on
 *  (rather than duplicating the window table and drifting from it). */
export function windowSpanMs(w: AnalyticsWindow): number {
  return WINDOWS[w].spanMs;
}

// ─── Small coercion helpers ────────────────────────────────────────────────────

/** Coerce to a finite number, else 0. */
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Coerce to a strictly-positive epoch-ms timestamp, else null. */
function posTs(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Parse a wedding date that may be stored as epoch-ms or a date string. */
function weddingMs(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string" && v.trim()) {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function username(u: AnyRec): string {
  const name = u.username;
  if (typeof name === "string" && name) return name;
  const uid = u.uid;
  return typeof uid === "string" ? uid.slice(0, 6) : "—";
}

// ─── Time-series bucketing ──────────────────────────────────────────────────────

export interface Bucket { t: number; count: number; }

/**
 * Bucket a list of epoch-ms timestamps into fixed-width buckets spanning
 * [startMs, endMs). Out-of-range / non-finite timestamps are ignored. Returns
 * one `{ t, count }` per bucket (t = bucket start ms) so the client can label.
 */
export function bucketSeries(
  timestamps: Array<number | null>,
  startMs: number,
  endMs: number,
  stepMs: number,
): Bucket[] {
  const n = Math.max(1, Math.ceil((endMs - startMs) / stepMs));
  const buckets: Bucket[] = Array.from({ length: n }, (_v, i) => ({ t: startMs + i * stepMs, count: 0 }));
  for (const ts of timestamps) {
    if (ts === null || !Number.isFinite(ts) || ts < startMs || ts > endMs) continue;
    const idx = Math.min(n - 1, Math.floor((ts - startMs) / stepMs));
    buckets[idx].count++;
  }
  return buckets;
}

// ─── Section composers ──────────────────────────────────────────────────────────

/** Platform composition: user counts by role. */
export function composeComposition(users: AnyRec[]) {
  let grooms = 0, drivers = 0, admins = 0;
  for (const u of users) {
    if (u.role === "groom") grooms++;
    else if (u.role === "driver") drivers++;
    else if (u.role === "admin") admins++;
  }
  return { totalUsers: users.length, grooms, drivers, admins };
}

/** Business / revenue: from payment fields on groom user records. */
export function composeRevenue(users: AnyRec[]) {
  const grooms = users.filter((u) => u.role === "groom");
  let totalRevenueIls = 0, paidCount = 0, pendingCount = 0, premium = 0, vip = 0;
  let timeToPaySum = 0, timeToPayN = 0;
  for (const u of grooms) {
    const status = u.paymentStatus;
    if (status === "paid") {
      paidCount++;
      const plan = String(u.paymentPlan ?? "");
      const amt = num(u.paymentAmountIls) || PLAN_AMOUNTS_ILS[plan] || 0;
      totalRevenueIls += amt;
      if (plan === "vip") vip++;
      else if (plan === "premium") premium++;
      const created = posTs(u.paymentCreatedAt);
      const paid = posTs(u.paymentPaidAt);
      if (created && paid && paid >= created) { timeToPaySum += paid - created; timeToPayN++; }
    } else if (status === "pending") {
      pendingCount++;
    }
  }
  const noneCount = Math.max(0, grooms.length - paidCount - pendingCount);
  return {
    totalRevenueIls,
    paidCount,
    pendingCount,
    noneCount,
    failedCount: 0, // Stripe records only pending|paid — no "failed" state is stored.
    planMix: { premium, vip },
    funnel: [
      { stage: "none", count: noneCount },
      { stage: "pending", count: pendingCount },
      { stage: "paid", count: paidCount },
    ],
    arpuIls: paidCount > 0 ? Math.round(totalRevenueIls / paidCount) : 0,
    avgTimeToPayMs: timeToPayN > 0 ? Math.round(timeToPaySum / timeToPayN) : null,
  };
}

/** Operations: physical-delivery breakdown + driver leaderboard. */
export function composeOperations(guests: AnyRec[]) {
  const outcomeBreakdown: Record<string, number> = {};
  for (const s of DELIVERY_STATUSES) outcomeBreakdown[s] = 0;
  let proofs = 0;
  const byDriver = new Map<string, number>();
  for (const g of guests) {
    const raw = String(g.status ?? "pending");
    const s = (DELIVERY_STATUSES as readonly string[]).includes(raw) ? raw : "pending";
    outcomeBreakdown[s]++;
    if (g.proofPhotoPath) proofs++;
    if (s === "delivered" && g.deliveredBy) {
      const k = String(g.deliveredBy);
      byDriver.set(k, (byDriver.get(k) ?? 0) + 1);
    }
  }
  const totalGuests = guests.length;
  const delivered = outcomeBreakdown.delivered;
  const driverLeaderboard = [...byDriver.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
  return {
    totalGuests,
    delivered,
    deliveryPct: totalGuests > 0 ? Math.round((delivered / totalGuests) * 100) : 0,
    outcomeBreakdown,
    proofPhotoRatePct: delivered > 0 ? Math.round((proofs / delivered) * 100) : 0,
    driverLeaderboard,
  };
}

/** RSVP / engagement: invite-sent vs confirmed + expected headcount + digital mix. */
export function composeRsvp(guests: AnyRec[], confirmations: AnyRec[], digitalGuests: AnyRec[]) {
  let invitesSent = 0, confirmedGuests = 0;
  for (const g of guests) {
    if (posTs(g.inviteLinkSentAt)) invitesSent++;
    if (posTs(g.confirmedAt)) confirmedGuests++;
  }
  // Expected headcount from confirmation records (each = the guest + companions).
  // /confirmations already mirrors digital submissions (dg_* ids), so using it as
  // the single source avoids double-counting digital RSVPs.
  let expectedHeadcount = 0;
  for (const c of confirmations) expectedHeadcount += 1 + Math.max(0, num(c.companions));
  const digital = { attending: 0, absent: 0, pending: 0 };
  let digitalOpened = 0;
  for (const dg of digitalGuests) {
    const s = String(dg.status ?? "pending");
    if (s === "attending") digital.attending++;
    else if (s === "absent") digital.absent++;
    else digital.pending++;
    if (posTs(dg.viewedAt)) digitalOpened++; // first-party open ping (/invites/digital/opened)
  }
  return {
    invitesSent,
    confirmedGuests,
    rsvps: confirmations.length,
    rsvpRatePct: invitesSent > 0 ? Math.round((confirmedGuests / invitesSent) * 100) : 0,
    expectedHeadcount,
    digital,
    // First-party invite-open metric (top of the digital RSVP funnel).
    digitalOpened,
    digitalOpenRatePct: digitalGuests.length > 0
      ? Math.round((digitalOpened / digitalGuests.length) * 100)
      : 0,
  };
}

/** Design pipeline: status mix + approval/rejection throughput. */
export function composeDesigns(designs: AnyRec[]) {
  const byStatus = { draft: 0, pending_approval: 0, approved: 0, rejected: 0 };
  const grooms = new Set<string>();
  let submitted = 0, approvals = 0, rejections = 0, ptaSum = 0, ptaN = 0;
  for (const d of designs) {
    const s = String(d.designStatus ?? "draft");
    if (s in byStatus) byStatus[s as keyof typeof byStatus]++;
    else byStatus.draft++;
    if (typeof d.groomUid === "string" && d.groomUid) grooms.add(d.groomUid);
    const sub = posTs(d.designSubmittedAt);
    const appr = posTs(d.designApprovedAt);
    const rej = posTs(d.designRejectedAt);
    if (sub) submitted++;
    if (appr) {
      approvals++;
      if (sub && appr >= sub) { ptaSum += appr - sub; ptaN++; }
    }
    if (rej) rejections++;
  }
  return {
    byStatus,
    totalDesigns: designs.length,
    groomsWithDesigns: grooms.size,
    submitted,
    approvals,
    rejections,
    avgPendingToApprovedMs: ptaN > 0 ? Math.round(ptaSum / ptaN) : null,
  };
}

// ─── Guest-experience engagement (the digital funnel + load timings) ───────────
//
// Sources, and the honesty line between them:
//   • digitalGuests — inviteLinkSentAt / viewedAt / confirmedAt are FIRST-PARTY
//     stamps written by the mint, the open ping, and the RSVP submit. The funnel
//     below is therefore counted, not modeled.
//   • guest.perf   — the FIRST visit's timings (POST /invites/digital/metrics).
//   • metricsDaily — histogram rollups over EVERY load, used for percentiles.
// Demo/gallery rollups are deliberately never mixed into the guest sections —
// prospect traffic must not move a couple's numbers (see composeDemoEngagement).

/** Exact percentile from raw samples (used where we have the values, not buckets). */
function pctile(values: number[], q: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1));
  return Math.round(s[i]);
}

function statsOf(values: number[]) {
  return { p50: pctile(values, 0.5), p90: pctile(values, 0.9), n: values.length };
}

/**
 * Which template a digital guest's invitation actually rendered. The token's
 * mint-time designSnapshot is authoritative (it is what the guest was SENT, even
 * if the couple has since switched templates); `perf.templateId` is the
 * fallback for a visit we measured, and pre-template tokens are `classic`, which
 * is exactly what the renderer falls back to for an unknown id.
 */
function templateOfGuest(g: AnyRec, tokenTemplates: Map<string, string>): string {
  const key = `${String(g.groomUid ?? "")}/${String(g.id ?? "")}`;
  const fromToken = tokenTemplates.get(key);
  if (fromToken) return fromToken;
  const perf = g.perf as AnyRec | undefined;
  const fromPerf = perf?.templateId;
  return typeof fromPerf === "string" && fromPerf ? fromPerf : "classic";
}

/** guestKey → templateId, from the digital invite tokens' design snapshots. */
export function buildTokenTemplateMap(inviteTokens: AnyRec[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const tk of inviteTokens) {
    if (tk.guestType !== "digital") continue;
    const groomUid = String(tk.groomUid ?? "");
    const guestId = String(tk.guestId ?? "");
    if (!groomUid || !guestId) continue;
    const snap = tk.designSnapshot as AnyRec | undefined;
    const tpl = snap?.templateId;
    m.set(`${groomUid}/${guestId}`, typeof tpl === "string" && tpl ? tpl : "classic");
  }
  return m;
}

const MAX_ROWS = 100;

/**
 * The digital funnel: sent → opened → submitted, plus the two buckets the owner
 * explicitly asked to see — guests who opened but never answered, and guests who
 * never opened at all. Both are derived from existing stamps (no new tracking).
 */
export function composeDigitalEngagement(digitalGuests: AnyRec[], inviteTokens: AnyRec[]) {
  const tokenTemplates = buildTokenTemplateMap(inviteTokens);
  const funnel = { sent: 0, opened: 0, submitted: 0, attending: 0, absent: 0, openedNoAnswer: 0, neverOpened: 0 };
  const lags: number[] = [];
  const taps: number[] = [];
  const rows: AnyRec[] = [];

  for (const g of digitalGuests) {
    const sentAt = posTs(g.inviteLinkSentAt);
    const viewedAt = posTs(g.viewedAt);
    const confirmedAt = posTs(g.confirmedAt);
    const status = String(g.status ?? "pending");

    if (sentAt) funnel.sent++;
    if (viewedAt) funnel.opened++;
    if (confirmedAt) {
      funnel.submitted++;
      if (status === "attending") funnel.attending++;
      else if (status === "absent") funnel.absent++;
    }
    // Opened but never answered — the drop-off the RSVP nudge should target.
    if (viewedAt && !confirmedAt) funnel.openedNoAnswer++;
    // Sent but never opened — a reach problem (wrong number, unseen message),
    // NOT an invitation problem. Only counted for guests we actually sent to.
    if (sentAt && !viewedAt) funnel.neverOpened++;

    // Send → first-visit lag: how long the WhatsApp link sat before it was opened.
    if (sentAt && viewedAt && viewedAt >= sentAt) lags.push(viewedAt - sentAt);

    const perf = (g.perf as AnyRec | undefined) ?? undefined;
    // Only a REAL tap measures the ritual; an auto-open/skip/failsafe would
    // otherwise flatter the number with delays no guest chose.
    if (perf?.tapKind === "tap") {
      const d = posTs(perf.tapDelayMs);
      if (d !== null) taps.push(d);
    }

    if (viewedAt || confirmedAt || perf) {
      rows.push({
        groomUid: g.groomUid ?? "",
        guestId: g.id ?? "",
        templateId: templateOfGuest(g, tokenTemplates),
        sentAt, viewedAt, confirmedAt,
        status: confirmedAt ? status : "pending",
        lagMs: sentAt && viewedAt && viewedAt >= sentAt ? viewedAt - sentAt : null,
        sealedMs: perf ? (posTs(perf.sealedMs) ?? null) : null,
        readyMs: perf ? (posTs(perf.readyMs) ?? null) : null,
        lcpMs: perf ? (posTs(perf.lcpMs) ?? null) : null,
        tapDelayMs: perf ? (posTs(perf.tapDelayMs) ?? null) : null,
        tapKind: perf?.tapKind ?? null,
        locale: g.locale ?? null,
      });
    }
  }

  // Most-recently-active first, capped — the payload is a dashboard, not an export.
  rows.sort((a, b) => num(b.viewedAt) - num(a.viewedAt));
  const totalRows = rows.length;

  return {
    funnel,
    totalDigitalGuests: digitalGuests.length,
    openRatePct: funnel.sent > 0 ? Math.round((funnel.opened / funnel.sent) * 100) : 0,
    // "Completed" = ANY answer (attending or absent) — an explicit "not coming"
    // is a completed form, and counting only attendees would misread the ask.
    completionRatePct: funnel.sent > 0 ? Math.round((funnel.submitted / funnel.sent) * 100) : 0,
    answerRateOfOpenedPct: funnel.opened > 0 ? Math.round((funnel.submitted / funnel.opened) * 100) : 0,
    sendToOpenLagMs: statsOf(lags),
    tapDelayMs: statsOf(taps),
    guestRows: rows.slice(0, MAX_ROWS),
    guestRowsTruncated: Math.max(0, totalRows - MAX_ROWS),
  };
}

/** Sum the guest-surface rollups for one template across the window. */
function sumRollups(docs: AnyRec[]) {
  const acc = {
    loads: 0,
    hist: {} as Record<string, Record<string, number>>,
    tapKinds: {} as Record<string, number>,
    cls: { good: 0, ni: 0, poor: 0 },
  };
  for (const d of docs) {
    acc.loads += num(d.loads);
    const hist = (d.hist as AnyRec | undefined) ?? {};
    for (const [metric, buckets] of Object.entries(hist)) {
      acc.hist[metric] = mergeHist(acc.hist[metric], buckets as Record<string, number>);
    }
    const tk = (d.tapKinds as AnyRec | undefined) ?? {};
    for (const [k, v] of Object.entries(tk)) acc.tapKinds[k] = (acc.tapKinds[k] ?? 0) + num(v);
    const cls = (d.cls as AnyRec | undefined) ?? {};
    acc.cls.good += num(cls.good);
    acc.cls.ni += num(cls.ni);
    acc.cls.poor += num(cls.poor);
  }
  return acc;
}

/**
 * Per-template comparison: the funnel from the guest stamps + the load
 * distribution from the GUEST-surface rollups. This is what answers "is this
 * template slower, and does it actually get more RSVPs?".
 */
export function composeTemplateMetrics(
  digitalGuests: AnyRec[],
  inviteTokens: AnyRec[],
  metricsDaily: AnyRec[],
) {
  const tokenTemplates = buildTokenTemplateMap(inviteTokens);
  const byTpl = new Map<string, { sent: number; opened: number; submitted: number }>();
  const touch = (id: string) => {
    if (!byTpl.has(id)) byTpl.set(id, { sent: 0, opened: 0, submitted: 0 });
    return byTpl.get(id)!;
  };

  for (const g of digitalGuests) {
    const tpl = templateOfGuest(g, tokenTemplates);
    const row = touch(tpl);
    if (posTs(g.inviteLinkSentAt)) row.sent++;
    if (posTs(g.viewedAt)) row.opened++;
    if (posTs(g.confirmedAt)) row.submitted++;
  }

  // Guest surface only — a prospect clicking through demos must never make a
  // template look faster or slower than it is for real guests.
  const guestDocs = metricsDaily.filter((d) => d.surface === "guest");
  const docsByTpl = new Map<string, AnyRec[]>();
  for (const d of guestDocs) {
    const id = String(d.templateId ?? "classic");
    if (!docsByTpl.has(id)) docsByTpl.set(id, []);
    docsByTpl.get(id)!.push(d);
    touch(id);
  }

  const rows = [...byTpl.entries()].map(([templateId, f]) => {
    const agg = sumRollups(docsByTpl.get(templateId) ?? []);
    const taps = num(agg.tapKinds.tap);
    const autos = num(agg.tapKinds.auto);
    const opens = taps + autos + num(agg.tapKinds.skip) + num(agg.tapKinds.failsafe) + num(agg.tapKinds.seen);
    const clsTotal = agg.cls.good + agg.cls.ni + agg.cls.poor;
    return {
      templateId,
      sent: f.sent,
      opened: f.opened,
      submitted: f.submitted,
      openRatePct: f.sent > 0 ? Math.round((f.opened / f.sent) * 100) : 0,
      completionRatePct: f.sent > 0 ? Math.round((f.submitted / f.sent) * 100) : 0,
      loads: agg.loads,
      sealedP50: histPercentile(agg.hist.sealed, MS_EDGES, 0.5),
      sealedP90: histPercentile(agg.hist.sealed, MS_EDGES, 0.9),
      readyP50: histPercentile(agg.hist.ready, MS_EDGES, 0.5),
      readyP90: histPercentile(agg.hist.ready, MS_EDGES, 0.9),
      lcpP75: histPercentile(agg.hist.lcp, MS_EDGES, 0.75),
      inpP75: histPercentile(agg.hist.inp, MS_EDGES, 0.75),
      tapDelayP50: histPercentile(agg.hist.tap, MS_EDGES, 0.5),
      // What share of opens the guest actually chose. A high auto share on the
      // classic template means the tap cue is not landing.
      tapKinds: agg.tapKinds,
      autoOpenPct: opens > 0 ? Math.round((autos / opens) * 100) : null,
      clsGoodPct: clsTotal > 0 ? Math.round((agg.cls.good / clsTotal) * 100) : null,
    };
  });

  rows.sort((a, b) => b.sent - a.sent || b.loads - a.loads);
  return { rows };
}

/** Per-wedding engagement — "are THIS couple's guests getting through?". */
export function composeWeddingEngagement(digitalGuests: AnyRec[], users: AnyRec[]) {
  const nameOf = new Map<string, string>();
  for (const u of users) if (typeof u.uid === "string") nameOf.set(u.uid, username(u));

  const byGroom = new Map<string, { sent: number; opened: number; submitted: number; lags: number[]; sealed: number[] }>();
  for (const g of digitalGuests) {
    const uid = String(g.groomUid ?? "");
    if (!uid) continue;
    if (!byGroom.has(uid)) byGroom.set(uid, { sent: 0, opened: 0, submitted: 0, lags: [], sealed: [] });
    const row = byGroom.get(uid)!;
    const sentAt = posTs(g.inviteLinkSentAt);
    const viewedAt = posTs(g.viewedAt);
    if (sentAt) row.sent++;
    if (viewedAt) row.opened++;
    if (posTs(g.confirmedAt)) row.submitted++;
    if (sentAt && viewedAt && viewedAt >= sentAt) row.lags.push(viewedAt - sentAt);
    const sealed = posTs((g.perf as AnyRec | undefined)?.sealedMs);
    if (sealed !== null) row.sealed.push(sealed);
  }

  const rows = [...byGroom.entries()].map(([groomUid, r]) => ({
    groomUid,
    groomUsername: nameOf.get(groomUid) ?? groomUid.slice(0, 6),
    sent: r.sent,
    opened: r.opened,
    submitted: r.submitted,
    openRatePct: r.sent > 0 ? Math.round((r.opened / r.sent) * 100) : 0,
    completionRatePct: r.sent > 0 ? Math.round((r.submitted / r.sent) * 100) : 0,
    medianLagMs: pctile(r.lags, 0.5),
    medianSealedMs: pctile(r.sealed, 0.5),
  }));
  rows.sort((a, b) => b.sent - a.sent);
  const total = rows.length;
  return { rows: rows.slice(0, MAX_ROWS), truncated: Math.max(0, total - MAX_ROWS) };
}

/**
 * Prospect traffic (the /templates gallery + the per-template demos), kept in its
 * own section. This is a MARKETING signal — which template do prospects open? —
 * and mixing it into the guest funnel would silently inflate a couple's numbers.
 */
export function composeDemoEngagement(
  metricsDaily: AnyRec[],
  startMs: number,
  endMs: number,
  stepMs: number,
) {
  const docs = metricsDaily.filter((d) => d.surface === "demo" || d.surface === "gallery");
  const bySurface = { demo: 0, gallery: 0 };
  const byTemplate = new Map<string, number>();
  const stamps: Array<number | null> = [];

  for (const d of docs) {
    const loads = num(d.loads);
    const surface = String(d.surface);
    if (surface === "demo") bySurface.demo += loads;
    else bySurface.gallery += loads;
    const tpl = String(d.templateId ?? "classic");
    if (surface === "demo") byTemplate.set(tpl, (byTemplate.get(tpl) ?? 0) + loads);
    // Rollups are per-day, so the series is reconstructed by repeating each
    // day's key `loads` times — exact at day granularity, which is all the
    // buckets need.
    const day = String(d.day ?? "");
    if (/^\d{8}$/.test(day)) {
      const ms = Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8));
      for (let i = 0; i < loads; i++) stamps.push(ms);
    }
  }

  const sealedHist = docs.reduce<Record<string, number>>(
    (acc, d) => mergeHist(acc, ((d.hist as AnyRec | undefined)?.sealed as Record<string, number>) ?? {}),
    {},
  );

  return {
    totalLoads: bySurface.demo + bySurface.gallery,
    bySurface,
    byTemplate: [...byTemplate.entries()]
      .map(([templateId, loads]) => ({ templateId, loads }))
      .sort((a, b) => b.loads - a.loads),
    sealedP50: histPercentile(sealedHist, MS_EDGES, 0.5),
    series: bucketSeries(stamps, startMs, endMs, stepMs),
  };
}

export interface TriageItem {
  type: "design_pending" | "payment_pending" | "no_driver" | "low_delivery" | "wedding_soon";
  groomUid: string;
  groomUsername: string;
  detail: number | null;
}

/** Triage: the "needs attention" queue, each item actionable from an admin tab. */
export function composeTriage(
  users: AnyRec[],
  guests: AnyRec[],
  designs: AnyRec[],
  driverAssignments: AnyRec,
  now: number,
) {
  const usernameOf = new Map<string, string>();
  for (const u of users) {
    if (typeof u.uid === "string") usernameOf.set(u.uid, username(u));
  }
  const nameFor = (uid: unknown): string => {
    const k = typeof uid === "string" ? uid : "";
    return usernameOf.get(k) ?? (k ? k.slice(0, 6) : "—");
  };

  // Grooms that have at least one driver assigned (invert driverAssignments).
  const groomsWithDriver = new Set<string>();
  for (const driverUid of Object.keys(driverAssignments ?? {})) {
    const groomsMap = (driverAssignments[driverUid] ?? {}) as AnyRec;
    for (const groomUid of Object.keys(groomsMap)) {
      if (groomsMap[groomUid]) groomsWithDriver.add(groomUid);
    }
  }

  // Per-groom delivery counts.
  const perGroom = new Map<string, { total: number; delivered: number }>();
  for (const g of guests) {
    const k = typeof g.groomUid === "string" ? g.groomUid : "";
    if (!k) continue;
    const e = perGroom.get(k) ?? { total: 0, delivered: 0 };
    e.total++;
    if (g.status === "delivered") e.delivered++;
    perGroom.set(k, e);
  }

  const items: TriageItem[] = [];

  // Designs awaiting admin approval (highest-value: blocks the groom).
  for (const d of designs) {
    if (d.designStatus === "pending_approval") {
      items.push({ type: "design_pending", groomUid: String(d.groomUid ?? ""), groomUsername: nameFor(d.groomUid), detail: null });
    }
  }
  // Grooms with a payment link created but not yet paid.
  for (const u of users) {
    if (u.role === "groom" && u.paymentStatus === "pending") {
      items.push({ type: "payment_pending", groomUid: String(u.uid ?? ""), groomUsername: username(u), detail: num(u.paymentAmountIls) || null });
    }
  }
  // Grooms who have guests but no driver assigned.
  for (const [groomUid, stats] of perGroom) {
    if (stats.total > 0 && !groomsWithDriver.has(groomUid)) {
      items.push({ type: "no_driver", groomUid, groomUsername: nameFor(groomUid), detail: stats.total });
    }
  }
  // Grooms with ≥5 guests and under half delivered.
  for (const [groomUid, stats] of perGroom) {
    if (stats.total >= 5 && stats.delivered / stats.total < 0.5) {
      items.push({ type: "low_delivery", groomUid, groomUsername: nameFor(groomUid), detail: Math.round((stats.delivered / stats.total) * 100) });
    }
  }
  // Weddings within 14 days (dedup per groom — a groom may own several designs).
  const seenSoon = new Set<string>();
  for (const d of designs) {
    const wd = weddingMs(d.weddingDate);
    const groomUid = String(d.groomUid ?? "");
    if (wd && wd > now && wd - now <= 14 * DAY_MS && groomUid && !seenSoon.has(groomUid)) {
      seenSoon.add(groomUid);
      items.push({ type: "wedding_soon", groomUid, groomUsername: nameFor(groomUid), detail: Math.ceil((wd - now) / DAY_MS) });
    }
  }

  const summary: Record<TriageItem["type"], number> = {
    design_pending: 0, payment_pending: 0, no_driver: 0, low_delivery: 0, wedding_soon: 0,
  };
  for (const it of items) summary[it.type]++;

  return { items: items.slice(0, 200), summary, total: items.length };
}

/** Time-series trends over the selected window. No delivery line (deliveredAt
 *  is a string, not a timestamp). */
export function composeTrends(
  users: AnyRec[],
  confirmations: AnyRec[],
  inviteTokens: AnyRec[],
  startMs: number,
  endMs: number,
  stepMs: number,
) {
  const series = (ts: Array<number | null>) => bucketSeries(ts, startMs, endMs, stepMs);
  return {
    startMs,
    endMs,
    stepMs,
    signups: series(users.map((u) => posTs(u.createdAt))),
    payments: series(users.filter((u) => u.paymentStatus === "paid").map((u) => posTs(u.paymentPaidAt))),
    confirmations: series(confirmations.map((c) => posTs(c.confirmedAt))),
    invitesCreated: series(inviteTokens.map((t) => posTs(t.createdAt))),
  };
}

// ─── Orchestrator ───────────────────────────────────────────────────────────────

export interface AnalyticsInput {
  users: AnyRec[];
  guests: AnyRec[];
  confirmations: AnyRec[];
  inviteTokens: AnyRec[];
  driverAssignments: AnyRec;
  designs: AnyRec[];
  digitalGuests: AnyRec[];
  /** Windowed guest-experience rollups (metricsDaily). Bounded by the query in
   *  admin.ts — never a raw per-load scan. Optional: a deployment with no
   *  timing data yet (or a caller that doesn't need the section) still builds a
   *  complete payload, with the timing fields reported as null rather than 0. */
  metricsDaily?: AnyRec[];
  window: unknown;
  now: number;
}

/** Build the full analytics payload from raw records. Pure — safe to unit-test. */
export function buildAnalytics(input: AnalyticsInput) {
  const w = normalizeWindow(input.window);
  const { spanMs, stepMs } = WINDOWS[w];
  const endMs = input.now;
  const startMs = input.now - spanMs;
  return {
    generatedAt: input.now,
    window: w,
    composition: composeComposition(input.users),
    revenue: composeRevenue(input.users),
    operations: composeOperations(input.guests),
    rsvp: composeRsvp(input.guests, input.confirmations, input.digitalGuests),
    designs: composeDesigns(input.designs),
    triage: composeTriage(input.users, input.guests, input.designs, input.driverAssignments, input.now),
    trends: composeTrends(input.users, input.confirmations, input.inviteTokens, startMs, endMs, stepMs),
    digitalEngagement: composeDigitalEngagement(input.digitalGuests, input.inviteTokens),
    templateMetrics: composeTemplateMetrics(input.digitalGuests, input.inviteTokens, input.metricsDaily ?? []),
    weddingEngagement: composeWeddingEngagement(input.digitalGuests, input.users),
    demoEngagement: composeDemoEngagement(input.metricsDaily ?? [], startMs, endMs, stepMs),
  };
}
