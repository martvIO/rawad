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

  // Regression (found in a real browser): "ready" and "sealed" come from sibling
  // subtrees and fire in TREE order, so "ready" reliably lands a few ms BEFORE
  // "sealed". Sending synchronously on "ready" shipped every load report with
  // sealedMs missing — silently losing one of the two headline load metrics.
  it("still captures sealedMs when 'sealed' arrives AFTER 'ready'", () => {
    const m = make({ token: "t1", surface: "guest", templateId: "classic" });
    m.handleIntroEvent("ready", { at: 365 });
    expect(fetch).not.toHaveBeenCalled(); // must not send synchronously
    m.handleIntroEvent("sealed", { at: 376 }); // the real-world ordering
    vi.advanceTimersByTime(250);
    expect(sent()[0].t).toMatchObject({ readyMs: 365, sealedMs: 376 });
  });

  it("flushes the settling load phase immediately if the visit ends first", () => {
    const m = make({ token: "t1", surface: "guest", templateId: "classic" });
    m.handleIntroEvent("ready", { at: 100 });
    m.handleIntroEvent("sealed", { at: 110 });
    window.dispatchEvent(new Event("pagehide")); // before the settle timer fires
    expect(phases()).toEqual(["load", "final"]);
    expect(sent()[0].t.sealedMs).toBe(110);
  });

  it("sends the load phase once ready, with the identifying fields", () => {
    const m = make({ token: "t1", surface: "guest", templateId: "classic", lang: "ar" });
    m.handleIntroEvent("sealed");
    m.handleIntroEvent("ready");
    vi.advanceTimersByTime(250);
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
    vi.advanceTimersByTime(250);
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
    vi.advanceTimersByTime(250);
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
    vi.advanceTimersByTime(250);
    expect(sent()[0].t.tapKind).toBe("auto");
  });

  it("keeps the FIRST open kind (a later event can't overwrite it)", () => {
    const m = make({ token: "t1", surface: "guest", templateId: "classic" });
    m.handleIntroEvent("sealed");
    m.handleIntroEvent("open", { kind: "tap" });
    m.handleIntroEvent("open", { kind: "auto" });
    m.handleIntroEvent("ready");
    vi.advanceTimersByTime(250);
    expect(sent()[0].t.tapKind).toBe("tap");
  });

  it("omits tapDelayMs when there was no sealed screen to measure from", () => {
    const m = make({ token: "t1", surface: "guest", templateId: "classic" });
    m.handleIntroEvent("open", { kind: "seen" }); // return visit — revealed instantly
    m.handleIntroEvent("ready");
    vi.advanceTimersByTime(250);
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
    vi.advanceTimersByTime(250);
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
    vi.advanceTimersByTime(250);
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
    vi.advanceTimersByTime(250);
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

  // Regression: React runs child effects before parent effects, so a template
  // emits "sealed" before the page can wire the recorder. The page buffers those
  // events with their ORIGINAL timestamp and replays them. If the recorder
  // ignored `at`, the replay would stamp the sealed screen at replay time and
  // sealedMs would be wrong (or, before the buffer existed, missing entirely).
  it("honours a replayed event's original timestamp instead of the replay time", () => {
    const nowSpy = vi.spyOn(performance, "now");
    nowSpy.mockReturnValue(5000); // the recorder is created late…
    const m = make({ token: "t1", surface: "guest", templateId: "classic" });
    // …replaying a "sealed" that really happened at 400ms.
    m.handleIntroEvent("sealed", { at: 400 });
    m.handleIntroEvent("open", { kind: "tap", at: 2400 });
    m.handleIntroEvent("ready", { at: 800 });
    vi.advanceTimersByTime(250);
    const body = sent()[0];
    expect(body.t.sealedMs).toBe(400); // not 5000
    expect(body.t.readyMs).toBe(800);
    expect(body.t.tapDelayMs).toBe(2000); // 2400 − 400
    nowSpy.mockRestore();
  });

  it("falls back to the current time when no timestamp is supplied", () => {
    const nowSpy = vi.spyOn(performance, "now");
    nowSpy.mockReturnValue(1234);
    const m = make({ token: "t1", surface: "guest", templateId: "classic" });
    m.handleIntroEvent("sealed");
    m.handleIntroEvent("ready");
    vi.advanceTimersByTime(250);
    expect(sent()[0].t.sealedMs).toBe(1234);
    nowSpy.mockRestore();
  });

  it("tags demo traffic with its own surface so it can be kept out of guest stats", () => {
    const m = make({ token: "demo-abc", surface: "demo", templateId: "destination-love" });
    m.handleIntroEvent("ready");
    vi.advanceTimersByTime(250);
    expect(sent()[0]).toMatchObject({ surface: "demo", templateId: "destination-love" });
  });

  // Regression: the demo page's synthetic token ("demo-0ae918a0") is NOT a
  // 32-hex invite token, so the endpoint's zod check rejected the entire report
  // with a 400 — every demo/gallery metric was silently lost. The recorder now
  // strips it, so no call site can reintroduce the failure.
  it("never sends a token on a non-guest surface (the server would 400 the report)", () => {
    const TOKEN_HEX_RE = /^[a-f0-9]{32}$/; // mirrors backend constants/tokens.ts
    for (const surface of ["demo", "gallery"]) {
      fetch.mockClear();
      const m = make({ token: "demo-0ae918a0", surface, templateId: "classic" });
      m.handleIntroEvent("ready");
      vi.advanceTimersByTime(250);
      const body = sent()[0];
      expect(body.surface).toBe(surface);
      expect(body.token).toBeUndefined();
      // Whatever is sent must satisfy the server's token contract.
      expect(body.token === undefined || TOKEN_HEX_RE.test(body.token)).toBe(true);
    }
  });

  it("still sends a real 32-hex token on the guest surface", () => {
    const real = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
    const m = make({ token: real, surface: "guest", templateId: "classic" });
    m.handleIntroEvent("ready");
    vi.advanceTimersByTime(250);
    expect(sent()[0].token).toBe(real);
  });

  it("never throws when the transport fails", () => {
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("network down"); }));
    vi.stubGlobal("navigator", { sendBeacon: vi.fn(() => { throw new Error("nope"); }) });
    const m = make({ token: "t1", surface: "guest", templateId: "classic" });
    expect(() => { m.handleIntroEvent("ready"); vi.advanceTimersByTime(250); }).not.toThrow();
  });

  it("stops reporting after dispose", () => {
    const m = make({ token: "t1", surface: "guest", templateId: "classic" });
    m.handleIntroEvent("ready");
    vi.advanceTimersByTime(250);
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
