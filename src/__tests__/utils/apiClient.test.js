// Unit tests for apiClient — the fetch wrapper used by every service. Tests
// mock both global fetch and tokenManager so the request loop runs without
// touching localStorage or the network.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock tokenManager BEFORE importing apiClient so the apiClient picks up the
// mocked exports. The mock returns a fresh object that the tests reach into
// via the imported handles below.
vi.mock("../../utils/tokenManager.js", () => ({
  getIdToken: vi.fn(),
  refreshIdToken: vi.fn(),
  clearTokens: vi.fn(),
  setAuthClearedCallback: vi.fn(),
}));

import { api, ApiError, buildApiUrl, setAuthChangeCallback } from "../../utils/apiClient.js";
import * as tokenMgr from "../../utils/tokenManager.js";

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  tokenMgr.getIdToken.mockReset();
  tokenMgr.getIdToken.mockResolvedValue("test.token");
  tokenMgr.refreshIdToken.mockReset();
  tokenMgr.clearTokens.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setAuthChangeCallback(null);
});

describe("buildApiUrl", () => {
  it("prepends a slash if missing", () => {
    expect(buildApiUrl("foo")).toMatch(/\/foo$/);
  });

  it("preserves a leading slash", () => {
    expect(buildApiUrl("/foo/bar")).toMatch(/\/foo\/bar$/);
  });
});

describe("authorization header", () => {
  it("attaches Bearer token by default", async () => {
    fetch.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await api.get("/x");
    const [, init] = fetch.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer test.token");
  });

  it("omits Authorization when skipAuth is true", async () => {
    fetch.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await api.get("/x", { skipAuth: true });
    const [, init] = fetch.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
    expect(tokenMgr.getIdToken).not.toHaveBeenCalled();
  });

  it("omits Authorization when token is null", async () => {
    tokenMgr.getIdToken.mockResolvedValueOnce(null);
    fetch.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await api.get("/x");
    const [, init] = fetch.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });
});

describe("verb methods", () => {
  it("get sends GET with no body", async () => {
    fetch.mockResolvedValueOnce(jsonResponse(200, { v: 1 }));
    const out = await api.get("/g");
    expect(out).toEqual({ v: 1 });
    const [, init] = fetch.mock.calls[0];
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("post serializes JSON body and sets Content-Type", async () => {
    fetch.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await api.post("/p", { a: 1 });
    const [, init] = fetch.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"a":1}');
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("patch sends PATCH", async () => {
    fetch.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await api.patch("/p", { a: 1 });
    expect(fetch.mock.calls[0][1].method).toBe("PATCH");
  });

  it("put sends PUT", async () => {
    fetch.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await api.put("/p", { a: 1 });
    expect(fetch.mock.calls[0][1].method).toBe("PUT");
  });

  it("delete sends DELETE", async () => {
    fetch.mockResolvedValueOnce(jsonResponse(204, null));
    await api.delete("/p");
    expect(fetch.mock.calls[0][1].method).toBe("DELETE");
  });
});

describe("response handling", () => {
  it("returns parsed JSON on 200", async () => {
    fetch.mockResolvedValueOnce(jsonResponse(200, { hello: "world" }));
    const out = await api.get("/x");
    expect(out).toEqual({ hello: "world" });
  });

  it("returns null on 204 No Content", async () => {
    fetch.mockResolvedValueOnce({ ok: true, status: 204, json: async () => null });
    const out = await api.delete("/x");
    expect(out).toBeNull();
  });

  it("throws ApiError carrying status + body on 4xx", async () => {
    fetch.mockResolvedValueOnce(jsonResponse(409, { error: "username_taken" }));
    await expect(api.post("/users", { username: "x" })).rejects.toMatchObject({
      name: "ApiError",
      status: 409,
      body: { error: "username_taken" },
    });
  });

  it("throws ApiError on 500 with body=null when JSON parse fails", async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => { throw new Error("bad json"); },
    });
    try {
      await api.get("/x");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(500);
      expect(err.body).toBeNull();
    }
  });

  it("network failure throws Error('network_error')", async () => {
    fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(api.get("/x")).rejects.toThrow("network_error");
  });
});

describe("401 refresh + retry", () => {
  it("refreshes and retries once on first 401", async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse(401, { error: "expired" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    tokenMgr.refreshIdToken.mockResolvedValueOnce("refreshed.token");

    const out = await api.get("/x");
    expect(out).toEqual({ ok: true });
    expect(tokenMgr.refreshIdToken).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    const retryAuth = fetch.mock.calls[1][1].headers.Authorization;
    expect(retryAuth).toBe("Bearer refreshed.token");
  });

  it("fires auth callback + throws on second 401", async () => {
    const onAuthChange = vi.fn();
    setAuthChangeCallback(onAuthChange);
    fetch
      .mockResolvedValueOnce(jsonResponse(401, { error: "expired" }))
      .mockResolvedValueOnce(jsonResponse(401, { error: "expired" }));
    tokenMgr.refreshIdToken.mockResolvedValueOnce("refreshed.token");

    await expect(api.get("/x")).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
    });
    expect(tokenMgr.clearTokens).toHaveBeenCalled();
    expect(onAuthChange).toHaveBeenCalledWith(null);
  });

  it("fires auth callback when refresh itself throws", async () => {
    const onAuthChange = vi.fn();
    setAuthChangeCallback(onAuthChange);
    fetch.mockResolvedValueOnce(jsonResponse(401, { error: "expired" }));
    tokenMgr.refreshIdToken.mockRejectedValueOnce(new Error("refresh_failed"));

    await expect(api.get("/x")).rejects.toMatchObject({ status: 401 });
    expect(tokenMgr.clearTokens).toHaveBeenCalled();
    expect(onAuthChange).toHaveBeenCalledWith(null);
  });

  it("does NOT refresh when skipAuth is true (public endpoint)", async () => {
    fetch.mockResolvedValueOnce(jsonResponse(401, { error: "expired" }));
    await expect(api.post("/auth/login", { x: 1 }, { skipAuth: true })).rejects.toMatchObject({
      status: 401,
    });
    expect(tokenMgr.refreshIdToken).not.toHaveBeenCalled();
  });
});

describe("api.upload", () => {
  it("sends FormData without setting Content-Type (browser fills boundary)", async () => {
    fetch.mockResolvedValueOnce(jsonResponse(200, { url: "x" }));
    const fd = new FormData();
    fd.append("file", new Blob(["abc"]), "a.txt");
    await api.upload("/proofs/upload", fd);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toMatch(/\/proofs\/upload$/);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(fd);
    expect(init.headers["Content-Type"]).toBeUndefined();
    expect(init.headers.Authorization).toBe("Bearer test.token");
  });

  it("throws when called with non-FormData", async () => {
    await expect(api.upload("/x", { not: "formdata" })).rejects.toThrow(/FormData/);
  });

  it("refreshes + retries on 401", async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse(401, { error: "expired" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    tokenMgr.refreshIdToken.mockResolvedValueOnce("refreshed.token");

    const fd = new FormData();
    fd.append("f", new Blob(["x"]));
    const out = await api.upload("/p", fd);
    expect(out).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("ApiError", () => {
  it("carries .status and .body", () => {
    const e = new ApiError(404, { error: "not_found" });
    expect(e.status).toBe(404);
    expect(e.body).toEqual({ error: "not_found" });
    expect(e.name).toBe("ApiError");
    expect(e).toBeInstanceOf(Error);
  });

  it("defaults body to null when undefined", () => {
    const e = new ApiError(500);
    expect(e.body).toBeNull();
  });
});
