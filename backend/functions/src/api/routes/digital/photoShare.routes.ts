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
import { sendWhatsAppTemplate, isYourPhotosTemplateConfigured } from "../../../whatsapp";

const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "https://dawa-aa793.web.app").replace(/\/+$/, "");
const TEMPLATE_LANG = process.env.WHATSAPP_YOURPHOTOS_TEMPLATE_LANG || "ar";

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

      // No-op until WhatsApp + the template are configured.
      if (!isYourPhotosTemplateConfigured()) {
        res.json({ ok: true, sent: 0, considered: 0, skipped: { not_configured: true } });
        return;
      }

      const force = req.body?.force === true;
      const templateName = process.env.WHATSAPP_YOURPHOTOS_TEMPLATE as string;

      try {
        // Photographer photos must be published for the page to show anything.
        const parent = await parentDoc(uid).get();
        if (!parent.exists || parent.data()?.photographerPublished !== true) {
          res.status(409).json({ error: "not_published" });
          return;
        }

        const db = getDatabase();
        const snap = await guestsCol(uid).get();
        const skipped = { no_phone: 0, no_token: 0, expired_token: 0, already_sent: 0, send_failed: 0 };
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
          const result = await sendWhatsAppTemplate(g.phone, templateName, TEMPLATE_LANG, components);
          if (result.ok) {
            sent++;
            await doc.ref.update({ photosLinkSentAt: Date.now() }).catch(() => undefined);
          } else {
            skipped.send_failed++;
          }
        }

        res.json({ ok: true, sent, considered, skipped });
      } catch (err) {
        res.status(500).json({ error: "send_failed", detail: safeDetail(err) });
      }
    },
  );
}
