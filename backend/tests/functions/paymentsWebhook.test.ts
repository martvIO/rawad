// Unit tests for the Lemon Squeezy webhook signature verification (no SDK).
// Confirms a correctly-signed body passes and tampering / wrong secret / empty
// header are rejected — this is the only thing standing between the public
// webhook endpoint and a forged "mark this groom paid" request.
//
// Plus: ack semantics. A correctly-signed `order_created` whose downstream
// provisioning FAILS must NOT be acked with 200 — that tells LS the event is
// handled and it never retries, silently losing a real payment. The handler must
// return 5xx so LS re-delivers. We drive the real route over HTTP and rely on
// getDatabase() being unavailable in the unit env to force the processing failure.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHmac } from "crypto";
import express from "express";
import type { Server } from "node:http";
import { verifyLemonSignature, paymentsRouter } from "../../functions/src/api/routes/payments";

const SECRET = "ls_whsec_test_secret";

/** LS X-Signature = hex HMAC-SHA256 of the raw body with the webhook secret. */
function sign(raw: string, secret: string): string {
  return createHmac("sha256", secret).update(Buffer.from(raw, "utf8")).digest("hex");
}

describe("verifyLemonSignature", () => {
  const body = JSON.stringify({ meta: { event_name: "order_created" }, data: {} });

  it("accepts a correctly-signed payload", () => {
    expect(verifyLemonSignature(Buffer.from(body), sign(body, SECRET), SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const header = sign(body, SECRET);
    const tampered = Buffer.from(body.replace("order_created", "order_refunded"));
    expect(verifyLemonSignature(tampered, header, SECRET)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    expect(verifyLemonSignature(Buffer.from(body), sign(body, "attacker"), SECRET)).toBe(false);
  });

  it("rejects an empty / malformed header", () => {
    expect(verifyLemonSignature(Buffer.from(body), "", SECRET)).toBe(false);
    expect(verifyLemonSignature(Buffer.from(body), "deadbeef", SECRET)).toBe(false);
  });
});

// ── POST /webhook ack semantics ──────────────────────────────────────────────
// Drive the REAL paymentsRouter over HTTP. getDatabase() is unavailable in this
// unit env, so a paid order that reaches the token claim throws — standing in for
// a real transient RTDB failure in prod.
describe("POST /webhook ack semantics", () => {
  let server: Server;
  let baseUrl = "";

  beforeAll(async () => {
    process.env.LEMONSQUEEZY_WEBHOOK_SECRET = SECRET;
    const app = express();
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
      headers: { "Content-Type": "application/json", "x-signature": header },
      body: rawBody,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, json };
  }

  const HEX_TOKEN = "a".repeat(32); // valid TOKEN_HEX_RE

  const paidOrder = (token: string | undefined) =>
    JSON.stringify({
      meta: { event_name: "order_created", custom_data: token ? { token } : {} },
      data: { id: "123", attributes: { status: "paid", total: 150000, currency: "ILS", first_order_item: { variant_id: 1 } } },
    });

  it("returns 5xx (so LS retries) when provisioning hits the db (unavailable here)", async () => {
    const raw = paidOrder(HEX_TOKEN);
    const { status } = await postWebhook(raw, sign(raw, SECRET));
    // Reaches the token claim → getDatabase() throws here → must 5xx so LS retries.
    expect(status).toBeGreaterThanOrEqual(500);
  });

  it("acks 200 for an irrelevant event type (no retry storm)", async () => {
    const raw = JSON.stringify({ meta: { event_name: "subscription_created" }, data: {} });
    const { status, json } = await postWebhook(raw, sign(raw, SECRET));
    expect(status).toBe(200);
    expect(json.received).toBe(true);
  });

  it("acks 200 for a paid order with no token (nothing to provision)", async () => {
    const raw = paidOrder(undefined);
    const { status, json } = await postWebhook(raw, sign(raw, SECRET));
    expect(status).toBe(200);
    expect(json.received).toBe(true);
  });

  it("acks 200 for a non-paid order (status pending → ignore)", async () => {
    const raw = JSON.stringify({
      meta: { event_name: "order_created", custom_data: { token: HEX_TOKEN } },
      data: { id: "123", attributes: { status: "pending" } },
    });
    const { status, json } = await postWebhook(raw, sign(raw, SECRET));
    expect(status).toBe(200);
    expect(json.received).toBe(true);
  });

  it("rejects a forged signature with 400 (never reaches processing)", async () => {
    const raw = paidOrder(HEX_TOKEN);
    const { status } = await postWebhook(raw, "deadbeefdeadbeef");
    expect(status).toBe(400);
  });
});
