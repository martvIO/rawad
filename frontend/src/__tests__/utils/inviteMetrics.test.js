import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// web-vitals is imported lazily inside the recorder; stub it so the tests don't
// depend on real LCP/CLS/INP observers firing.
const vitalsCbs = {};
vi.mock("web-vitals", () => ({
  onLCP: (cb) => { vitalsCbs.lcp = cb; },
  onCLS: (cb) => { vitalsCbs.cls = cb; },
  onINP: (cb) => { vitalsCbs.inp = cb; },
}));

const { createInviteMetrics } = await import("../../utils/inviteMetrics.js");

// Every recorder subscribes to pagehide/visibilitychange. Track them so each
// test disposes its own — otherwise a leaked recorder from an earlier test also
// answers this test's pagehide and inflates the counts.
const live = [];
const make = (opts) => {
  const m = createInviteMetrics(opts);
  live.push(m);
  return m;
};

// Decode the JSON bodies handed to fetch().
const sent = () =>
  fetch.mock.calls.map(([, init]) => JSON.parse(init.body));
const phases = () => sent().map((b) => b.phase);

describe("createInviteMetrics", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true })));
    vi.useFakeTimers();
    for (const k of Object.keys(vitalsCbs)) delete vitalsCbs[k];
  });
  afterEach(() => {
    while (live.length) live.pop().dispose();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not send anything before the page is ready", () => {
    make({ token: "t1", surface: "guest", templateId: "classic" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the load phase once ready, with the identifying fields", () => {
    const m = make({ token: "t1", surface: "guest", templateId: "classic", lang: "ar" });
    m.handleIntroEvent("sealed");
    m.handleIntroEvent("ready");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain("/invites/digital/metrics");
    expect(init.keepalive).toBe(true);
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ token: "t1", surface: "guest", templateId: "classic", phase: "load", lang: "ar" });
    expect(typeof body.loadId).toBe("string");
    expect(typeof body.t.sealedMs).toBe("number");
    expect(typeof body.t.readyMs).toBe("number");
  });

  it("sends the load phase only ONCE even if ready fires repeatedly", () => {
    const m = make({ token: "t1", surface: "guest", templateId: "classic" });
    m.handleIntroEvent("ready");
    m.handleIntroEvent("ready");
    m.handleIntroEvent("ready");
    expect(phases().filter((p) => p === "load")).toHaveLength(1);
  });

  it("falls back to sending the load phase if ready never arrives", () => {
    make({ token: "t1", surface: "guest", templateId: "classic" });
    expect(fetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(15000);
    expect(phases()).toEqual(["load"]);
  });

  it("measures tap delay from the sealed screen, not from navigation", () => {
    const nowSpy = vi.spyOn(performance, "now");
    nowSpy.mockReturnValue(1000); // sealed at 1000ms
    const m = make({ token: "t1", surface: "guest", templateId: "classic" });
    m.handleIntroEvent("sealed");
    nowSpy.mockReturnValue(4500); // tapped at 4500ms
    m.handleIntroEvent("open", { kind: "tap" });
    m.handleIntroEvent("ready");
    const body = sent()[0];
    expect(body.t.tapDelayMs).toBe(3500); // 4500 - 1000, NOT 4500
    expect(body.t.tapKind).toBe("tap");
    nowSpy.mockRestore();
  });

  it("records HOW it opened — an auto-open is never counted as a tap", () => {
    const m = make({ token: "t1", surface: "guest", templateId: "classic" });
    m.handleIntroEvent("sealed");
    m.handleIntroEvent("open", { kind: "auto" });
    m.handleIntroEvent("ready");
    expect(sent()[0].t.tapKind).toBe("auto");
  });

  it("keeps the FIRST open kind (a later event can't overwrite it)", () => {
    const m = make({ token: "t1", surface: "guest", templateId: "classic" });
    m.handleIntroEvent("sealed");
    m.handleIntroEvent("open", { kind: "tap" });
    m.handleIntroEvent("open", { kind: "auto" });
    m.handleIntroEvent("ready");
    expect(sent()[0].t.tapKind).toBe("tap");
  });

  it("omits tapDelayMs when there was no sealed screen to measure from", () => {
    const m = make({ token: "t1", surface: "guest", templateId: "classic" });
    m.handleIntroEvent("open", { kind: "seen" }); // return visit — revealed instantly
    m.handleIntroEvent("ready");
    const body = sent()[0];
    expect(body.t.tapKind).toBe("seen");
    expect(body.t.tapDelayMs).toBeUndefined();
  });

  it("sends the final phase with the vitals on pagehide, exactly once", async () => {
    const m = make({ token: "t1", surface: "guest", templateId: "classic" });
    // web-vitals is import()ed lazily — wait for it, otherwise the callbacks
    // below would not be registered yet and this test would pass vacuously.
    await vi.dynamicImportSettled();
    m.handleIntroEvent("ready");
    vitalsCbs.lcp({ value: 2400.7 });
    vitalsCbs.cls({ value: 0.0523 });
    vitalsCbs.inp({ value: 180 });
    window.dispatchEvent(new Event("pagehide"));
    window.dispatchEvent(new Event("pagehide")); // must not double-send
    const finals = sent().filter((b) => b.phase === "final");
    expect(finals).toHaveLength(1);
    expect(finals[0].t).toMatchObject({ lcpMs: 2401, cls: 0.052, inpMs: 180 });
  });

  // The invariant the server's histograms depend on: one visit must contribute
  // each metric exactly once, or every percentile is silently double-counted.
  it("sends each metric exactly once across the two phases", async () => {
    const m = make({ token: "t1", surface: "guest", templateId: "classic" });
    await vi.dynamicImportSettled();
    m.handleIntroEvent("sealed");
    m.handleIntroEvent("open", { kind: "tap" });
    m.handleIntroEvent("ready");
    vitalsCbs.lcp({ value: 1200 });
    vitalsCbs.cls({ value: 0.02 });
    vitalsCbs.inp({ value: 90 });
    window.dispatchEvent(new Event("pagehide"));

    const [load, final] = sent();
    // Load owns the load timings...
    expect(load.t).toHaveProperty("sealedMs");
    expect(load.t).toHaveProperty("readyMs");
    // ...and must not repeat them in the final payload.
    expect(final.t).not.toHaveProperty("sealedMs");
    expect(final.t).not.toHaveProperty("readyMs");
    expect(final.t).not.toHaveProperty("ttfbMs");
    // Final owns the vitals, which are absent from the load payload.
    expect(final.t).toMatchObject({ lcpMs: 1200, cls: 0.02, inpMs: 90 });
    expect(load.t).not.toHaveProperty("lcpMs");
    // The tap was known at load time → reported there, never again.
    expect(load.t.tapKind).toBe("tap");
    expect(final.t).not.toHaveProperty("tapKind");
  });

  it("reports a tap that happens AFTER load in the final phase, once", async () => {
    const m = make({ token: "t1", surface: "guest", templateId: "classic" });
    await vi.dynamicImportSettled();
    m.handleIntroEvent("sealed");
    m.handleIntroEvent("ready"); // load sent before the guest taps
    m.handleIntroEvent("open", { kind: "tap" });
    window.dispatchEvent(new Event("pagehide"));
    const [load, final] = sent();
    expect(load.t).not.toHaveProperty("tapKind");
    expect(final.t.tapKind).toBe("tap");
  });

  it("still reports a very short visit that hides before ready", () => {
    make({ token: "t1", surface: "guest", templateId: "classic" });
    window.dispatchEvent(new Event("pagehide"));
    // The load phase must be flushed alongside the final one, not lost.
    expect(phases()).toEqual(["load", "final"]);
  });

  it("tags demo traffic with its own surface so it can be kept out of guest stats", () => {
    const m = make({ token: "demo-abc", surface: "demo", templateId: "destination-love" });
    m.handleIntroEvent("ready");
    expect(sent()[0]).toMatchObject({ surface: "demo", templateId: "destination-love" });
  });

  it("never throws when the transport fails", () => {
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("network down"); }));
    vi.stubGlobal("navigator", { sendBeacon: vi.fn(() => { throw new Error("nope"); }) });
    const m = make({ token: "t1", surface: "guest", templateId: "classic" });
    expect(() => m.handleIntroEvent("ready")).not.toThrow();
  });

  it("stops reporting after dispose", () => {
    const m = make({ token: "t1", surface: "guest", templateId: "classic" });
    m.handleIntroEvent("ready");
    const before = fetch.mock.calls.length;
    m.dispose();
    window.dispatchEvent(new Event("pagehide"));
    m.handleIntroEvent("open", { kind: "tap" });
    // dispose flushes the final phase; nothing may follow it.
    const after = fetch.mock.calls.length;
    expect(after).toBeLessThanOrEqual(before + 1);
    const post = fetch.mock.calls.length;
    window.dispatchEvent(new Event("pagehide"));
    expect(fetch.mock.calls.length).toBe(post);
  });
});
