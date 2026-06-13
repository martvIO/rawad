// @vitest-environment node
//
// Integration test for the decryptPasswordFields middleware. Mounts it in a
// real Express app ahead of a stub echo route, exactly as it sits ahead of the
// /auth and /users routers in production, and drives it over HTTP. Encryption is
// enabled via a configured key (PASSWORD_ENC_PRIVATE_KEY) so the middleware has
// a real private key to decrypt with.
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from "vitest";
import express from "express";
import type { Server } from "node:http";
import * as crypto from "node:crypto";

import {
  ENVELOPE_PREFIX,
  getPublicKeyMeta,
  __resetStateForTests,
} from "../../functions/src/api/passwordCrypto";
import {
  decryptPasswordFields,
  PASSWORD_FIELDS,
} from "../../functions/src/api/middleware/decryptPasswordFields";

const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });

let server: Server;
let baseUrl: string;

function clientEncrypt(plaintext: string): string {
  const meta = getPublicKeyMeta()!;
  const pub = crypto.createPublicKey({
    key: Buffer.from(meta.key, "base64"),
    format: "der",
    type: "spki",
  });
  const ct = crypto.publicEncrypt(
    { key: pub, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(plaintext, "utf8"),
  );
  return ENVELOPE_PREFIX + ct.toString("base64");
}

async function postEcho(body: unknown) {
  const res = await fetch(`${baseUrl}/echo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  return { status: res.status, json };
}

beforeAll(async () => {
  process.env.PASSWORD_ENC_PRIVATE_KEY = privateKey.export({
    type: "pkcs8",
    format: "pem",
  }) as string;
  delete process.env.FUNCTIONS_EMULATOR;
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  __resetStateForTests();

  const app = express();
  app.use(express.json());
  app.use(decryptPasswordFields);
  app.post("/echo", (req, res) => res.json({ body: req.body }));
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
});

afterEach(() => {
  delete process.env.REQUIRE_ENCRYPTED_PASSWORDS;
});

describe("decryptPasswordFields", () => {
  it("decrypts an encrypted password field in place, leaving others", async () => {
    const { status, json } = await postEcho({
      username: "admin",
      password: clientEncrypt("Sup3rSecret"),
    });
    expect(status).toBe(200);
    expect(json.body.password).toBe("Sup3rSecret");
    expect(json.body.username).toBe("admin");
  });

  it("decrypts newPassword too", async () => {
    const { json } = await postEcho({ newPassword: clientEncrypt("N3wPassw0rd") });
    expect(json.body.newPassword).toBe("N3wPassw0rd");
  });

  it("decrypts EVERY field in PASSWORD_FIELDS", async () => {
    const body: Record<string, string> = {};
    for (const f of PASSWORD_FIELDS) body[f] = clientEncrypt(`val-${f}`);
    const { status, json } = await postEcho(body);
    expect(status).toBe(200);
    for (const f of PASSWORD_FIELDS) expect(json.body[f]).toBe(`val-${f}`);
  });

  it("decrypts multiple encrypted fields in one body (change-password shape)", async () => {
    const { json } = await postEcho({
      currentPassword: clientEncrypt("Current1!"),
      newPassword: clientEncrypt("Brand2New!"),
    });
    expect(json.body.currentPassword).toBe("Current1!");
    expect(json.body.newPassword).toBe("Brand2New!");
  });

  it("passes a null password field through (and still 200s)", async () => {
    const { status, json } = await postEcho({ password: null, username: "u" });
    expect(status).toBe(200);
    expect(json.body.password).toBeNull();
    expect(json.body.username).toBe("u");
  });

  it("passes plaintext through by default (backward compatible)", async () => {
    const { status, json } = await postEcho({ username: "g", password: "PlainPass1" });
    expect(status).toBe(200);
    expect(json.body.password).toBe("PlainPass1");
  });

  it("does not touch non-password fields even if they look like envelopes", async () => {
    const { json } = await postEcho({ token: `${ENVELOPE_PREFIX}not-a-password-field`, n: 1 });
    expect(json.body.token).toBe(`${ENVELOPE_PREFIX}not-a-password-field`);
    expect(json.body.n).toBe(1);
  });

  it("rejects a malformed envelope with 400 bad_encrypted_field", async () => {
    const { status, json } = await postEcho({ password: `${ENVELOPE_PREFIX}@@@notbase64@@@` });
    expect(status).toBe(400);
    expect(json.error).toBe("bad_encrypted_field");
    expect(json.field).toBe("password");
  });

  it("rejects plaintext when REQUIRE_ENCRYPTED_PASSWORDS=true", async () => {
    process.env.REQUIRE_ENCRYPTED_PASSWORDS = "true";
    const { status, json } = await postEcho({ password: "PlainPass1" });
    expect(status).toBe(400);
    expect(json.error).toBe("encryption_required");
  });

  it("still accepts an encrypted field under REQUIRE_ENCRYPTED_PASSWORDS=true", async () => {
    process.env.REQUIRE_ENCRYPTED_PASSWORDS = "true";
    const { status, json } = await postEcho({ password: clientEncrypt("Enf0rced!") });
    expect(status).toBe(200);
    expect(json.body.password).toBe("Enf0rced!");
  });

  it("no-ops on a request with no body", async () => {
    const res = await fetch(`${baseUrl}/echo`, { method: "POST" });
    expect(res.status).toBe(200);
  });

  // Drift guard: the backend list and the frontend's PRESERVE_KEYS (which the
  // client uses to decide what to encrypt) must stay set-equal, or the client
  // could send an envelope the server never decrypts. Keep this canonical list
  // identical to frontend/src/utils/digits.js PRESERVE_KEYS.
  it("PASSWORD_FIELDS equals the canonical password-field set", () => {
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
