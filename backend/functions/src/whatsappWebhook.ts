// Standalone HTTP function for the Meta WhatsApp webhook.
//
// Kept OUT of the Express `api` app so it has its own URL and never shares
// middleware with the REST API. Point the Meta webhook at this function's URL
// (printed on deploy) or add a hosting rewrite for it.
//
//   GET   — Meta subscription verification (echoes hub.challenge when the
//           verify token matches WHATSAPP_VERIFY_TOKEN, else 403).
//   POST  — delivery/read receipts + inbound messages. Logged best-effort for
//           now; per-send outcome tracking lands with the reminder scheduler.
import { onRequest } from "firebase-functions/v2/https";
import { verifyWebhookChallenge, isWebhookSignatureEnforced, verifyWebhookSignature } from "./whatsapp";
import { extractStatusUpdates, applyStatusUpdates } from "./whatsappInvite";
import { getWhatsAppConfig } from "./whatsappConfig";

export const whatsappWebhook = onRequest(
  { region: "us-central1", cors: false },
  async (req, res) => {
    if (req.method === "GET") {
      // Verify token comes from admin config (DB) with env fallback.
      const cfg = await getWhatsAppConfig();
      const challenge = verifyWebhookChallenge(req.query as Record<string, unknown>, cfg.verifyToken);
      if (challenge !== null) {
        res.status(200).send(challenge);
        return;
      }
      res.status(403).send("forbidden");
      return;
    }
    if (req.method === "POST") {
      // Verify Meta's payload signature when the app secret is configured. Until
      // WHATSAPP_APP_SECRET is set we proceed (back-compat) but log the gap, so a
      // forged POST can't silently drive state once inbound handling does more
      // than log. Meta signs the RAW body — onRequest exposes it as req.rawBody.
      if (isWebhookSignatureEnforced()) {
        if (!verifyWebhookSignature(req.rawBody, req.get("x-hub-signature-256") || undefined)) {
          console.warn("[whatsapp] webhook POST signature invalid — rejecting");
          res.status(401).send("invalid signature");
          return;
        }
      } else {
        console.warn("[whatsapp] WHATSAPP_APP_SECRET unset — webhook POST signature NOT verified");
      }
      try {
        const summary = JSON.stringify(req.body ?? {}).slice(0, 2000);
        console.log("[whatsapp] webhook event:", summary);
      } catch {
        /* ignore log serialization errors */
      }
      // Map delivery/read/failed receipts onto the matching guest records
      // (inviteWaStatus). Best-effort — a tracking hiccup must never make Meta
      // retry, so we swallow errors and still 200.
      try {
        await applyStatusUpdates(extractStatusUpdates(req.body));
      } catch (err) {
        console.warn("[whatsapp] applyStatusUpdates failed:", err);
      }
      // Always 200 so Meta doesn't retry; processing above is best-effort.
      res.status(200).send("ok");
      return;
    }
    res.status(405).send("method_not_allowed");
  },
);
