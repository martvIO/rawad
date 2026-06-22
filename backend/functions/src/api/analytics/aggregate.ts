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
  };
}
