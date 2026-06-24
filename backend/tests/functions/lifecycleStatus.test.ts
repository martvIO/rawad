// @vitest-environment node
//
// Pure unit tests for the wedding-lifecycle state machine helpers (no Firebase).
import { describe, it, expect } from "vitest";
import {
  LIFECYCLE,
  DEFAULT_CANCEL_GRACE_HOURS,
  normalizeStatus,
  isFrozen,
  publicEventState,
  clampGraceHours,
  graceEndsAt,
  isGraceExpired,
} from "../../functions/src/lifecycle/status";

const HOUR = 60 * 60 * 1000;

describe("normalizeStatus", () => {
  it("passes through known statuses", () => {
    for (const s of Object.values(LIFECYCLE)) {
      expect(normalizeStatus(s)).toBe(s);
    }
  });
  it("coerces unknown / absent to active", () => {
    expect(normalizeStatus(undefined)).toBe("active");
    expect(normalizeStatus(null)).toBe("active");
    expect(normalizeStatus("bogus")).toBe("active");
    expect(normalizeStatus(7)).toBe("active");
  });
});

describe("isFrozen", () => {
  it("active is not frozen; every other state is", () => {
    expect(isFrozen("active")).toBe(false);
    expect(isFrozen(undefined)).toBe(false);
    expect(isFrozen("cancel_pending")).toBe(true);
    expect(isFrozen("cancelled")).toBe(true);
    expect(isFrozen("paused")).toBe(true);
  });
});

describe("publicEventState", () => {
  it("maps internal status to the guest-facing state", () => {
    expect(publicEventState("active")).toBe("active");
    expect(publicEventState("cancel_pending")).toBe("cancelled");
    expect(publicEventState("cancelled")).toBe("cancelled");
    expect(publicEventState("paused")).toBe("postponed");
    expect(publicEventState(undefined)).toBe("active");
  });
});

describe("clampGraceHours", () => {
  it("clamps to [1, 720] and floors", () => {
    expect(clampGraceHours(48)).toBe(48);
    expect(clampGraceHours(0)).toBe(1);
    expect(clampGraceHours(-5)).toBe(1);
    expect(clampGraceHours(99999)).toBe(720);
    expect(clampGraceHours(2.9)).toBe(2);
  });
  it("falls back to the default for junk", () => {
    expect(clampGraceHours("x")).toBe(DEFAULT_CANCEL_GRACE_HOURS);
    expect(clampGraceHours(undefined)).toBe(DEFAULT_CANCEL_GRACE_HOURS);
    expect(clampGraceHours(NaN)).toBe(DEFAULT_CANCEL_GRACE_HOURS);
  });
});

describe("graceEndsAt", () => {
  it("adds the clamped grace window to now", () => {
    expect(graceEndsAt(1000, 48)).toBe(1000 + 48 * HOUR);
    expect(graceEndsAt(0, 0)).toBe(1 * HOUR); // clamped up to 1
  });
});

describe("isGraceExpired", () => {
  const base = 10_000_000;
  it("is true only for a cancel_pending whose window has elapsed", () => {
    expect(
      isGraceExpired({ lifecycleStatus: "cancel_pending", cancelGraceEndsAt: base }, base),
    ).toBe(true);
    expect(
      isGraceExpired({ lifecycleStatus: "cancel_pending", cancelGraceEndsAt: base + 1 }, base),
    ).toBe(false);
  });
  it("is false for non-pending statuses regardless of timestamp", () => {
    expect(
      isGraceExpired({ lifecycleStatus: "cancelled", cancelGraceEndsAt: 1 }, base),
    ).toBe(false);
    expect(
      isGraceExpired({ lifecycleStatus: "active" }, base),
    ).toBe(false);
  });
  it("is false when the grace timestamp is missing or non-numeric", () => {
    expect(isGraceExpired({ lifecycleStatus: "cancel_pending" }, base)).toBe(false);
    expect(
      isGraceExpired({ lifecycleStatus: "cancel_pending", cancelGraceEndsAt: "x" }, base),
    ).toBe(false);
    expect(isGraceExpired(null, base)).toBe(false);
  });
});
