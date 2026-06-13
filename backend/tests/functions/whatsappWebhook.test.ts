// Unit tests for the WhatsApp webhook verification helper. Confirms Meta's
// subscription challenge is echoed only when the verify token matches the
// configured WHATSAPP_VERIFY_TOKEN — otherwise an attacker could subscribe a
// rogue endpoint or probe the token.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { verifyWebhookChallenge, isWhatsAppConfigured } from "../../functions/src/whatsapp";

const ORIG = { ...process.env };
afterEach(() => { process.env = { ...ORIG }; });
beforeEach(() => { process.env = { ...ORIG }; });

describe("verifyWebhookChallenge", () => {
  it("echoes the challenge when the verify token matches", () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "secret-verify";
    const out = verifyWebhookChallenge({
      "hub.mode": "subscribe",
      "hub.verify_token": "secret-verify",
      "hub.challenge": "12345",
    });
    expect(out).toBe("12345");
  });

  it("returns null on a wrong token", () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "secret-verify";
    const out = verifyWebhookChallenge({
      "hub.mode": "subscribe",
      "hub.verify_token": "wrong",
      "hub.challenge": "12345",
    });
    expect(out).toBeNull();
  });

  it("returns null when no verify token is configured", () => {
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    const out = verifyWebhookChallenge({
      "hub.mode": "subscribe",
      "hub.verify_token": "anything",
      "hub.challenge": "12345",
    });
    expect(out).toBeNull();
  });

  it("returns null when mode is not subscribe", () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "secret-verify";
    expect(verifyWebhookChallenge({
      "hub.mode": "unsubscribe",
      "hub.verify_token": "secret-verify",
      "hub.challenge": "12345",
    })).toBeNull();
  });
});

describe("isWhatsAppConfigured", () => {
  it("is false without token/phone id", () => {
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_ID;
    expect(isWhatsAppConfigured()).toBe(false);
  });
  it("is true when both are set", () => {
    process.env.WHATSAPP_TOKEN = "t";
    process.env.WHATSAPP_PHONE_ID = "p";
    expect(isWhatsAppConfigured()).toBe(true);
  });
});
