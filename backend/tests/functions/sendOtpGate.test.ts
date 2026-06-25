// @vitest-environment node
//
// Regression test for the /auth/send-otp account gate added with the SMS
// password-reset UI. Two guarantees this locks in:
//   1. `username` is now REQUIRED (a phone-only body is rejected up front).
//   2. When the username+phone don't resolve to a matching account, the handler
//      returns ONE generic `account_phone_mismatch` — never a distinguishing
//      "no such user" vs "wrong phone" signal (anti-enumeration), and never an
//      SMS. In this DB-less node env every RTDB lookup throws and is caught, so
//      no candidate ever "matches" — exactly the no-match branch we assert.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";

// auth.ts reads env at module load; keep it out of the emulator and unconfigured
// so getDatabase() can't resolve a URL (forcing the caught-error → no-match path)
// and the per-IP/per-username persistent limiters fail open.
delete process.env.FUNCTIONS_EMULATOR;
delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
delete process.env.WEB_API_KEY;

import { authRouter } from "../../functions/src/api/routes/auth";

let server: Server;
let baseUrl: string;

async function post(path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/auth", authRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => {
  server?.close();
});

describe("POST /auth/send-otp account gate", () => {
  it("rejects a body with no username (username is required)", async () => {
    const { status, json } = await post("/auth/send-otp", {
      phoneE164: "+972500000002",
      recaptchaToken: "x",
    });
    expect(status).toBe(400);
    expect(json.error).toBe("missing_fields");
  });

  it("rejects a body with no phone", async () => {
    const { status, json } = await post("/auth/send-otp", {
      username: "groom",
      recaptchaToken: "x",
    });
    expect(status).toBe(400);
    expect(json.error).toBe("missing_fields");
  });

  it("returns a generic account_phone_mismatch when the pair doesn't match (no SMS)", async () => {
    const { status, json } = await post("/auth/send-otp", {
      username: "groom",
      phoneE164: "+972509999999",
      recaptchaToken: "x",
    });
    expect(status).toBe(400);
    expect(json.error).toBe("account_phone_mismatch");
  });

  it("uses the SAME error for an unknown username (no enumeration signal)", async () => {
    const { status, json } = await post("/auth/send-otp", {
      username: "definitely-not-a-real-user",
      phoneE164: "+972500000002",
      recaptchaToken: "x",
    });
    expect(status).toBe(400);
    expect(json.error).toBe("account_phone_mismatch");
  });
});
