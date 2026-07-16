// Tests for the shared sealed-tap intro contract (useIntroPhase) that every
// bespoke template's opening animation runs on. Pins the phase machine, the
// active=false instant-reveal (editor/admin preview), the tap→opening→done
// flow, skip, the return-visit fast path (localStorage), the escalating cue,
// and the stuck-screen failsafe.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIntroPhase } from "../../../../components/digital/templates/introContract.js";

const SEEN_KEY = (t) => `dawa-intro-seen:${t}`;

// jsdom lacks matchMedia — default it to "motion allowed" so open() animates.
beforeEach(() => {
  vi.useFakeTimers();
  try { globalThis.localStorage?.clear(); } catch { /* ignore */ }
  globalThis.matchMedia = vi.fn().mockReturnValue({ matches: false });
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useIntroPhase", () => {
  it("reveals immediately when inactive (editor/admin preview, no intro)", () => {
    const { result } = renderHook(() => useIntroPhase({ active: false, token: "t1" }));
    expect(result.current.phase).toBe("done");
    expect(result.current.revealed).toBe(true);
    expect(result.current.sealed).toBe(false);
  });

  it("starts sealed on a fresh active visit and does NOT auto-open", () => {
    const { result } = renderHook(() => useIntroPhase({ active: true, token: "t2" }));
    expect(result.current.phase).toBe("sealed");
    expect(result.current.revealed).toBe(false);
    // No auto-open: well past the cue-escalation window, still sealed.
    act(() => vi.advanceTimersByTime(10000));
    expect(result.current.phase).toBe("sealed");
    expect(result.current.cueEscalated).toBe(true);
  });

  it("tap → opening → done after the animation window, and marks the token seen", () => {
    const { result } = renderHook(() => useIntroPhase({ active: true, token: "t3", openMs: 2000 }));
    act(() => result.current.open());
    expect(result.current.phase).toBe("opening");
    expect(result.current.revealed).toBe(false);
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.phase).toBe("done");
    expect(result.current.revealed).toBe(true);
    expect(globalThis.localStorage.getItem(SEEN_KEY("t3"))).toBe("1");
  });

  it("skip() jumps straight to revealed", () => {
    const { result } = renderHook(() => useIntroPhase({ active: true, token: "t4" }));
    act(() => result.current.open());
    act(() => result.current.skip());
    expect(result.current.phase).toBe("done");
    expect(result.current.revealed).toBe(true);
  });

  it("reveals instantly on a return visit (token already seen) and exposes replay", () => {
    globalThis.localStorage.setItem(SEEN_KEY("t5"), "1");
    const { result } = renderHook(() => useIntroPhase({ active: true, token: "t5" }));
    expect(result.current.phase).toBe("done");
    expect(result.current.seenBefore).toBe(true);
    // replay re-seals so a return visitor can re-watch the opening.
    act(() => result.current.replay());
    expect(result.current.phase).toBe("sealed");
  });

  it("open() under reduced motion reveals with no animation window", () => {
    globalThis.matchMedia = vi.fn().mockReturnValue({ matches: true });
    const { result } = renderHook(() => useIntroPhase({ active: true, token: "t6" }));
    act(() => result.current.open());
    expect(result.current.phase).toBe("done");
  });

  it("failsafe force-reveals a stuck sealed screen (never traps the guest)", () => {
    const { result } = renderHook(() => useIntroPhase({ active: true, token: "t7" }));
    expect(result.current.phase).toBe("sealed");
    act(() => vi.advanceTimersByTime(20000));
    expect(result.current.phase).toBe("done");
  });
});

// ── Instrumentation seam (onEvent) ────────────────────────────────────────────
// Wired in the CONTRACT rather than per-template, so every bespoke template
// reports the same signals. These pin the guarantees the metrics depend on:
// exactly-once open reporting, and an honest `kind` for each way an invitation
// can open (a skip or a failsafe must never be counted as a guest tap).
describe("useIntroPhase — onEvent instrumentation", () => {
  it("reports the sealed screen on mount", () => {
    const onEvent = vi.fn();
    renderHook(() => useIntroPhase({ active: true, token: "e1", onEvent }));
    expect(onEvent).toHaveBeenCalledWith("sealed", {});
  });

  it("reports a real tap once, and only on a true sealed→open transition", () => {
    const onEvent = vi.fn();
    const { result } = renderHook(() => useIntroPhase({ active: true, token: "e2", onEvent }));
    act(() => result.current.open());
    act(() => result.current.open()); // double-tap must not double-count
    const opens = onEvent.mock.calls.filter(([e]) => e === "open");
    expect(opens).toEqual([["open", { kind: "tap" }]]);
  });

  it("reports a skip as a skip, never as a tap", () => {
    const onEvent = vi.fn();
    const { result } = renderHook(() => useIntroPhase({ active: true, token: "e3", onEvent }));
    act(() => result.current.skip());
    expect(onEvent.mock.calls.filter(([e]) => e === "open")).toEqual([["open", { kind: "skip" }]]);
  });

  it("reports the stuck-screen failsafe as a failsafe, never as a tap", () => {
    const onEvent = vi.fn();
    renderHook(() => useIntroPhase({ active: true, token: "e4", onEvent }));
    act(() => vi.advanceTimersByTime(20000));
    expect(onEvent.mock.calls.filter(([e]) => e === "open")).toEqual([["open", { kind: "failsafe" }]]);
  });

  it("reports a return visit as 'seen' (revealed instantly, no tap to measure)", () => {
    globalThis.localStorage.setItem(SEEN_KEY("e5"), "1");
    const onEvent = vi.fn();
    renderHook(() => useIntroPhase({ active: true, token: "e5", onEvent }));
    expect(onEvent).toHaveBeenCalledWith("open", { kind: "seen" });
    expect(onEvent).not.toHaveBeenCalledWith("sealed", {});
  });

  it("stays silent for an inactive preview (the editor never seals)", () => {
    const onEvent = vi.fn();
    renderHook(() => useIntroPhase({ active: false, token: "e6", onEvent }));
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("a throwing onEvent can never break the ritual", () => {
    const onEvent = vi.fn(() => { throw new Error("metrics exploded"); });
    const { result } = renderHook(() => useIntroPhase({ active: true, token: "e7", onEvent }));
    expect(() => act(() => result.current.open())).not.toThrow();
    expect(result.current.phase).toBe("opening");
  });

  it("works with no onEvent supplied (instrumentation is optional)", () => {
    const { result } = renderHook(() => useIntroPhase({ active: true, token: "e8" }));
    expect(() => act(() => result.current.open())).not.toThrow();
    expect(result.current.phase).toBe("opening");
  });
});
