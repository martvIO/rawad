// @vitest-environment node
//
// Integration test proving decryptPasswordFields is actually mounted AHEAD of the
// real /auth and /users routers (exactly as api/index.ts wires it) and that
// REQUIRE_ENCRYPTED_PASSWORDS enforcement fires BEFORE the route handlers. The
// middleware short-circuits before requireAuth, so the /users assertions need no
// token. The login handler is reached but stops at the missing WEB_API_KEY
// (500 server_misconfigured) — which is exactly the signal that the request got
// PAST the middleware rather than being rejected by it.
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";
import type { Server } from "node:http";
import * as crypto from "node:crypto";

const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
// Configure encryption + ensure NOT in emulator and NO WEB_API_KEY, all BEFORE
// importing the routers (auth.ts reads IN_EMULATOR / API key at module load).
process.env.PASSWORD_ENC_PRIVATE_KEY = privateKey.export({
  type: "pkcs8",
  format: "pem",
}) as string;
delete process.env.FUNCTIONS_EMULATOR;
delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
delete process.env.WEB_API_KEY;
delete process.env.REQUIRE_ENCRYPTED_PASSWORDS;

import { authRouter } from "../../functions/src/api/routes/auth";
import { usersRouter } from "../../functions/src/api/routes/users";
import { decryptPasswordFields } from "../../functions/src/api/middleware/decryptPasswordFields";
import {
  ENVELOPE_PREFIX,
  getPublicKeyMeta,
  __resetStateForTests,
} from "../../functions/src/api/passwordCrypto";

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

async function post(path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  return { status: res.status, json };
}

beforeAll(async () => {
  __resetStateForTests();
  const app = express();
  app.use(express.json());
  // Mirror api/index.ts exactly.
  app.use("/auth", decryptPasswordFields, authRouter);
  app.use("/users", decryptPasswordFields, usersRouter);
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

describe("REQUIRE_ENCRYPTED_PASSWORDS enforcement on the real routers", () => {
  it("rejects a plaintext password on POST /auth/login before the handler", async () => {
    process.env.REQUIRE_ENCRYPTED_PASSWORDS = "true";
    const { status, json } = await post("/auth/login", {
      username: "admin",
      password: "PlainPass1",
    });
    expect(status).toBe(400);
    expect(json.error).toBe("encryption_required");
  });

  it("rejects a plaintext password on POST /users before requireAuth", async () => {
    process.env.REQUIRE_ENCRYPTED_PASSWORDS = "true";
    // No Authorization header — middleware short-circuits before requireAuth.
    const { status, json } = await post("/users", {
      username: "newuser",
      password: "PlainPass1",
      role: "groom",
    });
    expect(status).toBe(400);
    expect(json.error).toBe("encryption_required");
  });

  it("lets an ENCRYPTED password through the middleware into the login handler", async () => {
    process.env.REQUIRE_ENCRYPTED_PASSWORDS = "true";
    const { status, json } = await post("/auth/login", {
      username: "admin",
      password: clientEncrypt("PlainPass1"),
    });
    // Past the middleware → handler runs → no WEB_API_KEY → 500 server_misconfigured.
    // The point: it is NOT 400 encryption_required / bad_encrypted_field.
    expect(status).toBe(500);
    expect(json.error).toBe("server_misconfigured");
  });
});

describe("backward compatibility (flag OFF)", () => {
  it("lets a plaintext password reach the login handler when the flag is unset", async () => {
    const { status, json } = await post("/auth/login", {
      username: "admin",
      password: "PlainPass1",
    });
    expect(status).toBe(500);
    expect(json.error).toBe("server_misconfigured"); // reached handler, not rejected
  });
});
