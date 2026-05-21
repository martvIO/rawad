// Unit tests for tokenManager — the localStorage-backed token lifecycle that
// underpins every authenticated REST call. The module is stateful (memoryState
// + localStorage + timer), so each test resets both via clearTokens().
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  loadStoredTokens, storeTokens, clearTokens,
  getIdToken, refreshIdToken, peekIdToken,
  getStoredUid, setAuthClearedCallback,
} from "../../utils/tokenManager.js";

const HOUR_MS = 3600 * 1000;

function makeRefreshResponse({ idToken = "new.id.token", refreshToken = "new.refresh", expiresIn = 3600 } = {}) {
  return { ok: true, status: 200, json: async () => ({ idToken, refreshToken, expiresIn }) };
}

function makeErrorResponse(status = 400, body = { error: "INVALID_REFRESH_TOKEN" }) {
  return { ok: false, status, json: async () => body };
}

beforeEach(() => {
  clearTokens();
  localStorage.clear();
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setAuthClearedCallback(null);
});

describe("storeTokens", () => {
  it("persists all four keys to localStorage", () => {
    storeTokens({ idToken: "id.1", refreshToken: "rt.1", expiresIn: 3600, uid: "u1" });
    expect(localStorage.getItem("dawa.idToken")).toBe("id.1");
    expect(localStorage.getItem("dawa.refreshToken")).toBe("rt.1");
    expect(localStorage.getItem("dawa.uid")).toBe("u1");
    expect(Number(localStorage.getItem("dawa.expiresAt"))).toBeGreaterThan(Date.now());
  });

  it("computes expiresAt from expiresIn seconds", () => {
    const before = Date.now();
    storeTokens({ idToken: "x", refreshToken: "y", expiresIn: 60, uid: "u" });
    const stored = Number(localStorage.getItem("dawa.expiresAt"));
    expect(stored - before).toBeGreaterThanOrEqual(59_000);
    expect(stored - before).toBeLessThanOrEqual(61_000);
  });

  it("falls back to 3600s when expiresIn is missing", () => {
    const before = Date.now();
    storeTokens({ idToken: "x", refreshToken: "y", uid: "u" });
    const stored = Number(localStorage.getItem("dawa.expiresAt"));
    expect(stored - before).toBeGreaterThanOrEqual(HOUR_MS - 1000);
  });

  it("throws when idToken or refreshToken missing", () => {
    expect(() => storeTokens({ refreshToken: "x" })).toThrow();
    expect(() => storeTokens({ idToken: "x" })).toThrow();
    expect(() => storeTokens(null)).toThrow();
  });

  it("preserves prior uid when new payload omits it", () => {
    storeTokens({ idToken: "a", refreshToken: "b", uid: "preserved" });
    storeTokens({ idToken: "a2", refreshToken: "b2" });
    expect(getStoredUid()).toBe("preserved");
  });
});

describe("getStoredUid", () => {
  it("returns the stored uid", () => {
    storeTokens({ idToken: "x", refreshToken: "y", uid: "abc" });
    expect(getStoredUid()).toBe("abc");
  });

  it("returns null when no tokens are stored", () => {
    expect(getStoredUid()).toBeNull();
  });
});

describe("peekIdToken", () => {
  it("returns the current token without network", () => {
    storeTokens({ idToken: "peek.me", refreshToken: "r", uid: "u" });
    expect(peekIdToken()).toBe("peek.me");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns null when nothing stored", () => {
    expect(peekIdToken()).toBeNull();
  });
});

describe("loadStoredTokens", () => {
  it("rehydrates module state from localStorage", () => {
    localStorage.setItem("dawa.idToken", "loaded.id");
    localStorage.setItem("dawa.refreshToken", "loaded.rt");
    localStorage.setItem("dawa.expiresAt", String(Date.now() + HOUR_MS));
    localStorage.setItem("dawa.uid", "loaded-uid");
    loadStoredTokens();
    expect(peekIdToken()).toBe("loaded.id");
    expect(getStoredUid()).toBe("loaded-uid");
  });

  it("does not throw when localStorage is empty", () => {
    expect(() => loadStoredTokens()).not.toThrow();
    expect(peekIdToken()).toBeNull();
  });
});

describe("getIdToken — proactive refresh", () => {
  it("returns the cached token when far from expiry", async () => {
    storeTokens({ idToken: "fresh.id", refreshToken: "r", expiresIn: 3600, uid: "u" });
    const t = await getIdToken();
    expect(t).toBe("fresh.id");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns null when no session at all", async () => {
    const t = await getIdToken();
    expect(t).toBeNull();
  });

  it("refreshes when within 5 min of expiry", async () => {
    storeTokens({ idToken: "old.id", refreshToken: "r1", expiresIn: 60, uid: "u" });
    fetch.mockResolvedValueOnce(makeRefreshResponse({ idToken: "new.id", refreshToken: "r2", expiresIn: 3600 }));
    const t = await getIdToken();
    expect(t).toBe("new.id");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain("/auth/refresh");
  });
});

describe("refreshIdToken — coalescing", () => {
  it("coalesces concurrent callers into a single network call", async () => {
    storeTokens({ idToken: "x", refreshToken: "r1", expiresIn: 1, uid: "u" });
    let resolveFetch;
    const fetchPromise = new Promise((res) => { resolveFetch = res; });
    fetch.mockReturnValueOnce(fetchPromise);

    const p1 = refreshIdToken();
    const p2 = refreshIdToken();
    const p3 = refreshIdToken();

    resolveFetch(makeRefreshResponse({ idToken: "coalesced.id", refreshToken: "r2" }));

    const results = await Promise.all([p1, p2, p3]);
    expect(results).toEqual(["coalesced.id", "coalesced.id", "coalesced.id"]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("clears tokens and throws on non-2xx refresh response", async () => {
    storeTokens({ idToken: "x", refreshToken: "bad", expiresIn: 60, uid: "u" });
    fetch.mockResolvedValueOnce(makeErrorResponse(400));
    await expect(refreshIdToken()).rejects.toThrow();
    expect(peekIdToken()).toBeNull();
    expect(getStoredUid()).toBeNull();
  });

  it("throws when no refresh token is stored", async () => {
    await expect(refreshIdToken()).rejects.toThrow(/no_refresh_token/);
  });
});

describe("clearTokens", () => {
  it("wipes both memory state and localStorage", () => {
    storeTokens({ idToken: "x", refreshToken: "y", uid: "u" });
    clearTokens();
    expect(peekIdToken()).toBeNull();
    expect(getStoredUid()).toBeNull();
    expect(localStorage.getItem("dawa.idToken")).toBeNull();
    expect(localStorage.getItem("dawa.uid")).toBeNull();
  });

  it("is a no-op when nothing is stored", () => {
    expect(() => clearTokens()).not.toThrow();
  });
});

describe("setAuthClearedCallback", () => {
  it("fires on automatic refresh failure via scheduled timer", async () => {
    const cb = vi.fn();
    setAuthClearedCallback(cb);
    storeTokens({ idToken: "x", refreshToken: "r", expiresIn: 60, uid: "u" });
    fetch.mockResolvedValueOnce(makeErrorResponse(401));
    // The scheduled refresh fires after MIN_REFRESH_DELAY_MS = 1000ms
    await vi.advanceTimersByTimeAsync(1500);
    expect(cb).toHaveBeenCalledWith();
  });
});
