// Unit tests for the client-side password encryptor. Uses Node's WebCrypto as
// both the browser stand-in (so globalThis.crypto.subtle exists in jsdom) and as
// the "server" keypair, so we can decrypt what the util produces and assert a
// real round-trip. The pubkey endpoint is mocked via global fetch.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { webcrypto } from "node:crypto";

// Pin the API base so the pubkey fetch URL doesn't depend on the dev .env.
vi.mock("../../config/index.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, API_BASE_URL: "/api" };
});

import {
  encryptPassword,
  encryptPasswordFields,
  resetPublicKeyCache,
  PASSWORD_FIELDS,
} from "../../utils/passwordCrypto.js";

let keyPair;
let spkiB64;

async function genServerKey() {
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
}

function pubkeyOk() {
  return {
    ok: true,
    status: 200,
    json: async () => ({ alg: "RSA-OAEP-256", kid: "v1", key: spkiB64 }),
  };
}

function pubkeyUnavailable() {
  return { ok: false, status: 503, json: async () => ({ error: "encryption_unavailable" }) };
}

async function decrypt(envelope) {
  const b64 = envelope.replace(/^enc:v1:/, "");
  const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
  const pt = await webcrypto.subtle.decrypt({ name: "RSA-OAEP" }, keyPair.privateKey, bytes);
  return new TextDecoder().decode(pt);
}

beforeEach(async () => {
  await genServerKey();
  vi.stubGlobal("crypto", webcrypto); // provide crypto.subtle inside jsdom
  vi.stubGlobal("fetch", vi.fn());
  resetPublicKeyCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetPublicKeyCache();
});

describe("encryptPassword", () => {
  it("produces an enc:v1: envelope that decrypts to the original", async () => {
    fetch.mockResolvedValueOnce(pubkeyOk());
    const env = await encryptPassword("My$ecret1");
    expect(env.startsWith("enc:v1:")).toBe(true);
    expect(await decrypt(env)).toBe("My$ecret1");
  });

  it("fetches the pubkey only once across calls (memoized)", async () => {
    fetch.mockResolvedValue(pubkeyOk());
    await encryptPassword("a");
    await encryptPassword("b");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns null when the server has no key (503)", async () => {
    fetch.mockResolvedValueOnce(pubkeyUnavailable());
    expect(await encryptPassword("x")).toBeNull();
  });

  it("returns null (never throws) for an over-length password (>190 bytes)", async () => {
    fetch.mockResolvedValueOnce(pubkeyOk());
    const huge = "Aa1" + "x".repeat(300); // far exceeds the RSA-2048 OAEP limit
    await expect(encryptPassword(huge)).resolves.toBeNull();
  });

  it("fetches the pubkey with cache:no-store so resetPublicKeyCache re-fetches", async () => {
    fetch.mockResolvedValueOnce(pubkeyOk());
    await encryptPassword("a");
    const init = fetch.mock.calls[0][1];
    expect(init.cache).toBe("no-store");
  });
});

describe("importPublicKey failure branches all degrade to plaintext (never throw)", () => {
  it("no WebCrypto subtle → encryptPasswordFields keeps plaintext", async () => {
    vi.stubGlobal("crypto", {}); // crypto present but no .subtle
    const body = { password: "Aa123456" };
    const out = await encryptPasswordFields(body);
    expect(out).toBe(body);
    expect(out.password).toBe("Aa123456");
  });

  it("fetch rejects (network error) → plaintext", async () => {
    fetch.mockRejectedValueOnce(new Error("net"));
    const body = { password: "Aa123456" };
    expect(await encryptPasswordFields(body)).toBe(body);
  });

  it("200 with a non-string key → plaintext", async () => {
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ key: 123 }) });
    const body = { password: "Aa123456" };
    expect(await encryptPasswordFields(body)).toBe(body);
  });

  it("importKey throws on a corrupt SPKI key → plaintext", async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ alg: "RSA-OAEP-256", kid: "v1", key: "bm90LWEta2V5" }), // "not-a-key"
    });
    const body = { password: "Aa123456" };
    const out = await encryptPasswordFields(body);
    expect(out).toBe(body);
    expect(out.password).toBe("Aa123456");
  });
});

describe("encryptPasswordFields", () => {
  it("encrypts every present password field, leaves others untouched", async () => {
    fetch.mockResolvedValue(pubkeyOk());
    const out = await encryptPasswordFields({
      username: "u",
      password: "Aa123456",
      newPassword: "Bb123456",
    });
    expect(out.username).toBe("u");
    expect(out.password.startsWith("enc:v1:")).toBe(true);
    expect(out.newPassword.startsWith("enc:v1:")).toBe(true);
    expect(await decrypt(out.password)).toBe("Aa123456");
    expect(await decrypt(out.newPassword)).toBe("Bb123456");
  });

  it("is a no-op (no pubkey fetch) when there is no password field", async () => {
    fetch.mockResolvedValue(pubkeyOk());
    const body = { username: "u", foo: 1 };
    const out = await encryptPasswordFields(body);
    expect(out).toBe(body); // same reference, not a copy
    expect(fetch).not.toHaveBeenCalled();
  });

  it("falls back to plaintext (unchanged body) when encryption is unavailable", async () => {
    fetch.mockResolvedValueOnce(pubkeyUnavailable());
    const body = { password: "Aa123456" };
    const out = await encryptPasswordFields(body);
    expect(out).toBe(body);
    expect(out.password).toBe("Aa123456");
  });

  it("does not re-encrypt a value that is already an enc:v1: envelope", async () => {
    fetch.mockResolvedValue(pubkeyOk());
    const out = await encryptPasswordFields({ password: "enc:v1:already" });
    expect(out.password).toBe("enc:v1:already");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns non-object bodies unchanged", async () => {
    expect(await encryptPasswordFields(undefined)).toBeUndefined();
    expect(await encryptPasswordFields(null)).toBeNull();
    const arr = [1, 2];
    expect(await encryptPasswordFields(arr)).toBe(arr);
  });
});

describe("PASSWORD_FIELDS", () => {
  it("includes the password keys the app sends", () => {
    expect(PASSWORD_FIELDS.has("password")).toBe(true);
    expect(PASSWORD_FIELDS.has("newPassword")).toBe(true);
  });

  // Drift guard: must stay set-equal to the backend middleware's PASSWORD_FIELDS
  // (backend/functions/src/api/middleware/decryptPasswordFields.ts), or the client
  // could encrypt a field the server never decrypts. Keep this canonical list in
  // lock-step with the backend test's copy.
  it("equals the canonical password-field set (shared with the backend)", () => {
    const canonical = [
      "password",
      "newPassword",
      "currentPassword",
      "oldPassword",
      "confirmPassword",
    ];
    expect([...PASSWORD_FIELDS].sort()).toEqual([...canonical].sort());
  });
});
