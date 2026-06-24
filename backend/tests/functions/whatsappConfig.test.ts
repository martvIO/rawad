// Unit tests for the WhatsApp config resolver's pure merge logic — DB admin
// settings override env, secrets stay env-only, and the toggle/cap/fallback
// defaults are correct. No DB touched (resolveWhatsAppConfig is pure).
import { describe, it, expect } from "vitest";
import { resolveWhatsAppConfig, isConfigured, DEFAULT_DAILY_CAP } from "../../functions/src/whatsappConfig";

const ENV = {
  WHATSAPP_TOKEN: "env-token",
  WHATSAPP_APP_SECRET: "env-secret",
  WHATSAPP_PHONE_ID: "env-phone",
  WHATSAPP_WABA_ID: "env-waba",
  WHATSAPP_VERIFY_TOKEN: "env-verify",
  WHATSAPP_INVITE_TEMPLATE_DIGITAL_AR: "env_digital_ar",
} as NodeJS.ProcessEnv;

describe("resolveWhatsAppConfig", () => {
  it("token + app secret come ONLY from env (never DB)", () => {
    const cfg = resolveWhatsAppConfig(
      { WHATSAPP_TOKEN: "db-token", waToken: "db-token", appSecret: "db-secret" } as Record<string, unknown>,
      ENV,
    );
    expect(cfg.token).toBe("env-token");
    expect(cfg.appSecret).toBe("env-secret");
  });

  it("DB values override env for non-secret config", () => {
    const cfg = resolveWhatsAppConfig(
      { waPhoneId: "db-phone", waWabaId: "db-waba", waVerifyToken: "db-verify", waTemplateDigitalAr: "db_digital_ar" },
      ENV,
    );
    expect(cfg.phoneId).toBe("db-phone");
    expect(cfg.wabaId).toBe("db-waba");
    expect(cfg.verifyToken).toBe("db-verify");
    expect(cfg.templates.digital_ar).toBe("db_digital_ar");
  });

  it("falls back to env when DB value is absent or blank", () => {
    const cfg = resolveWhatsAppConfig({ waPhoneId: "   " }, ENV);
    expect(cfg.phoneId).toBe("env-phone"); // blank DB → env fallback
    expect(cfg.templates.digital_ar).toBe("env_digital_ar");
    expect(cfg.wabaId).toBe("env-waba");
  });

  it("autoSendEnabled defaults true; only explicit false disables", () => {
    expect(resolveWhatsAppConfig({}, ENV).autoSendEnabled).toBe(true);
    expect(resolveWhatsAppConfig({ waAutoSendEnabled: false }, ENV).autoSendEnabled).toBe(false);
    expect(resolveWhatsAppConfig({ waAutoSendEnabled: true }, ENV).autoSendEnabled).toBe(true);
  });

  it("dailyCap clamps to a positive number, default 250", () => {
    expect(resolveWhatsAppConfig({}, ENV).dailyCap).toBe(DEFAULT_DAILY_CAP);
    expect(resolveWhatsAppConfig({ waDailyCap: 500 }, ENV).dailyCap).toBe(500);
    expect(resolveWhatsAppConfig({ waDailyCap: 0 }, ENV).dailyCap).toBe(DEFAULT_DAILY_CAP);
    expect(resolveWhatsAppConfig({ waDailyCap: "nope" }, ENV).dailyCap).toBe(DEFAULT_DAILY_CAP);
  });

  it("fallbackText uses DB when set, else a built-in default per language", () => {
    const def = resolveWhatsAppConfig({}, ENV).fallbackText;
    expect(def.ar.length).toBeGreaterThan(0);
    expect(def.he.length).toBeGreaterThan(0);
    const custom = resolveWhatsAppConfig({ waFallbackTextAr: "اهلا" }, ENV).fallbackText;
    expect(custom.ar).toBe("اهلا");
    expect(custom.he).toBe(def.he); // unset he keeps default
  });
});

describe("isConfigured", () => {
  it("true only with both a token (env) and a phone id (db/env)", () => {
    expect(isConfigured(resolveWhatsAppConfig({}, ENV))).toBe(true);
    expect(isConfigured(resolveWhatsAppConfig({}, {} as NodeJS.ProcessEnv))).toBe(false);
    expect(isConfigured(resolveWhatsAppConfig({ waPhoneId: "p" }, { WHATSAPP_TOKEN: "t" } as NodeJS.ProcessEnv))).toBe(true);
    expect(isConfigured(resolveWhatsAppConfig({}, { WHATSAPP_TOKEN: "t" } as NodeJS.ProcessEnv))).toBe(false); // no phone id
  });
});
