// Unit tests for the Stripe webhook signature verification (no SDK). Confirms a
// correctly-signed payload passes, and that tampering / wrong secret / stale
// timestamp are rejected — this is the only thing standing between the public
// webhook endpoint and a forged "mark this groom paid" request.
import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { verifyStripeSignature } from "../../functions/src/api/routes/payments";

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
