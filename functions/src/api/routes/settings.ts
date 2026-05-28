// Admin-tweakable site settings.
//
//   GET   /settings        — any authenticated user (drivers/grooms read template)
//   PATCH /settings        — admin only (RTDB rules also enforce this)
//
// Backed by `/adminSettings` in RTDB. Currently two fields:
//   - messageBody  string, optional, ≤ 4000 chars (WhatsApp invite template)
//   - formLink     string, optional, ≤ 1000 chars, must start with https://
//
// Validation mirrors the schema in `database.rules.json` so a misbehaving
// client gets a clear 400 instead of a cryptic RTDB rejection.
//
// What this file does NOT do:
//   - It does not bulk-replace the doc. Only the two known keys are
//     accepted; any unknown key in the body is rejected.

import { Router, Response } from "express";
import { getDatabase } from "firebase-admin/database";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";

// ─── Schema constants ─────────────────────────────────────────────────────────

const MAX_MESSAGE_BODY_LEN = 4000;
const MAX_FORM_LINK_LEN = 1000;
const MAX_DIGITAL_MSG_LEN = 4000;
const HTTPS_PREFIX = "https://";

const VALID_MODES = new Set(["manual", "digital"]);

/** Names of fields the PATCH endpoint is allowed to set. */
const ALLOWED_KEYS = new Set([
  "messageBody",
  "formLink",
  "mode",
  "digitalBaseUrl",
  "digitalMessage",
]);

export const settingsRouter = Router();

// ─── GET /settings ────────────────────────────────────────────────────────────

/**
 * Read the full settings record. Returns `{}` when the node does not exist
 * (matches the original client behavior `snap.val() ?? {}`).
 */
settingsRouter.get("/", requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    const snap = await getDatabase().ref("adminSettings").get();
    res.json(snap.val() ?? {});
  } catch (err) {
    res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
  }
});

// ─── PATCH /settings ──────────────────────────────────────────────────────────

/**
 * Merge-patch admin settings. Only `messageBody` and `formLink` may be set;
 * any other key fails with 400 `unknown_field`.
 *
 * Returns the updated settings object on success.
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

// ─── Validation ───────────────────────────────────────────────────────────────

type ValidationOk = { ok: true; patch: Record<string, string> };
type ValidationErr = { ok: false; error: string; field?: string };
type ValidationResult = ValidationOk | ValidationErr;

/**
 * Validate an incoming patch body against the allowed schema. Returns the
 * sanitized patch (only the known keys, coerced as strings) on success.
 *
 * Rules (mirror of database.rules.json):
 *   - `messageBody` must be a string ≤ 4000 chars
 *   - `formLink` must be a string ≤ 1000 chars and start with "https://"
 *   - Any other key is rejected
 *   - At least one valid key must be present
 */
function validatePatch(patch: Record<string, unknown>): ValidationResult {
  const sanitized: Record<string, string> = {};

  for (const key of Object.keys(patch)) {
    if (!ALLOWED_KEYS.has(key)) {
      return { ok: false, error: "unknown_field", field: key };
    }
    const value = patch[key];
    if (typeof value !== "string") {
      return { ok: false, error: "invalid_type", field: key };
    }
    if (key === "messageBody" && value.length > MAX_MESSAGE_BODY_LEN) {
      return { ok: false, error: "too_long", field: key };
    }
    if (key === "formLink") {
      if (value.length > MAX_FORM_LINK_LEN) {
        return { ok: false, error: "too_long", field: key };
      }
      if (value.length > 0 && !value.startsWith(HTTPS_PREFIX)) {
        return { ok: false, error: "must_be_https", field: key };
      }
    }
    if (key === "mode" && !VALID_MODES.has(value)) {
      return { ok: false, error: "invalid_mode", field: key };
    }
    if (key === "digitalBaseUrl") {
      if (value.length > MAX_FORM_LINK_LEN) {
        return { ok: false, error: "too_long", field: key };
      }
      if (value.length > 0 && !value.startsWith(HTTPS_PREFIX)) {
        return { ok: false, error: "must_be_https", field: key };
      }
    }
    if (key === "digitalMessage" && value.length > MAX_DIGITAL_MSG_LEN) {
      return { ok: false, error: "too_long", field: key };
    }
    sanitized[key] = value;
  }

  if (Object.keys(sanitized).length === 0) {
    return { ok: false, error: "empty_patch" };
  }
  return { ok: true, patch: sanitized };
}

/**
 * Best-effort error-to-string conversion for JSON error responses.
 * Never returns the full stack; we only surface the message text.
 */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "unknown";
}
