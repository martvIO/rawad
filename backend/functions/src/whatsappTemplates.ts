// Meta WhatsApp Business Management API — template CRUD backing the admin
// "Message Templates" page. Slot-oriented: one template per (type × locale).
// Uses the env access token (must carry the `whatsapp_business_management`
// permission) + the WABA id from config. Verified against Graph API v23.0.
//
// The 4 slots, their deterministic Meta names, and URL-button bases:
//   physical_ar/he → dawa_invite_physical_{ar|he}, button base PUBLIC_BASE_URL/invite
//   digital_ar/he  → dawa_invite_digital_{ar|he},  button base PUBLIC_BASE_URL/d
// At send time the {{1}} URL suffix is the token (physical) or groomUsername/token
// (digital) — see whatsappInvite.buildInviteSendComponents.
import { InviteSlot } from "./whatsappConfig";

const GRAPH_VERSION = "v23.0";
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "https://dawa-aa793.web.app").replace(/\/+$/, "");

export type TemplateCategory = "UTILITY" | "MARKETING";

export const INVITE_SLOTS: InviteSlot[] = ["physical_ar", "physical_he", "digital_ar", "digital_he"];

export function slotParts(slot: InviteSlot): { type: "physical" | "digital"; locale: "ar" | "he" } {
  const [type, locale] = slot.split("_") as ["physical" | "digital", "ar" | "he"];
  return { type, locale };
}

/** Deterministic Meta template name for a slot (lowercase + underscores only). */
export function templateNameForSlot(slot: InviteSlot): string {
  return `dawa_invite_${slot}`;
}

/** URL-button base for a slot's type; the {{1}} suffix is appended at send. */
export function buttonBaseForSlot(slot: InviteSlot): string {
  return slotParts(slot).type === "digital" ? `${PUBLIC_BASE_URL}/d` : `${PUBLIC_BASE_URL}/invite`;
}

/** Example suffix Meta requires for the URL-button `example` (one variable). */
function exampleSuffixForSlot(slot: InviteSlot): string {
  return slotParts(slot).type === "digital" ? "sami/abc123token" : "abc123token";
}

export interface TemplateDraft {
  bodyText: string; // must contain {{1}} (guest name)
  buttonLabel: string; // ≤ 25 chars (Meta button text limit)
  category: TemplateCategory;
  exampleName?: string; // example value for {{1}} in the body
}

/**
 * Build the Meta CREATE `components` for an invite template: a BODY with one
 * {{1}} variable + a URL button whose URL ends in {{1}} (the per-guest suffix).
 * Verified v23.0 `example` shapes: body → `body_text: [[name]]`; URL button →
 * a flat array with one full example URL.
 */
export function buildCreateComponents(slot: InviteSlot, draft: TemplateDraft): unknown[] {
  const base = buttonBaseForSlot(slot);
  const exampleName = (draft.exampleName || "").trim() || "Sara";
  return [
    { type: "BODY", text: draft.bodyText, example: { body_text: [[exampleName]] } },
    {
      type: "BUTTONS",
      buttons: [
        {
          type: "URL",
          text: draft.buttonLabel,
          url: `${base}/{{1}}`,
          example: [`${base}/${exampleSuffixForSlot(slot)}`],
        },
      ],
    },
  ];
}

/** Pull the editable bits (body text + button label) back out of a Meta
 *  template's components, so the editor can pre-fill the current content. */
export function parseTemplateContent(components: unknown): { bodyText: string; buttonLabel: string } {
  const arr = Array.isArray(components) ? components : [];
  const body = arr.find((c) => (c as { type?: string })?.type === "BODY") as { text?: string } | undefined;
  const buttons = arr.find((c) => (c as { type?: string })?.type === "BUTTONS") as
    | { buttons?: Array<{ type?: string; text?: string }> }
    | undefined;
  const urlBtn = buttons?.buttons?.find((b) => b?.type === "URL");
  return { bodyText: (body?.text ?? "").toString(), buttonLabel: (urlBtn?.text ?? "").toString() };
}

// ─── Meta Graph API calls ───────────────────────────────────────────────────

export interface MetaResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

function graphError(data: unknown, status: number): string {
  const e = (data as { error?: { error_user_msg?: string; message?: string } } | undefined)?.error;
  return e?.error_user_msg || e?.message || `http_${status}`;
}

async function graph(
  method: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<MetaResult> {
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) return { ok: false, error: graphError(data, res.status) };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "request_failed" };
  }
}

export interface MetaTemplate {
  id?: string;
  name?: string;
  status?: string;
  category?: string;
  language?: string;
  components?: unknown;
}

export async function metaCreateTemplate(args: {
  wabaId: string;
  token: string;
  name: string;
  language: string;
  category: TemplateCategory;
  components: unknown[];
}): Promise<MetaResult<{ id?: string; status?: string; category?: string }>> {
  return graph("POST", `${args.wabaId}/message_templates`, args.token, {
    name: args.name,
    language: args.language,
    category: args.category,
    // Let Meta upgrade UTILITY→MARKETING rather than reject (invites usually
    // classify as MARKETING). The admin sees the assigned category in the response.
    allow_category_change: true,
    components: args.components,
  }) as Promise<MetaResult<{ id?: string; status?: string; category?: string }>>;
}

export async function metaListTemplates(args: {
  wabaId: string;
  token: string;
}): Promise<MetaResult<{ data?: MetaTemplate[] }>> {
  const path = `${args.wabaId}/message_templates?fields=id,name,status,category,language,components&limit=200`;
  return graph("GET", path, args.token) as Promise<MetaResult<{ data?: MetaTemplate[] }>>;
}

export async function metaEditTemplate(args: {
  templateId: string;
  token: string;
  category?: TemplateCategory;
  components: unknown[];
}): Promise<MetaResult> {
  const body: Record<string, unknown> = { components: args.components };
  if (args.category) body.category = args.category;
  return graph("POST", `${args.templateId}`, args.token, body);
}

export async function metaDeleteTemplate(args: {
  wabaId: string;
  token: string;
  name: string;
}): Promise<MetaResult> {
  return graph(
    "DELETE",
    `${args.wabaId}/message_templates?name=${encodeURIComponent(args.name)}`,
    args.token,
  );
}
