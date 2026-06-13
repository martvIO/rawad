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
import { verifyWebhookChallenge } from "./whatsapp";

export const whatsappWebhook = onRequest(
  { region: "us-central1", cors: false },
  (req, res) => {
    if (req.method === "GET") {
      const challenge = verifyWebhookChallenge(req.query as Record<string, unknown>);
      if (challenge !== null) {
        res.status(200).send(challenge);
        return;
      }
      res.status(403).send("forbidden");
      return;
    }
    if (req.method === "POST") {
      try {
        const summary = JSON.stringify(req.body ?? {}).slice(0, 2000);
        console.log("[whatsapp] webhook event:", summary);
      } catch {
        /* ignore log serialization errors */
      }
      // Always 200 quickly so Meta doesn't retry; processing is best-effort.
      res.status(200).send("ok");
      return;
    }
    res.status(405).send("method_not_allowed");
  },
);
