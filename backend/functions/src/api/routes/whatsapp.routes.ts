// Admin WhatsApp setup + template-management API (all admin-only). Backs the
// "WhatsApp Setup" and "Message Templates" admin pages.
//
//   GET    /whatsapp/status              resolved config flags + per-slot Meta status
//   PATCH  /whatsapp/config              write non-secret config to adminSettings
//   GET    /whatsapp/templates           the 4 slots with live Meta status + content
//   POST   /whatsapp/templates/:slot     create the slot's template on Meta
//   POST   /whatsapp/templates/:slot/edit  edit + resubmit (back to PENDING)
//   DELETE /whatsapp/templates/:slot     delete on Meta + clear the slot mapping
//   POST   /whatsapp/test-send           send a test message to a number
//
// SECURITY: this never reads or writes the access token / app secret — those stay
// in env. Only non-secret config (phone id, WABA id, verify token, toggles, daily
// cap, fallback text, slot→template-name map) is persisted, to adminSettings.
import { Router, Response } from "express";
import { getDatabase } from "firebase-admin/database";
import { AuthRequest, requireAuth, requireAdmin } from "../middleware/auth";
import { uidRateLimit } from "../middleware/rateLimit";
import { HOUR_MS } from "../../constants/time";
import { normalisePhone } from "../../helpers";
import { sendWhatsAppText, sendWhatsAppTemplate } from "../../whatsapp";
import {
  getWhatsAppConfig,
  isConfigured,
  invalidateWhatsAppConfigCache,
  WhatsAppConfig,
  InviteSlot,
} from "../../whatsappConfig";
import { buildInviteSendComponents } from "../../whatsappInvite";
import {
  INVITE_SLOTS,
  slotParts,
  templateNameForSlot,
  buildCreateComponents,
  parseTemplateContent,
  metaCreateTemplate,
  metaListTemplates,
  metaEditTemplate,
  metaDeleteTemplate,
  MetaTemplate,
  TemplateCategory,
} from "../../whatsappTemplates";

export const whatsappRouter = Router();

const MAX_MSG_LEN = 4000;
const MAX_LABEL_LEN = 25;

/** adminSettings key that stores each slot's approved template name. */
const SLOT_CONFIG_KEY: Record<InviteSlot, string> = {
  physical_ar: "waTemplatePhysicalAr",
  physical_he: "waTemplatePhysicalHe",
  digital_ar: "waTemplateDigitalAr",
  digital_he: "waTemplateDigitalHe",
};

function isInviteSlot(v: unknown): v is InviteSlot {
  return typeof v === "string" && (INVITE_SLOTS as string[]).includes(v);
}

function clampStr(v: unknown, max: number): string {
  return (typeof v === "string" ? v.trim() : "").slice(0, max);
}

async function writeAdminSettings(patch: Record<string, unknown>): Promise<void> {
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) updates[`adminSettings/${k}`] = v;
  await getDatabase().ref().update(updates);
  invalidateWhatsAppConfigCache();
}

// ─── Per-slot status (config name + live Meta status/content) ──────────────────

interface SlotStatus {
  slot: InviteSlot;
  name: string;
  language: "ar" | "he";
  type: "physical" | "digital";
  status: string; // Meta status, or "none" when the template doesn't exist yet
  category: string | null;
  bodyText: string;
  buttonLabel: string;
}

async function slotStatuses(cfg: WhatsAppConfig): Promise<{ slots: SlotStatus[]; metaError: string | null }> {
  const byKey = new Map<string, MetaTemplate>();
  let metaError: string | null = null;
  if (cfg.token && cfg.wabaId) {
    const list = await metaListTemplates({ wabaId: cfg.wabaId, token: cfg.token });
    if (list.ok) {
      for (const t of list.data?.data ?? []) {
        if (t.name && t.language) byKey.set(`${t.name}|${t.language}`, t);
      }
    } else {
      // Couldn't reach Meta — surface it so the UI shows "live status unavailable"
      // instead of falsely reporting every slot as "none" (which invites a
      // duplicate-create that Meta would reject).
      metaError = list.error ?? "meta_list_failed";
    }
  }
  const slots = INVITE_SLOTS.map((slot) => {
    const { type, locale } = slotParts(slot);
    const name = cfg.templates[slot] || templateNameForSlot(slot);
    const meta = byKey.get(`${name}|${locale}`);
    const content = meta ? parseTemplateContent(meta.components) : { bodyText: "", buttonLabel: "" };
    return {
      slot,
      name,
      language: locale,
      type,
      status: meta?.status ?? "none",
      category: meta?.category ?? null,
      ...content,
    };
  });
  return { slots, metaError };
}

/** Non-secret projection of the config — NEVER includes token / appSecret. Used
 *  by every response so the Meta credentials can't leak into the admin's browser. */
function sanitizeConfig(cfg: WhatsAppConfig) {
  return {
    configured: isConfigured(cfg),
    hasToken: !!cfg.token,
    hasAppSecret: !!cfg.appSecret,
    phoneId: cfg.phoneId,
    wabaId: cfg.wabaId,
    verifyTokenSet: !!cfg.verifyToken,
    autoSendEnabled: cfg.autoSendEnabled,
    dailyCap: cfg.dailyCap,
    fallbackText: cfg.fallbackText,
  };
}

// ─── GET /whatsapp/status ──────────────────────────────────────────────────────

whatsappRouter.get(
  "/status",
  requireAuth,
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      const cfg = await getWhatsAppConfig();
      const { slots, metaError } = await slotStatuses(cfg);
      res.json({ ...sanitizeConfig(cfg), slots, metaError });
    } catch (err) {
      res.status(500).json({ error: "status_failed", detail: detail(err) });
    }
  },
);

// ─── PATCH /whatsapp/config ────────────────────────────────────────────────────
// Writes only the non-secret config keys. Template-name mapping is set by the
// template routes, not here.

whatsappRouter.patch(
  "/config",
  requireAuth,
  requireAdmin,
  uidRateLimit("waConfig", 120, HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};

    if ("phoneId" in body) patch.waPhoneId = clampStr(body.phoneId, 64);
    if ("wabaId" in body) patch.waWabaId = clampStr(body.wabaId, 64);
    if ("verifyToken" in body) patch.waVerifyToken = clampStr(body.verifyToken, 128);
    if ("fallbackTextAr" in body) patch.waFallbackTextAr = clampStr(body.fallbackTextAr, MAX_MSG_LEN);
    if ("fallbackTextHe" in body) patch.waFallbackTextHe = clampStr(body.fallbackTextHe, MAX_MSG_LEN);
    if ("autoSendEnabled" in body) {
      if (typeof body.autoSendEnabled !== "boolean") {
        res.status(400).json({ error: "invalid_type", field: "autoSendEnabled" });
        return;
      }
      patch.waAutoSendEnabled = body.autoSendEnabled;
    }
    if ("dailyCap" in body) {
      const n = Number(body.dailyCap);
      if (!Number.isFinite(n) || n < 1 || n > 100000) {
        res.status(400).json({ error: "invalid_cap", field: "dailyCap" });
        return;
      }
      patch.waDailyCap = Math.floor(n);
    }

    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: "empty_patch" });
      return;
    }
    try {
      await writeAdminSettings(patch);
      // Return the sanitized projection (never the raw token / app secret).
      res.json(sanitizeConfig(await getWhatsAppConfig()));
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: detail(err) });
    }
  },
);

// ─── GET /whatsapp/templates ───────────────────────────────────────────────────

whatsappRouter.get(
  "/templates",
  requireAuth,
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      const { slots, metaError } = await slotStatuses(await getWhatsAppConfig());
      res.json({ slots, metaError });
    } catch (err) {
      res.status(500).json({ error: "list_failed", detail: detail(err) });
    }
  },
);

// ─── POST /whatsapp/templates/:slot  (create) ──────────────────────────────────

whatsappRouter.post(
  "/templates/:slot",
  requireAuth,
  requireAdmin,
  uidRateLimit("waTemplateCreate", 30, HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    const slot = req.params.slot;
    if (!isInviteSlot(slot)) { res.status(400).json({ error: "invalid_slot" }); return; }
    const parsed = parseDraft(req.body);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }

    const cfg = await getWhatsAppConfig();
    const guard = requireMgmt(cfg, res);
    if (!guard) return;

    const { locale } = slotParts(slot);
    const name = templateNameForSlot(slot);
    const components = buildCreateComponents(slot, parsed.draft);
    const r = await metaCreateTemplate({
      wabaId: cfg.wabaId, token: cfg.token, name, language: locale,
      category: parsed.draft.category, components,
    });
    if (!r.ok) { res.status(502).json({ error: "meta_error", detail: r.error }); return; }

    // Remember which template fills this slot so the send path picks it up.
    await writeAdminSettings({ [SLOT_CONFIG_KEY[slot]]: name });
    res.json({ ok: true, name, meta: r.data });
  },
);

// ─── POST /whatsapp/templates/:slot/edit  (edit + resubmit) ────────────────────

whatsappRouter.post(
  "/templates/:slot/edit",
  requireAuth,
  requireAdmin,
  uidRateLimit("waTemplateEdit", 30, HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    const slot = req.params.slot;
    if (!isInviteSlot(slot)) { res.status(400).json({ error: "invalid_slot" }); return; }
    const parsed = parseDraft(req.body);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }

    const cfg = await getWhatsAppConfig();
    const guard = requireMgmt(cfg, res);
    if (!guard) return;

    const { locale } = slotParts(slot);
    const name = cfg.templates[slot] || templateNameForSlot(slot);

    // Editing requires the template id — look it up by name + language.
    const list = await metaListTemplates({ wabaId: cfg.wabaId, token: cfg.token });
    if (!list.ok) { res.status(502).json({ error: "meta_error", detail: list.error }); return; }
    const existing = (list.data?.data ?? []).find((t) => t.name === name && t.language === locale);
    if (!existing?.id) { res.status(404).json({ error: "template_not_found" }); return; }

    const components = buildCreateComponents(slot, parsed.draft);
    const r = await metaEditTemplate({
      templateId: existing.id, token: cfg.token, category: parsed.draft.category, components,
    });
    if (!r.ok) { res.status(502).json({ error: "meta_error", detail: r.error }); return; }
    res.json({ ok: true, name });
  },
);

// ─── DELETE /whatsapp/templates/:slot ──────────────────────────────────────────

whatsappRouter.delete(
  "/templates/:slot",
  requireAuth,
  requireAdmin,
  uidRateLimit("waTemplateDelete", 30, HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    const slot = req.params.slot;
    if (!isInviteSlot(slot)) { res.status(400).json({ error: "invalid_slot" }); return; }
    const cfg = await getWhatsAppConfig();
    const guard = requireMgmt(cfg, res);
    if (!guard) return;

    const name = cfg.templates[slot] || templateNameForSlot(slot);
    const r = await metaDeleteTemplate({ wabaId: cfg.wabaId, token: cfg.token, name });
    if (!r.ok) { res.status(502).json({ error: "meta_error", detail: r.error }); return; }
    await writeAdminSettings({ [SLOT_CONFIG_KEY[slot]]: "" });
    res.json({ ok: true });
  },
);

// ─── POST /whatsapp/test-send ──────────────────────────────────────────────────
// Send a test message to a number: a chosen slot's template (example data), or a
// free-form text. Verifies end-to-end without leaving the page.

whatsappRouter.post(
  "/test-send",
  requireAuth,
  requireAdmin,
  uidRateLimit("waTestSend", 30, HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    const e164 = normalisePhone(String((req.body?.phone ?? "")));
    if (!e164) { res.status(400).json({ error: "invalid_phone" }); return; }
    const cfg = await getWhatsAppConfig();
    if (!isConfigured(cfg)) { res.status(409).json({ error: "not_configured" }); return; }
    const creds = { token: cfg.token, phoneId: cfg.phoneId };

    try {
      const slot = req.body?.slot;
      if (isInviteSlot(slot)) {
        const { type, locale } = slotParts(slot);
        const name = cfg.templates[slot] || templateNameForSlot(slot);
        const components = buildInviteSendComponents({
          guestName: "Test", type, groomUsername: "test", token: "testtoken",
        });
        const send = await sendWhatsAppTemplate(e164, name, locale, components, creds);
        res.json({ send });
        return;
      }
      const text = clampStr(req.body?.text, MAX_MSG_LEN) || "✓ dawa — test message";
      const send = await sendWhatsAppText(e164, text, creds);
      res.json({ send });
    } catch (err) {
      res.status(500).json({ error: "send_failed", detail: detail(err) });
    }
  },
);

// ─── Helpers ───────────────────────────────────────────────────────────────────

type ParsedDraft =
  | { ok: true; draft: { bodyText: string; buttonLabel: string; category: TemplateCategory; exampleName?: string } }
  | { ok: false; error: string };

function parseDraft(body: unknown): ParsedDraft {
  const b = (body ?? {}) as Record<string, unknown>;
  const bodyText = clampStr(b.bodyText, MAX_MSG_LEN);
  const buttonLabel = clampStr(b.buttonLabel, MAX_LABEL_LEN);
  const category = b.category === "MARKETING" ? "MARKETING" : "UTILITY";
  const exampleName = clampStr(b.exampleName, 60);
  if (!bodyText) return { ok: false, error: "missing_body" };
  if (!/\{\{1\}\}/.test(bodyText)) return { ok: false, error: "body_missing_variable" };
  // The builder only supplies one body example ({{1}} = name); a {{2}}+ would be
  // rejected by Meta with an opaque 502. Reject it up front with a clear error.
  if (/\{\{\s*([2-9]|\d{2,})\s*\}\}/.test(bodyText)) return { ok: false, error: "body_too_many_variables" };
  if (!buttonLabel) return { ok: false, error: "missing_button_label" };
  return { ok: true, draft: { bodyText, buttonLabel, category, exampleName } };
}

/** Template management needs the env token (whatsapp_business_management) + WABA id. */
function requireMgmt(cfg: WhatsAppConfig, res: Response): boolean {
  if (!cfg.token) { res.status(409).json({ error: "no_token" }); return false; }
  if (!cfg.wabaId) { res.status(409).json({ error: "no_waba_id" }); return false; }
  return true;
}

function detail(err: unknown): string | undefined {
  if (process.env.DAWA_DEBUG_ERRORS !== "1") return undefined;
  return err instanceof Error ? err.message : String(err);
}
