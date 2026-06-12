// Unit tests for the in-memory per-key rate limiter. Each test uses a unique
// key because the bucket map is module-level and persists across tests.
import { describe, it, expect, vi, afterEach } from "vitest";
import { allow } from "../../functions/src/rateLimit";

describe("allow", () => {
  afterEach(() => vi.restoreAllMocks());

  it("allows the first call for a new key", () => {
    expect(allow("rl-first", 3, 1000)).toBe(true);
  });

  it("allows calls up to the limit, then blocks", () => {
    expect(allow("rl-limit", 3, 60_000)).toBe(true);
    expect(allow("rl-limit", 3, 60_000)).toBe(true);
    expect(allow("rl-limit", 3, 60_000)).toBe(true);
    expect(allow("rl-limit", 3, 60_000)).toBe(false);
    expect(allow("rl-limit", 3, 60_000)).toBe(false);
  });

  it("allows exactly maxPerWindow calls within a window", () => {
    let allowed = 0;
    for (let i = 0; i < 10; i++) {
      if (allow("rl-count", 5, 60_000)) allowed++;
    }
    expect(allowed).toBe(5);
  });

  it("resets the count once the window has expired", () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(10_000);
    expect(allow("rl-window", 2, 5000)).toBe(true);
    expect(allow("rl-window", 2, 5000)).toBe(true);
    expect(allow("rl-window", 2, 5000)).toBe(false);
    now.mockReturnValue(15_001); // past resetAt (10_000 + 5000)
    expect(allow("rl-window", 2, 5000)).toBe(true);
  });

  it("does not reset at the exact reset boundary", () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(20_000);
    expect(allow("rl-boundary", 1, 5000)).toBe(true);
    expect(allow("rl-boundary", 1, 5000)).toBe(false);
    now.mockReturnValue(25_000); // == resetAt, condition is strictly greater-than
    expect(allow("rl-boundary", 1, 5000)).toBe(false);
    now.mockReturnValue(25_001);
    expect(allow("rl-boundary", 1, 5000)).toBe(true);
  });

  it("tracks separate keys independently", () => {
    expect(allow("rl-a", 1, 60_000)).toBe(true);
    expect(allow("rl-a", 1, 60_000)).toBe(false);
    expect(allow("rl-b", 1, 60_000)).toBe(true);
  });
});
