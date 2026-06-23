# Plan: Finish the WhatsApp RSVP Reminder Engine (+ platform review appendix)

## Context — why this change

You asked for a review of the site: what feature is missing, what was implemented
poorly, and how the UX feels. A grilling session converged on the single
highest-ROI lever for a **live** product: **chasing non-responders** in the guest
RSVP funnel — the thing grooms actually pay you for. Every guest who is sent an
invite but never replies is invisible lost money.

The grilling then drove four product decisions:

1. Deliver reminders via a **real backend WhatsApp integration** (not the manual
   `wa.me` browser flow), to unlock automation + delivery/read tracking.
2. Provider: **Meta WhatsApp Cloud API, direct** (lowest lifetime cost, fits the
   Firebase Functions backend).
3. Scope: **all outbound via the API, with `wa.me` kept as a manual fallback**.
4. Firing: a **daily cron** sending at T-minus intervals before each wedding
   (default **T-14 / T-7 / T-2**), **stop-on-reply**, **hard cap** (default 3),
   admin-tunable, plus a manual **"remind now"** override.

### The reframe that changes everything

Exploration revealed a **v1 of this entire engine already exists and is deployed**
(documented in the wiki as "Audit Remediation Phase 4"). This is an *upgrade*, not
a greenfield build:

| File | Exists today | Gap to close |
|---|---|---|
| [whatsapp.ts](../backend/functions/src/whatsapp.ts) | Full Cloud API transport: `sendWhatsAppText`, **`sendWhatsAppTemplate`** (unused), webhook challenge verify, timing-safe `X-Hub-Signature-256` verify. Config-gated → no-op until secrets set. | None to the transport. Add a thin "send reminder + record bookkeeping + message-id mapping" wrapper. |
| [whatsappWebhook.ts](../backend/functions/src/whatsappWebhook.ts) | Deployed standalone `onRequest`; GET verify + POST signature check work. | POST body is **logged, not processed** — parse `statuses[]` (sent/delivered/read/failed) + inbound replies. |
| [reminders.ts](../backend/functions/src/reminders.ts) | Deployed daily `onSchedule` (09:00 Asia/Jerusalem). Pure helpers unit-tested. | **Digital-only**, single lead day (`REMINDER_LEAD_DAYS=7`), reminds once, and **uses plain text (latent prod bug)**. Needs cadence+cap, physical track, template send, bookkeeping. |

**Latent bug to fix:** `reminders.ts` calls `sendWhatsAppText` for cold contacts.
Meta rejects free-form text outside the 24h window, so reminders would silently
fail once WhatsApp is live. Must switch to `sendWhatsAppTemplate`.

---

## Recommended approach — phased, each phase independently deployable

Meta's external onboarding (business verification, number, **Utility** template
approval) is the long pole; it runs in **parallel** with code from day 1.

### Phase 0 — Meta onboarding (external, no code)
- Business verification, dedicated WhatsApp Business number, display-name review.
- Submit the RSVP-reminder **Utility** template in **Arabic + Hebrew** (Utility,
  not Marketing — it's tied to an existing invitation, deliverable + cheaper).
- Provision secrets like the existing `WEB_API_KEY` pattern (Secret Manager):
  `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN`,
  `WHATSAPP_APP_SECRET`.
- Point the Meta webhook at `whatsappWebhook`. Optionally add a
  [firebase.json](../firebase.json) rewrite (`/wa-webhook/**` → `whatsappWebhook`)
  for a stable, brandable callback URL (deploy-only, no DB).

### Phase 1 — Process the webhook (code, no DB) — *safe to ship immediately*
- In [whatsappWebhook.ts](../backend/functions/src/whatsappWebhook.ts), replace the
  log-only POST with parsing of `entry[].changes[].value.statuses[]` (message
  lifecycle) and `messages[]` (inbound replies → STOP/opt-out + stop-signal).
- Keep the "always 200 fast, best-effort processing" posture so Meta never retries.
- Extend [whatsappWebhook.test.ts](../backend/tests/functions/whatsappWebhook.test.ts).
- No-op until Meta starts sending events, so this deploys with zero risk.

### Phase 2 — Canonical wedding date for ALL grooms (⚠ DB sign-off)
The cron needs a per-groom wedding date. Digital grooms have `weddingDate` on the
design doc; **physical/handwritten grooms have none anywhere**.
- Add `weddingDateMs: number` to `/users/{groomUid}` in RTDB — the one record
  every groom (both tracks) already has, and which `admin.ts`/`aggregate.ts`
  already read.
- Add validation in [database.rules.json](../database.rules.json) under `users/$uid`
  (the existing `"$other": { ".validate": false }` rule rejects unknown fields,
  so this is required).
- Write path: extend the admin user-update endpoint + a date field in
  [AdminUserManager.jsx](../frontend/src/pages/portal/admin/AdminUserManager.jsx).
- Backfill digital grooms from the design's `weddingDate` using the existing
  `weddingMs()` helper ([aggregate.ts](../backend/functions/src/api/analytics/aggregate.ts))
  — it tolerates both epoch-ms and ISO-string dates (`reminders.ts` currently
  assumes a number and would skip string-dated grooms).

### Phase 3 — Upgrade the cron (⚠ DB sign-off)
Modify [reminders.ts](../backend/functions/src/reminders.ts):
- **Multi-interval cadence** (default `[14, 7, 2]`) + **hard cap** (default `3`),
  both read from `/adminSettings`.
- **Switch `sendWhatsAppText` → `sendWhatsAppTemplate`** (fixes the latent bug);
  `reminderText()` localization becomes template *parameters*. Keep guest `locale`
  (already stamped by `/invites/digital/opened`) to pick AR vs HE.
- **Add the physical track:** enumerate `/guestsByGroom/{uid}/{guestId}` where
  `inviteLinkSentAt` is set AND `confirmedAt` is unset (mirror the dual-store read
  pattern in `admin.ts` analytics). Digital stays: guests where `status==="pending"`.
- **Per-guest bookkeeping** replaces the single `reminderSentAt`:
  `reminderCount`, `lastReminderAt`, `lastReminderMessageId`, `lastReminderStatus`,
  `whatsappOptOut` — extend the [guests.ts](../backend/functions/src/api/routes/guests.ts)
  `KNOWN_FIELDS` whitelist + guest schema in `database.rules.json` (both tracks).
- **Token healing:** on reminder, reuse the guest's current `inviteLinkToken`;
  re-mint via the existing `mintToken()` **only if expired/missing** (avoids
  orphaned token growth + stale design snapshots).
- **Message-id correlation store:** new RTDB node
  `/whatsappMessages/{messageId} = { groomUid, guestId, track, sentAt, status }`
  (admin-only rules, closed to clients, like `/inviteTokens`) so the Phase-1
  webhook can map a status callback back to a guest.
- **Timezone-correct day math:** compute T-minus in `Asia/Jerusalem` calendar
  days, not floored epoch division, so T-2 can't fire on T-1/T-3 near midnight.
- Extend [reminders.test.ts](../backend/tests/functions/reminders.test.ts).

### Phase 4 — Admin/groom UI + funnel (no DB beyond `/adminSettings` keys)
- **Cadence/cap/on-off** card in
  [AdminSettingsTab.jsx](../frontend/src/pages/portal/admin/AdminSettingsTab.jsx),
  persisted through the existing `usePortalAdminSettings` setters; extend
  `ALLOWED_KEYS` + validation in [settings.ts](../backend/functions/src/api/routes/settings.ts)
  + the `adminSettings` schema in rules.
- **"Remind now via WhatsApp"** action in
  [AdminSendTab.jsx](../frontend/src/pages/portal/admin/AdminSendTab.jsx) (it already
  computes `unconfirmedGuests`); new admin endpoint `POST /admin/reminders/send`
  in [admin.ts](../backend/functions/src/api/routes/admin.ts) (`requireAdmin` +
  `uidRateLimit`). Keep the per-guest `wa.me` button as the manual fallback.
- **Funnel** (`sent → delivered(msg) → read → opened(viewedAt) → replied(confirmedAt)`)
  in [AdminAnalytics.jsx](../frontend/src/pages/portal/admin/AdminAnalytics.jsx) +
  `aggregate.ts`, and a per-groom slice on
  [GroomDashboard.jsx](../frontend/src/pages/portal/groom/GroomDashboard.jsx).
- i18n strings in [ar.js](../frontend/src/i18n/ar.js) + [he.js](../frontend/src/i18n/he.js).

### Domain model + docs (do during impl)
- **Resolve the "delivered" terminology collision** in `CONTEXT.md`: keep
  **Delivered** = a driver physically handed over a printed card; name the
  WhatsApp lifecycle **Message status (sent/delivered/read)**, kept entirely
  separate from the guest `status` field.
- Add glossary terms: **Non-responder** (invite sent, no `confirmedAt`; a declined
  RSVP counts as *responded*), **Reminder**, and **Reply/Responded** vs the
  attendees-only **Confirmation** record.
- Reconcile the existing `CONTEXT.md` claim of **"15 Palettes / 12 font pairings"**
  with the code's actual **5 palettes / 3 fonts** ([digitalThemes.js](../frontend/src/styles/digitalThemes.js))
  — the glossary describes the aspirational WebGL future, not today.
- Consider one **ADR**: "RSVP reminders via Meta Cloud API templates; `wa.me`
  retained as manual fallback" (hard-to-reverse + a real trade-off → meets the bar).

---

## ⚠ Database changes requiring explicit sign-off (per CLAUDE.md)
1. `/users/{groomUid}.weddingDateMs` + rules validation.
2. `/adminSettings`: `reminderIntervals`, `reminderCap`, `remindersEnabled` +
   allowlist/validation + rules.
3. Guest reminder fields (`reminderCount`, `lastReminderAt`, `lastReminderMessageId`,
   `lastReminderStatus`, `whatsappOptOut`) on **both** tracks (RTDB rules +
   `KNOWN_FIELDS`; Firestore `firestore.rules`).
4. New RTDB `/whatsappMessages/{messageId}` node + admin-only rules.

---

## Verification (end-to-end)
- **Unit:** `npm run test:unit` — extend the pure helpers in `reminders.test.ts`
  (`dueForReminder` over intervals + cap; physical enumeration) and
  `whatsappWebhook.test.ts` (status parsing, inbound STOP).
- **Emulator:** `isWhatsAppConfigured()` is false locally → sends are no-ops and
  the cron skips, so safe. Test the webhook by POSTing synthetic Meta
  `statuses[]` payloads at the local `whatsappWebhook` URL and asserting
  `/whatsappMessages` writes.
- **Playwright MCP** (`http://localhost:8931/mcp`): admin Settings reminders card
  saves; Send tab "remind now" lists only non-responders; funnel renders in
  analytics + groom dashboard.
- **Prod smoke** (after secrets + template approved): send a reminder to your own
  number, confirm the webhook records `delivered`/`read`, and confirm the funnel
  count moves. Then `firebase functions:log` for errors.

---

## Appendix — broader review (the rest of what you asked for)
Ranked additional opportunities, **not in the committed scope above** — greenlight
any and I'll fold them in. (The earlier "no WhatsApp backend / no open-tracking"
finding was wrong — corrected above.)

1. **Driver "undo" after "delivered"** — no undo today; a mis-tap mis-credits a
   delivery and needs an admin fix. Small, high integrity value.
2. **Resend / multi-channel reach** — Phase-3 token-healing already fixes
   "lost link 404s"; an SMS/email fallback for guests not on WhatsApp is the
   remaining reach gap.
3. **Design-approval notification to grooms** — they currently learn approval only
   by hitting an error when sending; can ride the new WhatsApp rail.
4. **CSV guest import** — grooms enter guests one-by-one; painful for large lists.
5. **Landing-page i18n** — hardcoded English ("LUXURY PRINT", "SIGNATURE PRINT")
   and an empty testimonials array on [LandingPage.jsx](../frontend/src/pages/LandingPage.jsx).
6. **Guest-form polish** — real-time field validation (only fires on submit today),
   a "copied!" toast on share, and a mobile calendar intent.
7. **Stale-GPS "offline" badge** on the groom's live driver map.
8. **Specific error messages** — some failures (e.g. proof photo too large) fall
   back to a generic "something went wrong".
