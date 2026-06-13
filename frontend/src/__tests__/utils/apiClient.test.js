// Unit tests for apiClient — the fetch wrapper used by every service. Tests
// mock both global fetch and tokenManager so the request loop runs without
// touching localStorage or the network.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { webcrypto } from "node:crypto";

// Mock tokenManager BEFORE importing apiClient so the apiClient picks up the
// mocked exports. The mock returns a fresh object that the tests reach into
// via the imported handles below.
vi.mock("../../utils/tokenManager.js", () => ({
  getIdToken: vi.fn(),
  refreshIdToken: vi.fn(),
  clearTokens: vi.fn(),
  setAuthClearedCallback: vi.fn(),
}));

// Pin the API base so assertions don't depend on whatever VITE_API_BASE_URL
// happens to be in the developer's .env (vitest loads it like Vite does).
vi.mock("../../config/index.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, API_BASE_URL: "/api" };
});

import { api, ApiError, buildApiUrl, setAuthChangeCallback } from "../../utils/apiClient.js";
import * as tokenMgr from "../../utils/tokenManager.js";
import { resetPublicKeyCache } from "../../utils/passwordCrypto.js";

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
  resetPublicKeyCache(); // drop any memoized pubkey between tests
});

describe("buildApiUrl", () => {
  it("prepends a slash if missing", () => {
    expect(buildApiUrl("foo")).toMatch(/\/api\/foo$/);
  });

  it("preserves a leading slash", () => {
    expect(buildApiUrl("/foo/bar")).toMatch(/\/api\/foo\/bar$/);
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

describe("password field encryption", () => {
  let keyPair;
  let spkiB64;

  beforeEach(async () => {
    vi.stubGlobal("crypto", webcrypto); // give the util crypto.subtle in jsdom
    keyPair = await webcrypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["encrypt", "decrypt"],
    );
    const spki = await webcrypto.subtle.exportKey("spki", keyPair.publicKey);
    spkiB64 = Buffer.from(new Uint8Array(spki)).toString("base64");
  });

  async function decryptEnvelope(env) {
    const bytes = Uint8Array.from(Buffer.from(env.replace(/^enc:v1:/, ""), "base64"));
    const pt = await webcrypto.subtle.decrypt({ name: "RSA-OAEP" }, keyPair.privateKey, bytes);
    return new TextDecoder().decode(pt);
  }

  it("encrypts the password before POSTing /auth/login (pubkey first, login second)", async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ alg: "RSA-OAEP-256", kid: "v1", key: spkiB64 }),
      })
      .mockResolvedValueOnce(jsonResponse(200, { idToken: "t" }));

    await api.post("/auth/login", { username: "admin", password: "Secret123" }, { skipAuth: true });

    expect(fetch).toHaveBeenCalledTimes(2);
    const sent = JSON.parse(fetch.mock.calls[1][1].body);
    expect(sent.username).toBe("admin"); // untouched
    expect(sent.password.startsWith("enc:v1:")).toBe(true);
    expect(await decryptEnvelope(sent.password)).toBe("Secret123");
  });

  it("sends plaintext when the pubkey endpoint is unavailable (503)", async () => {
    fetch
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: "encryption_unavailable" }) })
      .mockResolvedValueOnce(jsonResponse(200, { idToken: "t" }));

    await api.post("/auth/login", { username: "admin", password: "Secret123" }, { skipAuth: true });

    const sent = JSON.parse(fetch.mock.calls[1][1].body);
    expect(sent.password).toBe("Secret123");
  });

  it("does not fetch the pubkey for bodies without a password field", async () => {
    fetch.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await api.post("/guests", { name: "x" });
    expect(fetch).toHaveBeenCalledTimes(1); // no extra pubkey round-trip
  });

  // Fresh pubkey response object per call (json() is consumed once per fetch).
  function pubkey() {
    return {
      ok: true,
      status: 200,
      json: async () => ({ alg: "RSA-OAEP-256", kid: "v1", key: spkiB64 }),
    };
  }

  it("retries once with a fresh pubkey on bad_encrypted_field, then succeeds", async () => {
    fetch
      .mockResolvedValueOnce(pubkey()) // attempt 1: pubkey
      .mockResolvedValueOnce(jsonResponse(400, { error: "bad_encrypted_field" })) // login rejected
      .mockResolvedValueOnce(pubkey()) // attempt 2: fresh pubkey (cache reset)
      .mockResolvedValueOnce(jsonResponse(200, { idToken: "t" })); // login ok

    const out = await api.post("/auth/login", { username: "a", password: "Secret123" }, { skipAuth: true });
    expect(out).toEqual({ idToken: "t" });
    expect(fetch).toHaveBeenCalledTimes(4); // pubkey, login(400), pubkey, login(200)
  });

  it("gives up after exactly one retry if the server keeps rejecting", async () => {
    fetch
      .mockResolvedValueOnce(pubkey())
      .mockResolvedValueOnce(jsonResponse(400, { error: "bad_encrypted_field" }))
      .mockResolvedValueOnce(pubkey())
      .mockResolvedValueOnce(jsonResponse(400, { error: "bad_encrypted_field" }));

    await expect(
      api.post("/auth/login", { username: "a", password: "Secret123" }, { skipAuth: true }),
    ).rejects.toMatchObject({ status: 400, body: { error: "bad_encrypted_field" } });
    expect(fetch).toHaveBeenCalledTimes(4); // no infinite loop: bounded at one retry
  });

  it("retries on encryption_required: plaintext fallback, then key recovers and it encrypts", async () => {
    fetch
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: "encryption_unavailable" }) }) // pubkey down → plaintext
      .mockResolvedValueOnce(jsonResponse(400, { error: "encryption_required" })) // server demands encryption
      .mockResolvedValueOnce(pubkey()) // retry: pubkey now available
      .mockResolvedValueOnce(jsonResponse(200, { idToken: "t" }));

    const out = await api.post("/auth/login", { username: "a", password: "Secret123" }, { skipAuth: true });
    expect(out).toEqual({ idToken: "t" });
    const retried = JSON.parse(fetch.mock.calls[3][1].body);
    expect(retried.password.startsWith("enc:v1:")).toBe(true); // now encrypted
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("on a 401 replays the SAME encrypted envelope without re-fetching the pubkey", async () => {
    tokenMgr.refreshIdToken.mockResolvedValueOnce("fresh.token");
    fetch
      .mockResolvedValueOnce(pubkey()) // pubkey
      .mockResolvedValueOnce(jsonResponse(401, { error: "expired" })) // first attempt 401
      .mockResolvedValueOnce(jsonResponse(200, { ok: true })); // refreshed retry

    await api.put("/users/u1/password", { newPassword: "Secret123" }); // authenticated (not skipAuth)

    expect(fetch).toHaveBeenCalledTimes(3); // pubkey once; NOT re-fetched on the 401 retry
    const first = JSON.parse(fetch.mock.calls[1][1].body);
    const retry = JSON.parse(fetch.mock.calls[2][1].body);
    expect(first.newPassword.startsWith("enc:v1:")).toBe(true);
    expect(retry.newPassword).toBe(first.newPassword); // same ciphertext, not re-encrypted/double-wrapped
    expect(await decryptEnvelope(retry.newPassword)).toBe("Secret123");
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
