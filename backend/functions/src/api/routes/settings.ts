// Admin-tweakable site settings.
//
//   GET   /settings         — any authenticated user (drivers/grooms read template)
//   GET   /settings/public  — PUBLIC (no auth): only the ENABLED contact channels,
//                             so the marketing site can render a "talk to us" CTA.
//   PATCH /settings         — admin only (RTDB rules also enforce this)
//
// Backed by `/adminSettings` in RTDB. Fields:
//   messaging:  messageBody, formLink, mode, digitalBaseUrl, digitalMessage
//   contact:    contactWhatsapp, contactPhone, contactEmail,
//               socialFacebook, socialInstagram, socialTiktok  (strings)
//               + matching *Enabled booleans to show/hide each channel.
//
// Validation mirrors the schema in `database.rules.json` so a misbehaving
// client gets a clear 400 instead of a cryptic RTDB rejection.

import { Router, Response } from "express";
import { getDatabase } from "firebase-admin/database";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";

// ─── Schema constants ─────────────────────────────────────────────────────────

const MAX_MESSAGE_BODY_LEN = 4000;
const MAX_FORM_LINK_LEN = 1000;
const MAX_DIGITAL_MSG_LEN = 4000;
const MAX_PHONE_LEN = 32;
const MAX_EMAIL_LEN = 200;
const MAX_URL_LEN = 500;
const HTTPS_PREFIX = "https://";

const VALID_MODES = new Set(["manual", "digital"]);

// Contact channels (string value + a boolean *Enabled toggle each).
const CONTACT_STRING_KEYS = [
  "contactWhatsapp",
  "contactPhone",
  "contactEmail",
  "socialFacebook",
  "socialInstagram",
  "socialTiktok",
] as const;
const CONTACT_BOOL_KEYS = CONTACT_STRING_KEYS.map((k) => `${k}Enabled`);
const CONTACT_BOOL_SET = new Set(CONTACT_BOOL_KEYS);
const SOCIAL_URL_KEYS = new Set(["socialFacebook", "socialInstagram", "socialTiktok"]);

/** Names of fields the PATCH endpoint is allowed to set. */
const ALLOWED_KEYS = new Set<string>([
  "messageBody",
  "formLink",
  "mode",
  "digitalBaseUrl",
  "digitalMessage",
  ...CONTACT_STRING_KEYS,
  ...CONTACT_BOOL_KEYS,
]);

export const settingsRouter = Router();

// ─── GET /settings ────────────────────────────────────────────────────────────

/**
 * Read the full settings record. Returns `{}` when the node does not exist.
 */
settingsRouter.get("/", requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    const snap = await getDatabase().ref("adminSettings").get();
    res.json(snap.val() ?? {});
  } catch (err) {
    res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
  }
});

// ─── GET /settings/public ──────────────────────────────────────────────────────

/**
 * PUBLIC, unauthenticated. Returns ONLY the contact channels the admin has
 * filled in AND enabled — nothing else from /adminSettings is exposed. Used by
 * the marketing site to render direct "contact us on WhatsApp" links.
 */
settingsRouter.get("/public", async (_req: AuthRequest, res: Response) => {
  try {
    const snap = await getDatabase().ref("adminSettings").get();
    const s = (snap.val() ?? {}) as Record<string, unknown>;
    // Short cache: the marketing site can pick up a contact change within a
    // minute without a redeploy, but we don't hammer RTDB on every page view.
    res.set("Cache-Control", "public, max-age=60");
    res.json(projectPublicContact(s));
  } catch (err) {
    res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
  }
});

// ─── PATCH /settings ──────────────────────────────────────────────────────────

/**
 * Merge-patch admin settings. Only the allowlisted keys may be set; any other
 * key fails with 400 `unknown_field`. Returns the updated settings on success.
 */
settingsRouter.patch(
  "/",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const patch = req.body;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }

    const validation = validatePatch(patch as Record<string, unknown>);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error, field: validation.field });
      return;
    }

    try {
      await getDatabase().ref("adminSettings").update(validation.patch);
      const snap = await getDatabase().ref("adminSettings").get();
      res.json(snap.val() ?? {});
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
  }
);

// ─── Projection ────────────────────────────────────────────────────────────────

/**
 * Keep only the enabled, non-empty contact channels for public consumption.
 * Output keys are short, stable names the frontend resolves.
 */
function projectPublicContact(s: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const pick = (valueKey: string, outKey: string) => {
    const enabled = s[`${valueKey}Enabled`] === true;
    const value = typeof s[valueKey] === "string" ? (s[valueKey] as string).trim() : "";
    if (enabled && value) out[outKey] = value;
  };
  pick("contactWhatsapp", "whatsapp");
  pick("contactPhone", "phone");
  pick("contactEmail", "email");
  pick("socialFacebook", "facebook");
  pick("socialInstagram", "instagram");
  pick("socialTiktok", "tiktok");
  return out;
}

// ─── Validation ───────────────────────────────────────────────────────────────

type ValidationOk = { ok: true; patch: Record<string, string | boolean> };
type ValidationErr = { ok: false; error: string; field?: string };
type ValidationResult = ValidationOk | ValidationErr;

/**
 * Validate an incoming patch body against the allowed schema. Returns the
 * sanitized patch (only the known keys) on success. Rules mirror
 * database.rules.json. At least one valid key must be present.
 */
function validatePatch(patch: Record<string, unknown>): ValidationResult {
  const sanitized: Record<string, string | boolean> = {};

  for (const key of Object.keys(patch)) {
    if (!ALLOWED_KEYS.has(key)) {
      return { ok: false, error: "unknown_field", field: key };
    }
    const value = patch[key];

    // Boolean enable/disable toggles.
    if (CONTACT_BOOL_SET.has(key)) {
      if (typeof value !== "boolean") return { ok: false, error: "invalid_type", field: key };
      sanitized[key] = value;
      continue;
    }

    if (typeof value !== "string") {
      return { ok: false, error: "invalid_type", field: key };
    }
    if (key === "messageBody" && value.length > MAX_MESSAGE_BODY_LEN) {
      return { ok: false, error: "too_long", field: key };
    }
    if (key === "formLink") {
      if (value.length > MAX_FORM_LINK_LEN) return { ok: false, error: "too_long", field: key };
      if (value.length > 0 && !value.startsWith(HTTPS_PREFIX)) {
        return { ok: false, error: "must_be_https", field: key };
      }
    }
    if (key === "mode" && !VALID_MODES.has(value)) {
      return { ok: false, error: "invalid_mode", field: key };
    }
    if (key === "digitalBaseUrl") {
      if (value.length > MAX_FORM_LINK_LEN) return { ok: false, error: "too_long", field: key };
      if (value.length > 0 && !value.startsWith(HTTPS_PREFIX)) {
        return { ok: false, error: "must_be_https", field: key };
      }
    }
    if (key === "digitalMessage" && value.length > MAX_DIGITAL_MSG_LEN) {
      return { ok: false, error: "too_long", field: key };
    }
    if ((key === "contactWhatsapp" || key === "contactPhone") && value.length > MAX_PHONE_LEN) {
      return { ok: false, error: "too_long", field: key };
    }
    if (key === "contactEmail") {
      if (value.length > MAX_EMAIL_LEN) return { ok: false, error: "too_long", field: key };
      if (value.length > 0 && !value.includes("@")) {
        return { ok: false, error: "invalid_email", field: key };
      }
    }
    if (SOCIAL_URL_KEYS.has(key)) {
      if (value.length > MAX_URL_LEN) return { ok: false, error: "too_long", field: key };
      if (value.length > 0 && !value.startsWith(HTTPS_PREFIX)) {
        return { ok: false, error: "must_be_https", field: key };
      }
    }
    sanitized[key] = value;
  }

  if (Object.keys(sanitized).length === 0) {
    return { ok: false, error: "empty_patch" };
  }
  return { ok: true, patch: sanitized };
}

function errorMessage(err: unknown): string | undefined {
  // Public/admin 5xx responses must not echo raw error text in production — it
  // can leak Firestore paths / GCS bucket names. Suppressed by default; set
  // DAWA_DEBUG_ERRORS=1 (e.g. functions/.env.local) to see detail locally.
  if (process.env.DAWA_DEBUG_ERRORS !== "1") return undefined;
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "unknown";
}
