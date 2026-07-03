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

## Manual-send fallback (grilled + built 2026-07-03)

When an admin Send-tab WhatsApp send "doesn't work", the admin now gets a fallback
UI: the exact message text with a **copy** button and an **open WhatsApp** (`wa.me`)
button to send it manually. Decisions (grilled):

- **Scope — all failures.** (a) Server Cloud-API failures (`send.ok === false`) on
  all three paths — manual invite (`POST /invites`), digital invite
  (`POST /invites/digital`), message-only/noDesign (`POST /invites/notify`); and
  (b) popup-blocked `wa.me` opens in the `not_configured` branch
  (`window.open` → null, previously silent).
- **Bulk = one summary modal.** Send-to-all never interrupts mid-loop; failures are
  collected and shown once after the loop (per-guest Copy + Open rows, local
  gray-out check-off). Single sends get a one-guest modal. Aggregate toast kept.
- **Persistent access via the ⚠ failed pill.** The pill is clickable and reopens
  the fallback anytime — frontend-only, because admin guest lists already carry
  `inviteLinkToken`/`inviteLinkSentAt` (90-day TTL); expired/missing tokens re-mint
  via the existing create endpoints **without** `deliver` (mint, no send).
- **Copy = one button**, copying the full text `[body, link].join("\n\n")` —
  byte-identical to the server join in `whatsappInvite.ts`.
- **Persisted "sent manually" status** (DB change signed off by owner): clicking
  open-WhatsApp stamps `inviteWaStatus: "manual"` + `inviteWaStatusAt` via a new
  admin-only `POST /invites/manual-sent` (stamp helper `recordManualSent` in
  `whatsappInvite.ts`; `'manual'` added to the `database.rules.json` validate).
  Deliberately NOT client-PATCHable via the guest whitelist. **Receipt-proof two
  ways** (hardened in the adversarial review): no `waMessages` index entry AND
  `isStatusProgression(cur='manual', …) === false`, so a late/duplicate Meta
  receipt for the pre-fallback wamid can never clobber the admin's stamp; only a
  real later resend (`recordSent`, direct write) overwrites. `recordManualSent`
  propagates write errors (the stamp IS the endpoint's job → 500, no false audit);
  ids are path-segment validated (`invalid_id`) before RTDB/Firestore interpolation.
- **`not_configured` keeps its zero-friction auto-open** when the tab opens;
  blocked → fallback modal / summary row. (The server deliberately does NOT stamp
  `failed` on `not_configured` — the wa.me path is the delivery.)
- **Pill semantics fixed in review:** digital/physical is keyed strictly off the
  row's SECTION (an RTDB guest only ever carries a physical token, a Firestore
  digital guest only a digital one) — never off `adminMode`, which would wrap a
  physical token in a dead `/d/` URL after a mode switch.

UI: `frontend/src/pages/portal/admin/WaSendFallbackModal.jsx` (admin-only, so it
lives beside the Send tab, not in `components/`); failure payloads surface from
`handleWaSend` in `usePortalSendInvites.js`. Verified end-to-end via Playwright
MCP on the emulator (popup-block sim, real Graph-API failure with fake creds,
manual pill via poll, bulk summary check-off, token-reuse on pill reopen, AR+HE
RTL). Known accepted risk: `inviteWaStatus` (incl. `manual`) remains spoofable by
a groom via direct client-SDK RTDB writes — pre-existing for all statuses,
display-integrity only. Deferred: none of the fallback covers the scheduled
reminders (server-only, no UI at failure time). See [[Digital Invitations]],
[[Architecture Decisions]], [[Communication Settings]].
