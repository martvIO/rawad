// Unit tests for the WhatsApp daily-cap primitives. The RTDB transaction itself
// is an integration concern; the invariants that must be correct are (1) the
// increment-only-under-cap step and (2) the business-day key derivation.
import { describe, it, expect } from "vitest";
import { reserveStep, dayKey } from "../../functions/src/waRateLimit";

describe("reserveStep (increment only under cap)", () => {
  it("increments from an absent/non-number counter", () => {
    expect(reserveStep(undefined, 250)).toBe(1);
    expect(reserveStep(null, 250)).toBe(1);
    expect(reserveStep("x", 250)).toBe(1);
    expect(reserveStep(NaN, 250)).toBe(1);
  });
  it("increments while below the cap", () => {
    expect(reserveStep(0, 3)).toBe(1);
    expect(reserveStep(1, 3)).toBe(2);
    expect(reserveStep(2, 3)).toBe(3);
  });
  it("aborts (returns undefined) once at or over the cap — counter never moves", () => {
    expect(reserveStep(3, 3)).toBeUndefined();
    expect(reserveStep(4, 3)).toBeUndefined();
  });
  it("a cap of 1 allows exactly one send", () => {
    expect(reserveStep(0, 1)).toBe(1);
    expect(reserveStep(1, 1)).toBeUndefined();
  });
});

describe("dayKey (business-day bucket)", () => {
  it("formats YYYY-MM-DD for a fixed instant in Asia/Jerusalem", () => {
    // 2026-07-02T20:00:00Z → 23:00 Jerusalem (UTC+3 in summer) → same date.
    const d = new Date("2026-07-02T20:00:00Z");
    expect(dayKey("Asia/Jerusalem", d)).toBe("2026-07-02");
  });
  it("rolls to the next local day after local midnight, not UTC midnight", () => {
    // 2026-07-02T22:00:00Z → 01:00 next day in Jerusalem → 2026-07-03.
    const d = new Date("2026-07-02T22:00:00Z");
    expect(dayKey("Asia/Jerusalem", d)).toBe("2026-07-03");
  });
  it("produces a stable, zero-padded ISO-like key", () => {
    const d = new Date("2026-01-05T09:00:00Z");
    expect(dayKey("Asia/Jerusalem", d)).toBe("2026-01-05");
  });
});
