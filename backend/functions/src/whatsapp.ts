// WhatsApp Cloud API (Meta Graph) — server-side send + webhook helpers.
//
// This is the backbone for real outbound messaging (delivery/read receipts,
// scheduled reminders, broadcasts) that replaces the admin manually opening
// wa.me tabs. It is the prerequisite for re-enabling the reminder promise that
// Phase 1 removed.
//
// CONFIG (set in functions/.env.local for the emulator, Secret Manager for prod;
// until set, sends are a no-op and the webhook verify returns 403):
//   WHATSAPP_TOKEN          Meta permanent access token
//   WHATSAPP_PHONE_ID       WhatsApp Business phone-number ID
//   WHATSAPP_VERIFY_TOKEN   arbitrary string also entered in the Meta webhook UI
//   WHATSAPP_APP_SECRET     Meta app secret — verifies inbound webhook POST
//                           signatures (X-Hub-Signature-256). Optional: until set,
//                           POST signature checks are skipped (and logged) for
//                           back-compat; once set, unsigned/forged POSTs are rejected.
//
// No SDK dependency: uses the Graph REST API via fetch (mirrors auth.ts/payments).
import * as crypto from "crypto";

const GRAPH_VERSION = "v21.0";

export function isWhatsAppConfigured(): boolean {
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
}

/** The "your photos are ready" flow also needs an approved template name. */
export function isYourPhotosTemplateConfigured(): boolean {
  return isWhatsAppConfigured() && !!process.env.WHATSAPP_YOURPHOTOS_TEMPLATE;
}

export type WhatsAppSendResult = { ok: boolean; id?: string; error?: string };

/**
 * Send a plain-text WhatsApp message via the Cloud API. `toPhone` may be in any
 * format; we reduce it to digits (international, no +). Returns { ok, id } or
 * { ok:false, error }. Never throws.
 */
export async function sendWhatsAppText(toPhone: string, body: string): Promise<WhatsAppSendResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) return { ok: false, error: "not_configured" };
  const to = String(toPhone || "").replace(/[^0-9]/g, "");
  if (!to) return { ok: false, error: "invalid_phone" };
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: String(body ?? "") },
      }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const err = (data?.error as { message?: string } | undefined)?.message;
      return { ok: false, error: err || `http_${res.status}` };
    }
    const messages = data?.messages as Array<{ id?: string }> | undefined;
    return { ok: true, id: messages?.[0]?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "send_failed" };
  }
}

/**
 * Send a WhatsApp **template** message (required for business-initiated
 * messages outside the 24h customer-service window — e.g. "your photos are
 * ready"). `components` is the Meta template components array (body params,
 * button params, …); callers shape it to match their approved template.
 * Config-gated and never throws, exactly like sendWhatsAppText.
 */
export async function sendWhatsAppTemplate(
  toPhone: string,
  templateName: string,
  languageCode: string,
  components: unknown[],
): Promise<WhatsAppSendResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) return { ok: false, error: "not_configured" };
  if (!templateName) return { ok: false, error: "no_template" };
  const to = String(toPhone || "").replace(/[^0-9]/g, "");
  if (!to) return { ok: false, error: "invalid_phone" };
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode || "ar" },
          ...(components && components.length ? { components } : {}),
        },
      }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const err = (data?.error as { message?: string } | undefined)?.message;
      return { ok: false, error: err || `http_${res.status}` };
    }
    const messages = data?.messages as Array<{ id?: string }> | undefined;
    return { ok: true, id: messages?.[0]?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "send_failed" };
  }
}

/**
 * Meta webhook GET verification. Meta calls the webhook with
 * `hub.mode=subscribe&hub.verify_token=…&hub.challenge=…`. Echo the challenge
 * only when the token matches our configured WHATSAPP_VERIFY_TOKEN; otherwise
 * return null and the caller responds 403. Exported pure for tests.
 */
export function verifyWebhookChallenge(query: Record<string, unknown>): string | null {
  const mode = query["hub.mode"];
  const token = query["hub.verify_token"];
  const challenge = query["hub.challenge"];
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token === expected && typeof challenge === "string") {
    return challenge;
  }
  return null;
}

/**
 * True when WHATSAPP_APP_SECRET is configured, i.e. inbound webhook POSTs should
 * have their X-Hub-Signature-256 verified. Until the secret is set, the webhook
 * proceeds without verification (back-compat) — see whatsappWebhook.ts.
 */
export function isWebhookSignatureEnforced(): boolean {
  return !!process.env.WHATSAPP_APP_SECRET;
}

/**
 * Verify Meta's `X-Hub-Signature-256` header against the RAW request body using
 * the Meta app secret (HMAC-SHA256). Returns true only on an exact, timing-safe
 * match. Call only when isWebhookSignatureEnforced() is true. Exported pure for tests.
 */
export function verifyWebhookSignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !rawBody || !signatureHeader) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const got = Buffer.from(signatureHeader);
  const want = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch — guard first.
  if (got.length !== want.length) return false;
  try {
    return crypto.timingSafeEqual(got, want);
  } catch {
    return false;
  }
}
