// Unit tests for the Stripe webhook signature verification (no SDK). Confirms a
// correctly-signed payload passes, and that tampering / wrong secret / stale
// timestamp are rejected — this is the only thing standing between the public
// webhook endpoint and a forged "mark this groom paid" request.
//
// Plus: ack semantics. A correctly-signed event whose downstream processing
// FAILS must NOT be acked with 200 — that tells Stripe the event is handled and
// it never retries, silently losing a real payment. The handler must return 5xx
// so Stripe re-delivers. We exercise the real route over HTTP and rely on
// getDatabase() being unavailable in the unit env (same trick as
// invitesAuthz.test.ts) to force the processing failure.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHmac } from "crypto";
import express from "express";
import type { Server } from "node:http";
import { verifyStripeSignature, paymentsRouter } from "../../functions/src/api/routes/payments";

const SECRET = "whsec_test_secret";

function sign(raw: string, secret: string, t: number): string {
  const sig = createHmac("sha256", secret).update(`${t}.${raw}`, "utf8").digest("hex");
  return `t=${t},v1=${sig}`;
}

describe("verifyStripeSignature", () => {
  const body = JSON.stringify({ type: "checkout.session.completed", data: { object: {} } });
  const nowS = Math.floor(Date.now() / 1000);

  it("accepts a correctly-signed, fresh payload", () => {
    const header = sign(body, SECRET, nowS);
    expect(verifyStripeSignature(Buffer.from(body), header, SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const header = sign(body, SECRET, nowS);
    const tampered = Buffer.from(body.replace("completed", "expired"));
    expect(verifyStripeSignature(tampered, header, SECRET)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    const header = sign(body, "whsec_attacker", nowS);
    expect(verifyStripeSignature(Buffer.from(body), header, SECRET)).toBe(false);
  });

  it("rejects a stale timestamp (replay)", () => {
    const header = sign(body, SECRET, nowS - 3600); // 1 hour old
    expect(verifyStripeSignature(Buffer.from(body), header, SECRET)).toBe(false);
  });

  it("rejects a malformed header", () => {
    expect(verifyStripeSignature(Buffer.from(body), "garbage", SECRET)).toBe(false);
    expect(verifyStripeSignature(Buffer.from(body), "", SECRET)).toBe(false);
  });
});

// ── POST /webhook ack semantics ──────────────────────────────────────────────
// Drive the REAL paymentsRouter over HTTP. getDatabase() is unavailable in this
// unit env, so a relevant, correctly-signed event that reaches the paid-status
// write throws — standing in for a real transient RTDB failure in prod.
describe("POST /webhook ack semantics", () => {
  let server: Server;
  let baseUrl = "";

  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const app = express();
    // Capture the raw bytes alongside JSON parsing — the handler verifies the
    // signature against req.rawBody (Firebase populates it in prod).
    app.use(
      express.json({
        verify: (req, _res, buf) => {
          (req as unknown as { rawBody?: Buffer }).rawBody = buf;
        },
      }),
    );
    app.use("/payments", paymentsRouter);
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address();
    if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function postWebhook(rawBody: string, header: string) {
    const res = await fetch(`${baseUrl}/payments/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "stripe-signature": header },
      body: rawBody,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, json };
  }

  const nowS = () => Math.floor(Date.now() / 1000);

  const HEX_TOKEN = "a".repeat(32); // valid TOKEN_HEX_RE

  it("returns 5xx (so Stripe retries) when provisioning hits the db (unavailable here)", async () => {
    // A succeeded PaymentIntent carrying a valid token reaches the token read in
    // provisionPaidIntent — getDatabase() is unavailable in this unit env, so it
    // throws, standing in for a real transient RTDB failure in prod.
    const raw = JSON.stringify({
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_test", amount: 150000, currency: "ils", metadata: { token: HEX_TOKEN } } },
    });
    const { status } = await postWebhook(raw, sign(raw, SECRET, nowS()));
    // Must be 5xx so Stripe re-delivers (provisioning is idempotent on retry).
    expect(status).toBeGreaterThanOrEqual(500);
  });

  it("acks 200 for an irrelevant event type (no retry storm)", async () => {
    const raw = JSON.stringify({
      type: "payment_intent.created",
      data: { object: {} },
    });
    const { status, json } = await postWebhook(raw, sign(raw, SECRET, nowS()));
    expect(status).toBe(200);
    expect(json.received).toBe(true);
  });

  it("acks 200 for a succeeded intent with no token metadata (nothing to provision)", async () => {
    const raw = JSON.stringify({
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_x", amount: 150000, currency: "ils", metadata: {} } },
    });
    const { status, json } = await postWebhook(raw, sign(raw, SECRET, nowS()));
    expect(status).toBe(200);
    expect(json.received).toBe(true);
  });

  it("rejects a forged signature with 400 (never reaches processing)", async () => {
    const raw = JSON.stringify({
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_test", amount: 150000, currency: "ils", metadata: { token: HEX_TOKEN } } },
    });
    const { status } = await postWebhook(raw, "t=123,v1=deadbeef");
    expect(status).toBe(400);
  });
});
