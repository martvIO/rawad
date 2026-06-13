// @vitest-environment node
//
// Route test for GET /auth/pubkey: mounts the REAL authRouter and confirms the
// endpoint serves a public key that actually round-trips with the configured
// private key. Proves the route is wired and the published key is usable by a
// client. The secret is set before importing the router so the lazy key state
// picks it up (and we __resetStateForTests in beforeAll to be certain).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";
import * as crypto from "node:crypto";

const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.PASSWORD_ENC_PRIVATE_KEY = privateKey.export({
  type: "pkcs8",
  format: "pem",
}) as string;
delete process.env.FUNCTIONS_EMULATOR;
delete process.env.FIREBASE_AUTH_EMULATOR_HOST;

import { authRouter } from "../../functions/src/api/routes/auth";
import { __resetStateForTests } from "../../functions/src/api/passwordCrypto";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  __resetStateForTests();
  const app = express();
  app.use(express.json());
  app.use("/auth", authRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
});

describe("GET /auth/pubkey", () => {
  it("returns alg/kid and a usable SPKI public key", async () => {
    const res = await fetch(`${baseUrl}/auth/pubkey`);
    expect(res.status).toBe(200);
    // A configured (non-ephemeral) key is stable per deploy → briefly cacheable.
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    const body = (await res.json()) as { alg: string; kid: string; key: string };
    expect(body.alg).toBe("RSA-OAEP-256");
    expect(body.kid).toBe("v1");
    expect(typeof body.key).toBe("string");

    // Encrypt with the served key, decrypt with our private key → round-trip.
    const pub = crypto.createPublicKey({
      key: Buffer.from(body.key, "base64"),
      format: "der",
      type: "spki",
    });
    const ct = crypto.publicEncrypt(
      { key: pub, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
      Buffer.from("round-trip"),
    );
    const pt = crypto.privateDecrypt(
      {
        key: crypto.createPrivateKey(process.env.PASSWORD_ENC_PRIVATE_KEY!),
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      ct,
    );
    expect(pt.toString()).toBe("round-trip");
  });
});
