// Unit tests for the admin-analytics pure aggregation helpers. These cover the
// math (counts, rates, headcount, funnels, time-to-pay, bucketing, triage) with
// no emulator — the route's data-reading is an integration concern; the numbers
// are what must be correct (and never NaN / divide-by-zero).
import { describe, it, expect } from "vitest";
import {
  buildAnalytics,
  bucketSeries,
  composeComposition,
  composeRevenue,
  composeOperations,
  composeRsvp,
  composeDesigns,
  composeTriage,
  normalizeWindow,
} from "../../functions/src/api/analytics/aggregate";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

describe("normalizeWindow", () => {
  it("accepts 30d/90d/all and defaults the rest to 30d", () => {
    expect(normalizeWindow("90d")).toBe("90d");
    expect(normalizeWindow("all")).toBe("all");
    expect(normalizeWindow("30d")).toBe("30d");
    expect(normalizeWindow(undefined)).toBe("30d");
    expect(normalizeWindow("garbage")).toBe("30d");
  });
});

describe("bucketSeries", () => {
  it("buckets timestamps and ignores out-of-range / non-finite", () => {
    const start = NOW - 3 * DAY;
    const out = bucketSeries(
      [NOW - 2.5 * DAY, NOW - 2.4 * DAY, NOW - 0.5 * DAY, NOW + DAY, null, NaN],
      start, NOW, DAY,
    );
    expect(out).toHaveLength(3);
    expect(out[0].count).toBe(2); // two in the first day bucket
    expect(out[2].count).toBe(1); // one in the last day bucket
    // NOW + DAY (future) and null/NaN are dropped.
    expect(out.reduce((s, b) => s + b.count, 0)).toBe(3);
  });
});

describe("composeComposition", () => {
  it("counts users by role", () => {
    const c = composeComposition([
      { uid: "a", role: "admin" },
      { uid: "g1", role: "groom" },
      { uid: "g2", role: "groom" },
      { uid: "d1", role: "driver" },
      { uid: "x", role: "weird" },
    ]);
    expect(c).toMatchObject({ totalUsers: 5, grooms: 2, drivers: 1, admins: 1 });
  });
});

describe("composeRevenue", () => {
  it("sums paid revenue, plan mix, funnel, ARPU and avg time-to-pay", () => {
    const users = [
      { uid: "g1", role: "groom", paymentStatus: "paid", paymentPlan: "premium", paymentAmountIls: 2500, paymentCreatedAt: NOW, paymentPaidAt: NOW + 2 * DAY },
      { uid: "g2", role: "groom", paymentStatus: "paid", paymentPlan: "vip", paymentAmountIls: 3500, paymentCreatedAt: NOW, paymentPaidAt: NOW + 4 * DAY },
      { uid: "g3", role: "groom", paymentStatus: "pending" },
      { uid: "g4", role: "groom" }, // none
      { uid: "d1", role: "driver" }, // drivers excluded
    ];
    const r = composeRevenue(users);
    expect(r.totalRevenueIls).toBe(6000);
    expect(r.paidCount).toBe(2);
    expect(r.pendingCount).toBe(1);
    expect(r.noneCount).toBe(1);
    expect(r.failedCount).toBe(0);
    expect(r.planMix).toEqual({ premium: 1, vip: 1 });
    expect(r.funnel).toEqual([
      { stage: "none", count: 1 },
      { stage: "pending", count: 1 },
      { stage: "paid", count: 2 },
    ]);
    expect(r.arpuIls).toBe(3000);
    expect(r.avgTimeToPayMs).toBe(3 * DAY); // (2d + 4d) / 2
  });

  it("falls back to plan amount when paymentAmountIls is missing, guards /0", () => {
    const r = composeRevenue([
      { uid: "g1", role: "groom", paymentStatus: "paid", paymentPlan: "vip" },
    ]);
    expect(r.totalRevenueIls).toBe(2000);
    expect(r.arpuIls).toBe(2000);
    const empty = composeRevenue([]);
    expect(empty.arpuIls).toBe(0);
    expect(empty.avgTimeToPayMs).toBeNull();
  });
});

describe("composeOperations", () => {
  it("breaks down delivery outcomes, %, proof rate, and driver leaderboard", () => {
    const guests = [
      { status: "delivered", deliveredBy: "Ali", proofPhotoPath: "p1" },
      { status: "delivered", deliveredBy: "Ali", proofPhotoPath: "p2" },
      { status: "delivered", deliveredBy: "Sam" }, // no proof
      { status: "pending" },
      { status: "refused" },
      { status: "weird" }, // coerced to pending
    ];
    const o = composeOperations(guests);
    expect(o.totalGuests).toBe(6);
    expect(o.delivered).toBe(3);
    expect(o.deliveryPct).toBe(50);
    expect(o.outcomeBreakdown.pending).toBe(2); // explicit + coerced
    expect(o.outcomeBreakdown.refused).toBe(1);
    expect(o.proofPhotoRatePct).toBe(67); // 2 of 3 delivered have proof
    expect(o.driverLeaderboard[0]).toEqual({ name: "Ali", count: 2 });
  });

  it("guards empty data", () => {
    const o = composeOperations([]);
    expect(o.deliveryPct).toBe(0);
    expect(o.proofPhotoRatePct).toBe(0);
    expect(o.driverLeaderboard).toEqual([]);
  });
});

describe("composeRsvp", () => {
  it("counts invites/confirmed, headcount from confirmations, digital mix", () => {
    const guests = [
      { inviteLinkSentAt: NOW, confirmedAt: NOW + DAY },
      { inviteLinkSentAt: NOW },
      {},
    ];
    const confirmations = [
      { companions: 2 }, // 3 heads
      { companions: 0 }, // 1 head
      {},                // 1 head (missing companions)
    ];
    const digitalGuests = [
      { status: "attending", viewedAt: NOW }, { status: "attending", viewedAt: NOW },
      { status: "absent" }, { status: "pending" }, {},
    ];
    const r = composeRsvp(guests, confirmations, digitalGuests);
    expect(r.invitesSent).toBe(2);
    expect(r.confirmedGuests).toBe(1);
    expect(r.rsvps).toBe(3);
    expect(r.rsvpRatePct).toBe(50); // 1 confirmed of 2 sent
    expect(r.expectedHeadcount).toBe(5); // 3 + 1 + 1
    expect(r.digital).toEqual({ attending: 2, absent: 1, pending: 2 });
    expect(r.digitalOpened).toBe(2); // 2 of 5 have viewedAt
    expect(r.digitalOpenRatePct).toBe(40);
  });
});

describe("composeDesigns", () => {
  it("aggregates status mix, distinct grooms, throughput, avg pending→approved", () => {
    const designs = [
      { groomUid: "g1", designStatus: "approved", designSubmittedAt: NOW, designApprovedAt: NOW + 1 * DAY },
      { groomUid: "g1", designStatus: "draft" },
      { groomUid: "g2", designStatus: "pending_approval", designSubmittedAt: NOW },
      { groomUid: "g3", designStatus: "rejected", designSubmittedAt: NOW, designRejectedAt: NOW + 2 * DAY },
      { groomUid: "g4", designStatus: "approved", designSubmittedAt: NOW, designApprovedAt: NOW + 3 * DAY },
    ];
    const d = composeDesigns(designs);
    expect(d.byStatus).toEqual({ draft: 1, pending_approval: 1, approved: 2, rejected: 1 });
    expect(d.totalDesigns).toBe(5);
    expect(d.groomsWithDesigns).toBe(4);
    expect(d.submitted).toBe(4);
    expect(d.approvals).toBe(2);
    expect(d.rejections).toBe(1);
    expect(d.avgPendingToApprovedMs).toBe(2 * DAY); // (1d + 3d) / 2
  });
});

describe("composeTriage", () => {
  it("flags design_pending, payment_pending, no_driver, low_delivery, wedding_soon", () => {
    const users = [
      { uid: "g1", role: "groom", username: "groom_one", paymentStatus: "pending", paymentAmountIls: 2500 },
      { uid: "g2", role: "groom", username: "groom_two" },
      { uid: "g3", role: "groom", username: "groom_three" },
    ];
    const guests = [
      // g1 has 6 guests, 1 delivered → low delivery, and no driver assigned.
      ...Array.from({ length: 6 }, (_v, i) => ({ groomUid: "g1", status: i === 0 ? "delivered" : "pending" })),
      // g2 has 2 guests, has a driver → no low_delivery, no no_driver.
      { groomUid: "g2", status: "delivered" },
      { groomUid: "g2", status: "pending" },
    ];
    const designs = [
      { groomUid: "g2", designStatus: "pending_approval" },
      { groomUid: "g3", designStatus: "approved", weddingDate: NOW + 5 * DAY },
    ];
    const driverAssignments = { driverA: { g2: true } };
    const t = composeTriage(users, guests, designs, driverAssignments, NOW);

    expect(t.summary.design_pending).toBe(1);
    expect(t.summary.payment_pending).toBe(1);
    expect(t.summary.no_driver).toBe(1); // g1 only (g2 has driverA)
    expect(t.summary.low_delivery).toBe(1); // g1: 1/6 < 50%
    expect(t.summary.wedding_soon).toBe(1); // g3 in 5 days

    const noDriver = t.items.find((i) => i.type === "no_driver");
    expect(noDriver?.groomUid).toBe("g1");
    expect(noDriver?.groomUsername).toBe("groom_one");

    const soon = t.items.find((i) => i.type === "wedding_soon");
    expect(soon?.detail).toBe(5); // days away
  });
});

describe("buildAnalytics", () => {
  it("returns a complete, NaN-free payload on empty data", () => {
    const out = buildAnalytics({
      users: [], guests: [], confirmations: [], inviteTokens: [],
      driverAssignments: {}, designs: [], digitalGuests: [], window: "bad", now: NOW,
    });
    expect(out.window).toBe("30d");
    expect(out.generatedAt).toBe(NOW);
    expect(out.composition.totalUsers).toBe(0);
    expect(out.revenue.totalRevenueIls).toBe(0);
    expect(out.revenue.arpuIls).toBe(0);
    expect(out.operations.deliveryPct).toBe(0);
    expect(out.rsvp.rsvpRatePct).toBe(0);
    expect(out.designs.totalDesigns).toBe(0);
    expect(out.triage.total).toBe(0);
    expect(out.trends.signups.length).toBeGreaterThan(0);
    // Nothing should serialize to NaN.
    expect(JSON.stringify(out)).not.toContain("null,\"count\":NaN");
    expect(JSON.stringify(out)).not.toContain("NaN");
  });

  it("respects the window for trend bucket width", () => {
    const out30 = buildAnalytics({
      users: [], guests: [], confirmations: [], inviteTokens: [],
      driverAssignments: {}, designs: [], digitalGuests: [], window: "30d", now: NOW,
    });
    const outAll = buildAnalytics({
      users: [], guests: [], confirmations: [], inviteTokens: [],
      driverAssignments: {}, designs: [], digitalGuests: [], window: "all", now: NOW,
    });
    expect(out30.trends.stepMs).toBe(DAY);
    expect(outAll.trends.stepMs).toBe(7 * DAY);
  });
});
