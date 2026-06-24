// Resolved WhatsApp configuration — merges admin-set DB config (adminSettings)
// over env-var fallbacks, so the admin "WhatsApp Setup" page can manage the
// non-secret config without touching env.
//
// SECURITY: the two true secrets — the access token (WHATSAPP_TOKEN) and the app
// secret (WHATSAPP_APP_SECRET) — are read ONLY from env, NEVER the DB. adminSettings
// is readable by every authenticated user (drivers/grooms), so the token must never
// live there. Everything else (phone id, WABA id, verify token, template names,
// toggles, daily cap, fallback text) is admin-editable in the DB and overrides env.
//
// The DB read is cached ~60s to avoid a round-trip on every send; admin edits are
// eventually-consistent within that window.
import { getDatabase } from "firebase-admin/database";

export type InviteSlot = "physical_ar" | "physical_he" | "digital_ar" | "digital_he";

export interface WhatsAppConfig {
  token: string; // env only
  appSecret: string; // env only
  phoneId: string; // db ?? env
  wabaId: string; // db ?? env
  verifyToken: string; // db ?? env
  autoSendEnabled: boolean; // db (default true)
  dailyCap: number; // db (default 250)
  templates: Record<InviteSlot, string>; // db ?? env (slot → approved template name)
  fallbackText: { ar: string; he: string }; // db ?? built-in default
}

export const DEFAULT_DAILY_CAP = 250;

// Built-in default free-form text (used only on the text-fallback path when the
// admin hasn't set a per-language fallback and the caller passed no message body).
const DEFAULT_FALLBACK_AR = "لقد تمت دعوتكم 🌿 يسعدنا تأكيد حضوركم.";
const DEFAULT_FALLBACK_HE = "הוזמנתם 🌿 נשמח לאישור הגעתכם.";

/** Trimmed string from an unknown DB/env value, or "" when absent/blank. */
function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** First non-empty trimmed string among the candidates (db wins over env). */
function pick(...vals: unknown[]): string {
  for (const v of vals) {
    const s = str(v);
    if (s) return s;
  }
  return "";
}

/**
 * Pure merge of DB admin settings over env — the testable core of the resolver.
 * `db` is the raw adminSettings object; `env` is process.env (or a stub).
 */
export function resolveWhatsAppConfig(
  db: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
): WhatsAppConfig {
  const capRaw = Number(db.waDailyCap);
  return {
    token: str(env.WHATSAPP_TOKEN),
    appSecret: str(env.WHATSAPP_APP_SECRET),
    phoneId: pick(db.waPhoneId, env.WHATSAPP_PHONE_ID),
    wabaId: pick(db.waWabaId, env.WHATSAPP_WABA_ID),
    verifyToken: pick(db.waVerifyToken, env.WHATSAPP_VERIFY_TOKEN),
    // Default ON: an unset toggle means "send" so the feature works once creds
    // exist. Only an explicit `false` disables auto-send.
    autoSendEnabled: db.waAutoSendEnabled !== false,
    dailyCap: Number.isFinite(capRaw) && capRaw > 0 ? Math.floor(capRaw) : DEFAULT_DAILY_CAP,
    templates: {
      physical_ar: pick(db.waTemplatePhysicalAr, env.WHATSAPP_INVITE_TEMPLATE_PHYSICAL_AR),
      physical_he: pick(db.waTemplatePhysicalHe, env.WHATSAPP_INVITE_TEMPLATE_PHYSICAL_HE),
      digital_ar: pick(db.waTemplateDigitalAr, env.WHATSAPP_INVITE_TEMPLATE_DIGITAL_AR),
      digital_he: pick(db.waTemplateDigitalHe, env.WHATSAPP_INVITE_TEMPLATE_DIGITAL_HE),
    },
    fallbackText: {
      ar: pick(db.waFallbackTextAr) || DEFAULT_FALLBACK_AR,
      he: pick(db.waFallbackTextHe) || DEFAULT_FALLBACK_HE,
    },
  };
}

const CACHE_TTL_MS = 60_000;
let cache: { at: number; cfg: WhatsAppConfig } | null = null;

/** Resolved config, reading adminSettings (cached ~60s) merged over env. Never
 *  throws — a DB read failure falls back to env-only config. */
export async function getWhatsAppConfig(): Promise<WhatsAppConfig> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.cfg;
  let db: Record<string, unknown> = {};
  try {
    const snap = await getDatabase().ref("adminSettings").get();
    if (snap.exists()) db = (snap.val() as Record<string, unknown>) ?? {};
  } catch {
    /* env-only fallback */
  }
  const cfg = resolveWhatsAppConfig(db, process.env);
  cache = { at: now, cfg };
  return cfg;
}

/** Drop the cache so the next getWhatsAppConfig() re-reads — call after the admin
 *  saves config so the change takes effect immediately instead of ≤60s later. */
export function invalidateWhatsAppConfigCache(): void {
  cache = null;
}

/** Configured = we have an access token (env) AND a sending phone id (db/env). */
export function isConfigured(cfg: WhatsAppConfig): boolean {
  return !!(cfg.token && cfg.phoneId);
}
