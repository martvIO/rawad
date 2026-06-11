// Unit tests for the shared motion helpers — reduced-motion detection and
// the magnetic-hover attachment (pointer-fine gating, disposer behavior).
import { describe, it, expect, afterEach, vi } from "vitest";
import { prefersReducedMotion, attachMagnetic, REVEAL } from "../../utils/motion.js";

const realMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = realMatchMedia;
});

function mockMatchMedia(matchesByQuery) {
  window.matchMedia = vi.fn((q) => ({ matches: !!matchesByQuery[q] }));
}

describe("prefersReducedMotion", () => {
  it("returns true when the media query matches", () => {
    mockMatchMedia({ "(prefers-reduced-motion: reduce)": true });
    expect(prefersReducedMotion()).toBe(true);
  });

  it("returns false when the media query does not match", () => {
    mockMatchMedia({});
    expect(prefersReducedMotion()).toBe(false);
  });

  it("is safe when matchMedia is missing (old WebViews)", () => {
    window.matchMedia = undefined;
    expect(prefersReducedMotion()).toBe(false);
  });

  it("is safe when matchMedia throws", () => {
    window.matchMedia = () => { throw new Error("boom"); };
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("REVEAL constants", () => {
  it("exposes the house reveal rhythm", () => {
    expect(REVEAL.y).toBeGreaterThan(0);
    expect(REVEAL.duration).toBeGreaterThan(0);
    expect(REVEAL.stagger).toBeGreaterThan(0);
    expect(typeof REVEAL.ease).toBe("string");
  });
});

describe("attachMagnetic", () => {
  const fakeGsap = () => ({
    quickTo: vi.fn(() => vi.fn()),
  });

  it("no-ops (but returns a disposer) without element or gsap", () => {
    expect(typeof attachMagnetic(null, fakeGsap())).toBe("function");
    expect(typeof attachMagnetic(document.createElement("a"), null)).toBe("function");
  });

  it("no-ops on coarse pointers (touch devices)", () => {
    mockMatchMedia({}); // "(pointer: fine)" does not match
    const el = document.createElement("a");
    const spy = vi.spyOn(el, "addEventListener");
    const dispose = attachMagnetic(el, fakeGsap());
    expect(spy).not.toHaveBeenCalled();
    dispose();
  });

  it("attaches listeners on fine pointers and removes them on dispose", () => {
    mockMatchMedia({ "(pointer: fine)": true });
    const el = document.createElement("a");
    const add = vi.spyOn(el, "addEventListener");
    const remove = vi.spyOn(el, "removeEventListener");
    const dispose = attachMagnetic(el, fakeGsap());
    expect(add).toHaveBeenCalledWith("mousemove", expect.any(Function));
    expect(add).toHaveBeenCalledWith("mouseleave", expect.any(Function));
    dispose();
    expect(remove).toHaveBeenCalledWith("mousemove", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("mouseleave", expect.any(Function));
  });
});
