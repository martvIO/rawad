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

// ─── Guest-experience engagement (funnel + per-template + per-wedding + demo) ──
// These pin the two things most likely to be got wrong and never noticed:
// (1) prospect/demo traffic leaking into a couple's real numbers, and
// (2) an auto-open or a return visit being counted as a guest "tap".
import {
  composeDigitalEngagement,
  composeTemplateMetrics,
  composeWeddingEngagement,
  composeDemoEngagement,
  buildTokenTemplateMap,
} from "../../functions/src/api/analytics/aggregate";

const dg = (over = {}) => ({ groomUid: "g1", id: "gu1", ...over });
const tok = (over = {}) => ({ guestType: "digital", groomUid: "g1", guestId: "gu1", ...over });

describe("buildTokenTemplateMap", () => {
  it("maps a digital guest to the template its token was MINTED with", () => {
    const m = buildTokenTemplateMap([tok({ designSnapshot: { templateId: "destination-love" } })]);
    expect(m.get("g1/gu1")).toBe("destination-love");
  });

  it("treats a pre-template token as classic (what the renderer falls back to)", () => {
    expect(buildTokenTemplateMap([tok({ designSnapshot: {} })]).get("g1/gu1")).toBe("classic");
    expect(buildTokenTemplateMap([tok()]).get("g1/gu1")).toBe("classic");
  });

  it("ignores physical tokens", () => {
    expect(buildTokenTemplateMap([tok({ guestType: "physical" })]).size).toBe(0);
  });
});

describe("composeDigitalEngagement", () => {
  it("counts the sent → opened → submitted funnel from first-party stamps", () => {
    const out = composeDigitalEngagement(
      [
        dg({ id: "a", inviteLinkSentAt: 10, viewedAt: 20, confirmedAt: 30, status: "attending" }),
        dg({ id: "b", inviteLinkSentAt: 10, viewedAt: 20, confirmedAt: 30, status: "absent" }),
        dg({ id: "c", inviteLinkSentAt: 10, viewedAt: 20 }), // opened, no answer
        dg({ id: "d", inviteLinkSentAt: 10 }), // never opened
      ],
      [],
    );
    expect(out.funnel).toMatchObject({
      sent: 4, opened: 3, submitted: 2, attending: 1, absent: 1, openedNoAnswer: 1, neverOpened: 1,
    });
    expect(out.openRatePct).toBe(75); // 3/4
    expect(out.completionRatePct).toBe(50); // 2/4 — an "absent" IS a completed form
    expect(out.answerRateOfOpenedPct).toBe(67); // 2/3
  });

  it("does not count a never-sent guest as neverOpened", () => {
    // A guest sitting in the list who was never sent a link is not a reach
    // failure — counting them would make the number look bad for no reason.
    const out = composeDigitalEngagement([dg({ id: "x" })], []);
    expect(out.funnel.neverOpened).toBe(0);
    expect(out.funnel.sent).toBe(0);
  });

  it("measures send → first-visit lag", () => {
    const out = composeDigitalEngagement(
      [
        dg({ id: "a", inviteLinkSentAt: 1000, viewedAt: 3000 }),
        dg({ id: "b", inviteLinkSentAt: 1000, viewedAt: 5000 }),
      ],
      [],
    );
    expect(out.sendToOpenLagMs.n).toBe(2);
    expect(out.sendToOpenLagMs.p50).toBe(2000);
  });

  it("ignores a viewedAt that precedes the send (clock skew), rather than a negative lag", () => {
    const out = composeDigitalEngagement([dg({ inviteLinkSentAt: 5000, viewedAt: 1000 })], []);
    expect(out.sendToOpenLagMs.n).toBe(0);
    expect(out.guestRows[0].lagMs).toBeNull();
  });

  it("counts ONLY a real tap in the tap-delay stat", () => {
    const out = composeDigitalEngagement(
      [
        dg({ id: "a", viewedAt: 1, perf: { tapKind: "tap", tapDelayMs: 3000 } }),
        dg({ id: "b", viewedAt: 1, perf: { tapKind: "auto", tapDelayMs: 5000 } }),
        dg({ id: "c", viewedAt: 1, perf: { tapKind: "seen" } }),
        dg({ id: "d", viewedAt: 1, perf: { tapKind: "failsafe", tapDelayMs: 20000 } }),
      ],
      [],
    );
    // An auto-open/failsafe delay is not a decision the guest made.
    expect(out.tapDelayMs.n).toBe(1);
    expect(out.tapDelayMs.p50).toBe(3000);
  });

  it("attributes each guest row to the template its token was sent with", () => {
    const out = composeDigitalEngagement(
      [dg({ viewedAt: 5 })],
      [tok({ designSnapshot: { templateId: "destination-love" } })],
    );
    expect(out.guestRows[0].templateId).toBe("destination-love");
  });

  it("caps the drill-down rows and reports how many were dropped", () => {
    const many = Array.from({ length: 130 }, (_v, i) => dg({ id: `g${i}`, viewedAt: i + 1 }));
    const out = composeDigitalEngagement(many, []);
    expect(out.guestRows).toHaveLength(100);
    expect(out.guestRowsTruncated).toBe(30);
    // Most recent first.
    expect(out.guestRows[0].viewedAt).toBe(130);
  });

  it("is NaN-free on empty data", () => {
    const out = composeDigitalEngagement([], []);
    expect(out.openRatePct).toBe(0);
    expect(out.completionRatePct).toBe(0);
    expect(out.tapDelayMs.p50).toBeNull();
    expect(JSON.stringify(out)).not.toContain("NaN");
  });
});

describe("composeTemplateMetrics", () => {
  const rollup = (over = {}) => ({ surface: "guest", templateId: "classic", day: 20260716, loads: 0, ...over });

  it("splits the funnel per template", () => {
    const out = composeTemplateMetrics(
      [
        dg({ id: "a", inviteLinkSentAt: 1, viewedAt: 2, confirmedAt: 3 }),
        dg({ id: "b", inviteLinkSentAt: 1 }),
      ],
      [
        tok({ guestId: "a", designSnapshot: { templateId: "destination-love" } }),
        tok({ guestId: "b", designSnapshot: { templateId: "classic" } }),
      ],
      [],
    );
    const dl = out.rows.find((r) => r.templateId === "destination-love")!;
    const cl = out.rows.find((r) => r.templateId === "classic")!;
    expect(dl).toMatchObject({ sent: 1, opened: 1, submitted: 1, openRatePct: 100, completionRatePct: 100 });
    expect(cl).toMatchObject({ sent: 1, opened: 0, submitted: 0, openRatePct: 0 });
  });

  it("computes load percentiles from the guest-surface histograms", () => {
    const out = composeTemplateMetrics([], [], [
      rollup({ templateId: "classic", loads: 4, hist: { sealed: { b0: 1, b1: 1, b2: 1, b3: 1 } } }),
    ]);
    const cl = out.rows.find((r) => r.templateId === "classic")!;
    expect(cl.loads).toBe(4);
    expect(cl.sealedP50).toBe(500);
    expect(cl.sealedP90).toBe(2000);
  });

  it("EXCLUDES demo traffic from a template's guest-facing timings", () => {
    const out = composeTemplateMetrics([], [], [
      rollup({ templateId: "classic", loads: 1, hist: { sealed: { b0: 1 } } }),
      rollup({ surface: "demo", templateId: "classic", loads: 999, hist: { sealed: { b8: 999 } } }),
    ]);
    const cl = out.rows.find((r) => r.templateId === "classic")!;
    // Only the single guest load counts; the 999 demo loads must not appear.
    expect(cl.loads).toBe(1);
    expect(cl.sealedP50).toBe(250);
  });

  it("reports the auto-open share — how often the guest did NOT tap", () => {
    const out = composeTemplateMetrics([], [], [
      rollup({ templateId: "classic", loads: 10, tapKinds: { tap: 3, auto: 7 } }),
    ]);
    expect(out.rows[0].autoOpenPct).toBe(70);
  });

  it("keeps a >30s template comparable instead of dropping it to null", () => {
    // The village-4G loading wall this feature exists to detect. If the tail read
    // as null, "which template is worst?" would skip it entirely.
    const out = composeTemplateMetrics([], [], [
      rollup({ templateId: "classic", loads: 5, hist: { sealed: { b8: 5 } } }),
    ]);
    expect(out.rows[0].sealedP90).toBe(30000);
  });

  it("returns null (not 0) for percentiles with no samples", () => {
    const out = composeTemplateMetrics([], [], [rollup({ templateId: "classic", loads: 0 })]);
    expect(out.rows[0].sealedP50).toBeNull();
    expect(out.rows[0].autoOpenPct).toBeNull();
    expect(out.rows[0].clsGoodPct).toBeNull();
  });

  it("merges a template's rollups across days", () => {
    const out = composeTemplateMetrics([], [], [
      rollup({ templateId: "classic", day: 20260716, loads: 1, hist: { sealed: { b0: 1 } } }),
      rollup({ templateId: "classic", day: 20260717, loads: 1, hist: { sealed: { b0: 1 } } }),
    ]);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].loads).toBe(2);
  });
});

describe("composeWeddingEngagement", () => {
  it("rolls the funnel up per groom with a readable username", () => {
    const out = composeWeddingEngagement(
      [
        { groomUid: "g1", id: "a", inviteLinkSentAt: 1, viewedAt: 2, confirmedAt: 3 },
        { groomUid: "g1", id: "b", inviteLinkSentAt: 1 },
        { groomUid: "g2", id: "c", inviteLinkSentAt: 1, viewedAt: 2 },
      ],
      [{ uid: "g1", username: "sally" }, { uid: "g2", username: "rani" }],
    );
    const g1 = out.rows.find((r) => r.groomUid === "g1")!;
    expect(g1).toMatchObject({ groomUsername: "sally", sent: 2, opened: 1, submitted: 1, openRatePct: 50 });
    expect(out.rows.find((r) => r.groomUid === "g2")!.groomUsername).toBe("rani");
  });

  it("is NaN-free and null-safe with no data", () => {
    const out = composeWeddingEngagement([], []);
    expect(out.rows).toEqual([]);
    expect(JSON.stringify(out)).not.toContain("NaN");
  });
});

describe("composeDemoEngagement", () => {
  const start = Date.UTC(2026, 6, 10);
  const end = Date.UTC(2026, 6, 20);

  it("counts ONLY prospect surfaces, never guest traffic", () => {
    const out = composeDemoEngagement(
      [
        { surface: "guest", templateId: "classic", day: 20260716, loads: 500 },
        { surface: "demo", templateId: "destination-love", day: 20260716, loads: 3 },
        { surface: "gallery", templateId: "all", day: 20260716, loads: 2 },
      ],
      start, end, DAY,
    );
    expect(out.totalLoads).toBe(5); // the 500 guest loads are excluded
    expect(out.bySurface).toEqual({ demo: 3, gallery: 2 });
    expect(out.byTemplate).toEqual([{ templateId: "destination-love", loads: 3 }]);
  });

  it("builds a daily series from the day keys", () => {
    const out = composeDemoEngagement(
      [{ surface: "demo", templateId: "classic", day: 20260716, loads: 2 }],
      start, end, DAY,
    );
    const hit = out.series.find((b) => b.count > 0);
    expect(hit?.count).toBe(2);
    expect(out.series.length).toBeGreaterThan(0);
  });

  it("sums multiple rollups landing on the same day bucket", () => {
    const out = composeDemoEngagement(
      [
        { surface: "demo", templateId: "classic", day: 20260716, loads: 2 },
        { surface: "demo", templateId: "destination-love", day: 20260716, loads: 3 },
        { surface: "gallery", templateId: "all", day: 20260716, loads: 1 },
      ],
      start, end, DAY,
    );
    expect(out.series.find((b) => b.count > 0)?.count).toBe(6);
  });

  // The series must cost O(rollup docs), not O(total loads) — expanding a day's
  // `loads` back into one entry each rebuilds the unbounded per-event list the
  // rollups exist to avoid, inside the analytics request.
  it("handles a huge daily load count without materializing per-load entries", () => {
    const t0 = Date.now();
    const out = composeDemoEngagement(
      [{ surface: "demo", templateId: "classic", day: 20260716, loads: 50_000_000 }],
      start, end, DAY,
    );
    expect(out.totalLoads).toBe(50_000_000);
    expect(out.series.find((b) => b.count > 0)?.count).toBe(50_000_000);
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it("is empty and NaN-free with no prospect traffic", () => {
    const out = composeDemoEngagement([], start, end, DAY);
    expect(out.totalLoads).toBe(0);
    expect(out.byTemplate).toEqual([]);
    expect(out.sealedP50).toBeNull();
    expect(JSON.stringify(out)).not.toContain("NaN");
  });
});
