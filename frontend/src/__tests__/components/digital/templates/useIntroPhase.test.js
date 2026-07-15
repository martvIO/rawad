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
