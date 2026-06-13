// @vitest-environment node
//
// Route test for GET /auth/pubkey in the "no key configured" state (production
// with PASSWORD_ENC_PRIVATE_KEY unset and not under the emulator): the endpoint
// must 503 `encryption_unavailable`, which is the exact contract the three
// clients rely on to fall back to plaintext. Env is cleared BEFORE importing the
// router so the lazy key state loads disabled.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";

delete process.env.PASSWORD_ENC_PRIVATE_KEY;
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

describe("GET /auth/pubkey with no key configured", () => {
  it("returns 503 encryption_unavailable", async () => {
    const res = await fetch(`${baseUrl}/auth/pubkey`);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("encryption_unavailable");
  });
});
