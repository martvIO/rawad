// Bulk "your photos are ready" WhatsApp delivery.
//
//   POST /digital/:uid/photos/send-links   admin / owning groom
//
// For every digital guest with a phone AND an existing invite token, sends a
// WhatsApp TEMPLATE message linking to /d/:groomUsername/:token/photos (the
// same token they were invited with — so the link is consistent and we don't
// mint anything new). The face page lets them enrol a selfie and download.
//
// No-ops cleanly until the WhatsApp Business API + an approved template are
// configured (WHATSAPP_TOKEN / WHATSAPP_PHONE_ID / WHATSAPP_YOURPHOTOS_TEMPLATE),
// exactly like the reminder scheduler. Guests already sent are skipped unless
// `force: true`.

import { Router, Response } from "express";
import { getDatabase } from "firebase-admin/database";
import { AuthRequest, requireAuth } from "../../middleware/auth";
import { uidRateLimit } from "../../middleware/rateLimit";
import { HOUR_MS } from "../../../constants/time";
import { guestsCol, parentDoc } from "./firestore";
import { canActOnUid } from "./access";
import { safeDetail } from "./project";
import { sendWhatsAppTemplate } from "../../../whatsapp";
import { getWhatsAppConfig, isConfigured } from "../../../whatsappConfig";

const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "https://dawa-aa793.web.app").replace(/\/+$/, "");
const TEMPLATE_LANG = process.env.WHATSAPP_YOURPHOTOS_TEMPLATE_LANG || "ar";

export type SendPhotoLinksResult = {
  ok: boolean;
  sent: number;
  considered: number;
  skipped: Record<string, number | boolean>;
};

/**
 * Send each digital guest (with a phone + valid invite token) a WhatsApp
 * "your photos are ready" template linking to their /photos face page. Pure
 * data function — callable from the HTTP route AND from the publish-flip hook
 * (auto-send). No-ops cleanly when WhatsApp/template are unconfigured, and when
 * the photographer hasn't published. Guests already sent are skipped unless
 * `force`.
 */
export async function sendPhotoLinksForGroom(
  uid: string,
  opts: { force?: boolean } = {},
): Promise<SendPhotoLinksResult> {
  // No-op until WhatsApp + the template are configured. Phone id / token come
  // from the resolved config (admin DB over env); the template name stays env.
  const cfg = await getWhatsAppConfig();
  const yourPhotosTemplate = (process.env.WHATSAPP_YOURPHOTOS_TEMPLATE || "").trim();
  if (!isConfigured(cfg) || !yourPhotosTemplate) {
    return { ok: true, sent: 0, considered: 0, skipped: { not_configured: true } };
  }
  const creds = { token: cfg.token, phoneId: cfg.phoneId };

  // Photographer photos must be published for the page to show anything.
  const parent = await parentDoc(uid).get();
  if (!parent.exists || parent.data()?.photographerPublished !== true) {
    return { ok: false, sent: 0, considered: 0, skipped: { not_published: true } };
  }

  const force = opts.force === true;

  const db = getDatabase();
  const snap = await guestsCol(uid).get();
  const skipped: Record<string, number> = { no_phone: 0, no_token: 0, expired_token: 0, already_sent: 0, send_failed: 0 };
  let sent = 0;
  let considered = 0;

  for (const doc of snap.docs) {
    const g = doc.data() as {
      phone?: string;
      inviteLinkToken?: string;
      photosLinkSentAt?: number;
    };
    considered++;
    if (!g.phone) { skipped.no_phone++; continue; }
    if (!g.inviteLinkToken) { skipped.no_token++; continue; }
    if (g.photosLinkSentAt && !force) { skipped.already_sent++; continue; }

    // Reuse the guest's existing token; verify it's still valid.
    const tkSnap = await db.ref(`inviteTokens/${g.inviteLinkToken}`).get();
    const tk = tkSnap.exists() ? (tkSnap.val() as { groomUsername?: string; expiresAt?: number }) : null;
    if (!tk || !tk.groomUsername) { skipped.no_token++; continue; }
    if (tk.expiresAt && Date.now() > tk.expiresAt) { skipped.expired_token++; continue; }

    const link = `${PUBLIC_BASE_URL}/d/${tk.groomUsername}/${g.inviteLinkToken}/photos`;
    const components = [{ type: "body", parameters: [{ type: "text", text: link }] }];
    const result = await sendWhatsAppTemplate(g.phone, yourPhotosTemplate, TEMPLATE_LANG, components, creds);
    if (result.ok) {
      sent++;
      await doc.ref.update({ photosLinkSentAt: Date.now() }).catch(() => undefined);
    } else {
      skipped.send_failed++;
    }
  }

  return { ok: true, sent, considered, skipped };
}

export function registerPhotoShareRoutes(router: Router): void {
  router.post(
    "/:uid/photos/send-links",
    requireAuth,
    uidRateLimit("sendPhotoLinks", 20, HOUR_MS),
    async (req: AuthRequest, res: Response) => {
      const uid = req.params.uid;
      if (!canActOnUid(req, uid)) {
        res.status(403).json({ error: "forbidden" });
        return;
      }

      try {
        const result = await sendPhotoLinksForGroom(uid, { force: req.body?.force === true });
        if (!result.ok && result.skipped?.not_published) {
          res.status(409).json({ error: "not_published" });
          return;
        }
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: "send_failed", detail: safeDetail(err) });
      }
    },
  );
}
