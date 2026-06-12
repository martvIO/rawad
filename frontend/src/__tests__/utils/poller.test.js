// Unit tests for poller — the createPoller() factory that replaces RTDB
// onValue subscriptions. Tests use fake timers to drive the polling loop.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPoller } from "../../utils/poller.js";
import { ApiError } from "../../utils/apiClient.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createPoller — argument validation", () => {
  it("throws when fetchFn is not a function", () => {
    expect(() => createPoller("not a fn", () => {})).toThrow(/fetchFn/);
  });

  it("throws when callback is not a function", () => {
    expect(() => createPoller(async () => 0, "not a fn")).toThrow(/callback/);
  });
});

describe("immediate first tick", () => {
  it("invokes fetchFn synchronously on subscribe", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ v: 1 });
    const cb = vi.fn();
    createPoller(fetchFn, cb);
    // Allow the immediate tick to resolve.
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({ v: 1 });
  });
});

describe("interval polling", () => {
  it("polls every intervalMs after the first tick", async () => {
    const fetchFn = vi.fn().mockResolvedValue("ok");
    const cb = vi.fn();
    createPoller(fetchFn, cb, { intervalMs: 5000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("clamps intervalMs below 1000 to 1000", async () => {
    const fetchFn = vi.fn().mockResolvedValue("ok");
    const cb = vi.fn();
    createPoller(fetchFn, cb, { intervalMs: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchFn).toHaveBeenCalledTimes(1); // not yet
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("uses the 15s default when intervalMs is omitted", async () => {
    const fetchFn = vi.fn().mockResolvedValue("ok");
    const cb = vi.fn();
    createPoller(fetchFn, cb);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe("unsubscribe", () => {
  it("stops further calls", async () => {
    const fetchFn = vi.fn().mockResolvedValue("ok");
    const cb = vi.fn();
    const stop = createPoller(fetchFn, cb, { intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("ignores callback after unsubscribe even if a fetch is in flight", async () => {
    let resolveFetch;
    const inflight = new Promise((res) => { resolveFetch = res; });
    const fetchFn = vi.fn().mockReturnValueOnce(inflight);
    const cb = vi.fn();
    const stop = createPoller(fetchFn, cb, { intervalMs: 1000 });
    stop();
    resolveFetch("late-data");
    await vi.advanceTimersByTimeAsync(10);
    expect(cb).not.toHaveBeenCalled();
  });
});

describe("error handling", () => {
  it("on 401 ApiError, calls callback(null) and stops polling", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new ApiError(401, null, "session_expired"));
    const cb = vi.fn();
    createPoller(fetchFn, cb, { intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(cb).toHaveBeenCalledWith(null);
    // Ensure polling stopped — no further fetch after the interval.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("other errors swallowed; next tick still fires", async () => {
    const fetchFn = vi.fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ v: "recovered" });
    const cb = vi.fn();
    createPoller(fetchFn, cb, { intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(cb).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(cb).toHaveBeenCalledWith({ v: "recovered" });
  });

  it("non-401 ApiError is also swallowed (treated as a transient error)", async () => {
    const fetchFn = vi.fn()
      .mockRejectedValueOnce(new ApiError(500, null, "server_error"))
      .mockResolvedValueOnce("ok");
    const cb = vi.fn();
    createPoller(fetchFn, cb, { intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(cb).not.toHaveBeenCalledWith(null);
    await vi.advanceTimersByTimeAsync(1000);
    expect(cb).toHaveBeenCalledWith("ok");
  });

  it("exponential backoff: 2nd consecutive error doubles next delay; 3rd doubles again", async () => {
    const fetchFn = vi.fn()
      .mockRejectedValueOnce(new Error("e1"))
      .mockRejectedValueOnce(new Error("e2"))
      .mockRejectedValueOnce(new Error("e3"))
      .mockResolvedValue("ok");
    const cb = vi.fn();
    createPoller(fetchFn, cb, { intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    // First error retries at the normal interval (no backoff yet).
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    // Second error → next delay is 2× = 2000 ms; not fired at 1000 ms.
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    // Third error → next delay is 4× = 4000 ms.
    await vi.advanceTimersByTimeAsync(3999);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(cb).toHaveBeenCalledWith("ok");
  });

  it("backoff resets after a successful poll", async () => {
    const fetchFn = vi.fn()
      .mockRejectedValueOnce(new Error("e1"))
      .mockRejectedValueOnce(new Error("e2"))
      .mockResolvedValueOnce("recovered")
      .mockRejectedValueOnce(new Error("e3"))
      .mockResolvedValue("ok");
    const cb = vi.fn();
    createPoller(fetchFn, cb, { intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);   // initial e1
    await vi.advanceTimersByTimeAsync(1000); // 1× → e2
    await vi.advanceTimersByTimeAsync(2000); // 2× → recovered (counter reset)
    expect(cb).toHaveBeenCalledWith("recovered");
    // After reset, first new error retries at the normal interval again.
    await vi.advanceTimersByTimeAsync(1000); // 1× → e3
    await vi.advanceTimersByTimeAsync(1000); // 1× → ok
    expect(cb).toHaveBeenCalledWith("ok");
  });
});
