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

  it("reminder + your-photos + credentials templates resolve DB over env, blank when unset", () => {
    const env = {
      ...ENV,
      WHATSAPP_REMINDER_TEMPLATE_AR: "env_reminder_ar",
      WHATSAPP_YOURPHOTOS_TEMPLATE: "env_yourphotos",
      WHATSAPP_CREDENTIALS_TEMPLATE_HE: "env_cred_he",
    } as NodeJS.ProcessEnv;
    const cfg = resolveWhatsAppConfig(
      { waTemplateReminderHe: "db_reminder_he", waTemplateYourPhotos: "db_yourphotos" },
      env,
    );
    expect(cfg.reminderTemplates.ar).toBe("env_reminder_ar"); // env fallback
    expect(cfg.reminderTemplates.he).toBe("db_reminder_he"); // DB wins
    expect(cfg.yourPhotosTemplate).toBe("db_yourphotos"); // DB wins over env
    expect(cfg.credentialsTemplates.he).toBe("env_cred_he");
    expect(cfg.credentialsTemplates.ar).toBe(""); // unset → blank
    // Unset everything → all blank (feature dormant, no accidental sends).
    const bare = resolveWhatsAppConfig({}, ENV);
    expect(bare.reminderTemplates.ar).toBe("");
    expect(bare.reminderTemplates.he).toBe("");
    expect(bare.yourPhotosTemplate).toBe("");
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
