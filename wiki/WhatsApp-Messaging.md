---
date: 2026-06-14
tags: [whatsapp, messaging, scheduler, notifications]
---

# WhatsApp Messaging

Server-side WhatsApp Cloud API outbound + a scheduled RSVP-reminder job, added in
[[Audit Remediation 2026]] Phase 4 (audit item 11). This is the backbone that
replaces the admin manually opening `wa.me` tabs and that makes the (Phase 1
softened) reminder promise deliverable once configured.

Related: [[Dawa]] · [[Communication Settings]] · [[Digital Invitations]] ·
[[Polling and Realtime]] · [[REST API Architecture]] · [[Audit Remediation 2026]]

## Components
- `backend/functions/src/whatsapp.ts` — `sendWhatsAppText()` via the Meta Graph REST
  API (no SDK), `isWhatsAppConfigured()`, and a pure `verifyWebhookChallenge()`.
  Env-gated: a no-op until configured.
- `backend/functions/src/whatsappWebhook.ts` — standalone `onRequest` (kept OUT of
  the Express app): GET subscription-verify (echoes `hub.challenge` only on token
  match, else 403), POST delivery/read receipts (logged best-effort).
- `backend/functions/src/reminders.ts` — daily `onSchedule` (09:00 Asia/Jerusalem)
  `sendRsvpReminders`: for each digital invitation whose default design's
  `weddingDate` is `REMINDER_LEAD_DAYS` (7) away, nudges still-`pending` guests via
  WhatsApp, stamping `reminderSentAt` once (pure selection logic unit-tested).
- tests: `backend/tests/functions/whatsappWebhook.test.ts`, `reminders.test.ts`.

## Config
`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN` in the function env;
point the Meta webhook at the deployed `whatsappWebhook` function URL. Until set,
sends are no-ops and the scheduler skips — safe to deploy now (it is deployed).
