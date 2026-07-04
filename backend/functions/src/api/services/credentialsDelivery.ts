// WhatsApp delivery of generated login credentials (username + temp password +
// login URL) via the Meta-approved credentials template (ar/he).
//
// Shared by the two account-provisioning paths:
//   - the Lemon Squeezy webhook (routes/payments.ts) — paid groom self-signup
//   - admin-created / admin-reset groom & driver accounts (routes/users.ts)
//
// This module owns ONLY the send: config resolve, daily-cap reservation and the
// template call. Callers own what a failure means (the webhook stamps the
// payment token; the users routes fall back to a show-once response for the
// admin). Never throws and NEVER logs the password — a delivery failure is a
// result value, not an exception.

import { getWhatsAppConfig, isConfigured } from "../../whatsappConfig";
import { sendWhatsAppTemplate } from "../../whatsapp";
import { reserveDailySend } from "../../waRateLimit";
import { errorMessage } from "../errorDetail";

// Link origin for the login URL in the message (same env fallback as the other
// WhatsApp senders — each module computes its own copy by convention).
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "https://dawa-aa793.web.app").replace(/\/+$/, "");

export interface CredentialsSendResult {
  delivered: boolean;
  /** Machine-readable failure: not_configured | daily_cap | <send error, ≤240 chars>. */
  error?: string;
}

/**
 * Send `{username, password, loginUrl}` through the credentials template in
 * `lang`. Resolves `{delivered: false, error}` on any failure (config missing,
 * auto-send disabled, daily cap, API error, throw) — callers decide the
 * fallback path.
 */
export async function sendCredentialsWhatsApp(args: {
  phoneE164: string;
  lang: "ar" | "he";
  username: string;
  password: string;
}): Promise<CredentialsSendResult> {
  try {
    const cfg = await getWhatsAppConfig();
    const tmpl = cfg.credentialsTemplates[args.lang];
    if (!isConfigured(cfg) || !cfg.autoSendEnabled || !tmpl) {
      return { delivered: false, error: "not_configured" };
    }
    // Respect the shared daily cap — credentials sends count like any other.
    const reservation = await reserveDailySend(cfg.dailyCap);
    if (!reservation.allowed) {
      return { delivered: false, error: "daily_cap" };
    }
    const loginUrl = `${PUBLIC_BASE_URL}/portal/login`;
    const components = [
      {
        type: "body",
        parameters: [
          { type: "text", text: args.username },
          { type: "text", text: args.password },
          { type: "text", text: loginUrl },
        ],
      },
    ];
    const result = await sendWhatsAppTemplate(args.phoneE164, tmpl, args.lang, components, {
      token: cfg.token,
      phoneId: cfg.phoneId,
    });
    if (result.ok) return { delivered: true };
    return { delivered: false, error: (result.error || "send_failed").slice(0, 240) };
  } catch (err) {
    return { delivered: false, error: (errorMessage(err) ?? "send_failed").slice(0, 240) };
  }
}
