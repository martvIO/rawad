// WhatsApp invite delivery — composes the low-level send helpers (whatsapp.ts)
// into the "send a guest their invite link" operation used by the admin Send
// tab, plus the webhook status-tracking pieces.
//
// Two delivery modes, chosen by the resolved config (whatsappConfig.ts), which
// merges admin-set DB values over env — no UI toggle in the send path itself:
//
//   • TEMPLATE (production): when the matching slot has an approved template
//     name (config.templates[slot]), send that template — the only thing Meta
//     allows for a business-initiated message (the guest never messaged us
//     first). Body variable {{1}} = guest name; a URL button's dynamic suffix
//     carries the per-guest path so the link is a tappable button.
//   • TEXT (fallback / testing): otherwise send free-form text (message body or
//     the admin's fallback text + link). Only delivers inside the 24h
//     customer-service window — for the test number / guests who already replied.
//
// Everything here is config-gated and never throws, exactly like whatsapp.ts.
// Template names + phone id + the auto-send toggle come from whatsappConfig
// (admin "WhatsApp Setup" page → adminSettings, env fallback). PUBLIC_BASE_URL
// (link origin, shared w/ photoShare) is still env.
import { createHash } from "crypto";
import { getDatabase } from "firebase-admin/database";
import { getFirestore } from "firebase-admin/firestore";
import { normalisePhone } from "./helpers";
import {
  sendWhatsAppText,
  sendWhatsAppTemplate,
  WhatsAppSendResult,
} from "./whatsapp";
import {
  getWhatsAppConfig,
  isConfigured,
  WhatsAppConfig,
  InviteSlot,
} from "./whatsappConfig";

export type InviteType = "physical" | "digital";
export type InviteLocale = "ar" | "he";

const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "https://dawa-aa793.web.app").replace(/\/+$/, "");

/** Normalise an arbitrary locale value to the two we support (default Arabic). */
export function inviteLocale(raw: unknown): InviteLocale {
  return raw === "he" ? "he" : "ar";
}

/** The public invite link for a token. Physical → /invite/:token; digital →
 *  /d/:groomUsername/:token. Mirrors the URLs the frontend used to build. */
export function inviteLink(type: InviteType, groomUsername: string, token: string): string {
  return type === "digital"
    ? `${PUBLIC_BASE_URL}/d/${groomUsername}/${token}`
    : `${PUBLIC_BASE_URL}/invite/${token}`;
}

/** The dynamic URL-button suffix appended to the template button's base URL.
 *  MUST match the base configured in the approved template:
 *    digital  → button base https://…/d/      + suffix `${groomUsername}/${token}`
 *    physical → button base https://…/invite/  + suffix `${token}` */
function urlSuffix(type: InviteType, groomUsername: string, token: string): string {
  return type === "digital" ? `${groomUsername}/${token}` : token;
}

/** The (type, locale) → config slot key (e.g. "digital_ar"). */
export function inviteSlot(type: InviteType, locale: InviteLocale): InviteSlot {
  return `${type}_${locale}` as InviteSlot;
}

/** Meta SEND components for an invite template: body name var {{1}} + the URL
 *  button's dynamic suffix. (Distinct from the CREATE components in
 *  whatsappTemplates.ts, which carry `example`s instead of `parameters`.) */
export function buildInviteSendComponents(input: {
  guestName: string | undefined;
  type: InviteType;
  groomUsername: string;
  token: string;
}): unknown[] {
  return [
    { type: "body", parameters: [{ type: "text", text: (input.guestName || "").trim() || "—" }] },
    {
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: urlSuffix(input.type, input.groomUsername, input.token) }],
    },
  ];
}

export interface DeliverInviteInput {
  type: InviteType;
  locale: InviteLocale;
  phone: string | undefined;
  guestName: string | undefined;
  groomUsername: string;
  token: string;
  /** Personalized free-form body for the TEXT path (link appended). Optional. */
  messageBody?: string;
}

/**
 * Deliver a guest their invite over WhatsApp. Returns the send result; never
 * throws. Config comes from the admin DB (merged over env) — pass `cfg` to skip
 * the resolve (used by tests + callers that already hold the config). Returns
 * { ok:false, error:"not_configured" } when WhatsApp is unconfigured OR the
 * admin turned auto-send off — the frontend treats that as "fall back to a
 * wa.me tab", so nothing breaks before Meta is wired up or when disabled.
 */
export async function deliverInvite(
  input: DeliverInviteInput,
  cfg?: WhatsAppConfig,
): Promise<WhatsAppSendResult> {
  const config = cfg ?? (await getWhatsAppConfig());
  if (!isConfigured(config) || !config.autoSendEnabled) return { ok: false, error: "not_configured" };
  const e164 = normalisePhone(String(input.phone || ""));
  if (!e164) return { ok: false, error: "invalid_phone" };

  const creds = { token: config.token, phoneId: config.phoneId };
  const tmpl = config.templates[inviteSlot(input.type, input.locale)];
  if (tmpl) {
    // Template path (production): body name var + URL-button dynamic suffix.
    const components = buildInviteSendComponents(input);
    return sendWhatsAppTemplate(e164, tmpl, input.locale, components, creds);
  }

  // Free-form fallback (24h window only): message body (or the admin's default
  // fallback text) + link, joined like the old client-side buildWaLink.
  const link = inviteLink(input.type, input.groomUsername, input.token);
  const body = (input.messageBody || "").trim() || config.fallbackText[input.locale];
  const text = [body, link].filter(Boolean).join("\n\n");
  return sendWhatsAppText(e164, text, creds);
}

/**
 * Free-form text to a guest with NO link — the "بدون تصميم / ללא עיצוב" option
 * (send the message only). Always text (there is no link to template), so it
 * delivers only inside the 24h window. Config-gated, never throws.
 */
export async function notifyGuestText(
  phone: string | undefined,
  message: string,
  cfg?: WhatsAppConfig,
): Promise<WhatsAppSendResult> {
  const config = cfg ?? (await getWhatsAppConfig());
  if (!isConfigured(config) || !config.autoSendEnabled) return { ok: false, error: "not_configured" };
  const e164 = normalisePhone(String(phone || ""));
  if (!e164) return { ok: false, error: "invalid_phone" };
  const text = (message || "").trim();
  if (!text) return { ok: false, error: "empty_message" };
  return sendWhatsAppText(e164, text, { token: config.token, phoneId: config.phoneId });
}

// ─── Per-send tracking index ────────────────────────────────────────────────
//
// On a successful send we stamp the guest record (inviteWaStatus/MessageId) AND
// write a reverse index waMessages/{sha256(wamid)} → {groomUid,guestId,type} so
// the webhook can map a delivery/read receipt back to the guest (the wamid is
// hashed because it contains RTDB-illegal chars). Server-only path (Admin SDK
// bypasses rules; root default-deny keeps clients out).

export interface SentRef {
  groomUid: string;
  guestId: string;
  type: InviteType;
}

/**
 * RTDB-safe key for a Meta message id. A wamid ("wamid.HBgL…==") contains '.',
 * '/' and '=' — all illegal in RTDB keys — so we index it under its sha256 hex
 * digest. Both the send (recordSent) and the receipt lookup (applyStatusUpdates)
 * hash the id the same way, so the round-trip matches.
 */
function waMsgKey(messageId: string): string {
  return createHash("sha256").update(messageId).digest("hex");
}

/** Record a successful send: index the message id and stamp the guest "sent".
 *  `stampGuest` patches the guest record (RTDB for physical, Firestore for
 *  digital) — the caller owns which store. Best-effort; failures are swallowed
 *  so a tracking hiccup never fails the send the admin already saw succeed. */
export async function recordSent(
  ref: SentRef,
  messageId: string,
  stampGuest: (patch: Record<string, unknown>) => Promise<unknown>,
): Promise<void> {
  const now = Date.now();
  await Promise.all([
    stampGuest({ inviteWaStatus: "sent", inviteWaMessageId: messageId, inviteWaSentAt: now }).catch(
      () => undefined,
    ),
    getDatabase()
      .ref(`waMessages/${waMsgKey(messageId)}`)
      .set({ groomUid: ref.groomUid, guestId: ref.guestId, type: ref.type, sentAt: now })
      .catch(() => undefined),
  ]);
}

/** Stamp a failed send so the admin UI can show it (no index — there's no id).
 *  The error is clamped to 240 chars to honour the guestsByGroom.inviteWaError
 *  rule bound — raw Meta Graph error strings can exceed it. */
export async function recordFailed(
  stampGuest: (patch: Record<string, unknown>) => Promise<unknown>,
  error: string | undefined,
): Promise<void> {
  await stampGuest({
    inviteWaStatus: "failed",
    inviteWaError: (error || "send_failed").slice(0, 240),
  }).catch(() => undefined);
}

/** Stamp a MANUAL send — the admin delivered the invite themselves via a wa.me
 *  tab after a failed/unconfigured auto-send (Send-tab fallback modal). No
 *  waMessages index entry (there's no wamid), and isStatusProgression treats
 *  "manual" as receipt-proof — only a real later resend overwrites it.
 *  Unlike recordSent/recordFailed (best-effort side stamps during a send),
 *  this stamp IS the endpoint's whole job, so write errors propagate to the
 *  caller (POST /invites/manual-sent → 500) instead of being swallowed. */
export async function recordManualSent(
  stampGuest: (patch: Record<string, unknown>) => Promise<unknown>,
): Promise<void> {
  await stampGuest({
    inviteWaStatus: "manual",
    inviteWaStatusAt: Date.now(),
  });
}

// ─── Webhook status extraction ──────────────────────────────────────────────

export interface StatusUpdate {
  messageId: string;
  /** sent | delivered | read | failed */
  status: string;
}

/**
 * Extract delivery/read/failed status updates from a Meta webhook POST body.
 * Pure + defensive — any unexpected shape yields []. Exported for unit tests.
 *
 * Shape: body.entry[].changes[].value.statuses[] = { id, status, timestamp, … }
 */
export function extractStatusUpdates(body: unknown): StatusUpdate[] {
  const out: StatusUpdate[] = [];
  const entries = (body as { entry?: unknown })?.entry;
  if (!Array.isArray(entries)) return out;
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const statuses = (change as { value?: { statuses?: unknown } })?.value?.statuses;
      if (!Array.isArray(statuses)) continue;
      for (const s of statuses) {
        const messageId = ((s as { id?: unknown })?.id ?? "").toString();
        const status = ((s as { status?: unknown })?.status ?? "").toString();
        if (messageId && status) out.push({ messageId, status });
      }
    }
  }
  return out;
}

const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };

/**
 * Whether `next` should overwrite the currently-stored `cur` status. Receipts
 * can arrive out of order (a late "delivered" after "read"); we only ever move
 * forward. "failed" is always recordable unless the message was already read.
 * "manual" is admin-asserted, not receipt-derived: a duplicate/late receipt for
 * the pre-fallback wamid must never clobber it (only a real resend via
 * recordSent overwrites, which stamps directly).
 */
export function isStatusProgression(cur: string | undefined, next: string): boolean {
  if (cur === "manual") return false;
  if (next === "failed") return cur !== "read";
  const c = STATUS_RANK[cur ?? ""] ?? 0;
  const n = STATUS_RANK[next] ?? 0;
  return n > c;
}

/**
 * Apply a batch of webhook status updates to the matching guest records.
 * Looks each message id up in waMessages/{id}; advances inviteWaStatus
 * monotonically on the guest (RTDB for physical, Firestore for digital).
 * Best-effort and never throws — the webhook must always 200 quickly.
 */
export async function applyStatusUpdates(updates: StatusUpdate[]): Promise<void> {
  if (!updates.length) return;
  const db = getDatabase();
  const fs = getFirestore();
  for (const u of updates) {
    try {
      const refSnap = await db.ref(`waMessages/${waMsgKey(u.messageId)}`).get();
      if (!refSnap.exists()) continue;
      const ref = refSnap.val() as Partial<SentRef>;
      if (!ref.groomUid || !ref.guestId) continue;

      if (ref.type === "digital") {
        const docRef = fs.doc(`digitalInvitations/${ref.groomUid}/guests/${ref.guestId}`);
        const snap = await docRef.get();
        if (!snap.exists) continue;
        const cur = (snap.data() as { inviteWaStatus?: string } | undefined)?.inviteWaStatus;
        if (isStatusProgression(cur, u.status)) {
          await docRef.update({ inviteWaStatus: u.status, inviteWaStatusAt: Date.now() });
        }
      } else {
        const guestRef = db.ref(`guestsByGroom/${ref.groomUid}/${ref.guestId}`);
        const cur = (await guestRef.child("inviteWaStatus").get()).val() as string | undefined;
        if (isStatusProgression(cur ?? undefined, u.status)) {
          await guestRef.update({ inviteWaStatus: u.status, inviteWaStatusAt: Date.now() });
        }
      }
    } catch (err) {
      console.warn(`[whatsapp] status update failed for ${u.messageId}:`, err);
    }
  }
}
