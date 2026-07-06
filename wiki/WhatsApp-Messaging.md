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

## Production number migration (grilled 2026-07-04)

Migrating off Meta's test number onto a real dedicated number. Decisions (grilled):

- **Owner's WhatsApp Business app number stays untouched** — registering it on the
  Cloud API would kill the app account. Instead: **buy a new Israeli prepaid
  SIM/eSIM** (~₪10–25/mo; 019 / Rami Levy / Golan / HOT…) and keep the line alive
  forever (recycled numbers can lose the WhatsApp identity).
- **Same WABA** as the test number — templates + webhook subscription carry over;
  effectively only `waPhoneId` (adminSettings) changes. **Zero code changes** —
  the whole switch is Meta-side setup + runtime config.
- **Display name:** `Dawa | دعوة` (fallback `Dawa دعوة` if the `|` is rejected).
- **Billing:** card added to the WABA during setup — real-number template sends
  are paid (~₪0.12/marketing msg); without a card every send fails (131042).
- **No registered business → stay unverified:** 250 business-initiated
  conversations/rolling-24h; `waDailyCap: 250` default already matches.
- **Permanent System-User token** replaces the temp-24h token in
  `backend/functions/.env` (`WHATSAPP_TOKEN`) + functions redeploy.
- **Hybrid Playwright session:** Claude drives Meta dashboards; owner types
  password/2FA, card, token (durable secrets never enter chat); owner relays SMS
  OTP + 6-digit two-step PIN (must be saved!) for Claude to type.
- **Two phases:** A (before SIM): state discovery, system-user token, billing,
  template check via the admin WhatsApp tab, webhook check. B (after SIM): add
  number + verify + PIN, repoint `waPhoneId`, end-to-end verify (test-send →
  receipt pills → real Send-tab invite → functions logs).

Plan file: `~/.claude/plans/i-have-a-phone-concurrent-treehouse.md`. See
[[Architecture Decisions]].

### Execution state (2026-07-04 session)

- **Meta layout (3 WABAs on portfolio dawa.invitation / 1712519413221653):**
  - Test WABA `942343588815705` — test number +1 555-149-3969 (phone-id
    `1094938557046441`), the 4 approved invite templates, prod currently points here.
  - `DA’WA` WABA `1359891659538015` — holds +972 52-934-8797 (owner's other number,
    Offline, untouched — NOT ours to register).
  - **NEW production WABA `Dawa` = `990436760646692`** — created via dev-console
    "Add phone number" wizard; holds **+972 52-581-5460, phone-id `1135726059632019`**,
    OTP-verified, display name "Dawa" (accepted without review).
- **Done this session:** permanent never-expiry system-user token (user `dawa-backend`,
  perms whatsapp_business_messaging+management) in `backend/functions/.env` →
  functions deployed; new WABA assigned to dawa-backend (full access); app
  subscribed to new WABA webhooks (`success:true`; callback =
  `…cloudfunctions.net/whatsappWebhook`, fields incl. `messages` — verified via
  `GET /{app-id}/subscriptions`); 4 invite templates re-created on the new WABA
  (URL base kept `https://dawa-aa793.web.app` to match prod `PUBLIC_BASE_URL`);
  NEW `dawa_rsvp_reminder_ar/he` templates created (body `{{1}}`=guest name) —
  closes the reminders no-template gap.
- **Blocked on Meta:** WABA `account_review_status: PENDING` → number registration
  refused ("Unverified WABA"); all 6 new templates PENDING review. No violations in
  Business Support Home — just the automatic queue.
- **Owner TODO:** add a payment method to WABA 990436760646692 (deferred; sends
  will fail 131042 until then). Billing locale pre-selected Israel/USD/Jerusalem —
  ILS not offered by Meta.
- **Remaining once review clears:** `POST /{phone-id}/register` with the saved PIN →
  flip `/adminSettings.waPhoneId → 1135726059632019` + `waWabaId → 990436760646692`
  (+ set `waTemplateReminderAr/He`) → test-send → watch receipt pills + functions logs.

### Cutover execution (grilled 2026-07-06)

State re-checked live (read-only Graph GETs): WABA review **still PENDING**, number
still unregistered (`status: PENDING`), but **all 7 templates APPROVED** (4 invite +
2 reminder + hello_world) and owner confirms the **payment card is added** — the
07-04 blockers are down to registration itself. Decisions (grilled):

- **Recipients:** owner's own phone + one **cold** number (never messaged, never
  allow-listed) — only the cold one proves "sends to any number". Numbers provided
  live in-session.
- **PIN:** owner provided the saved two-step PIN in-session (never persisted).
  Fallback if Meta rejects it: WhatsApp Manager two-step reset, then retry.
- **Order — direct-first, then flip** (flip = owner's signed-off DB change):
  1. `POST /{phone-id}/register`, 2. direct Graph template sends (hello_world +
  `dawa_invite_digital_ar`) to both recipients, 3. only then flip
  `adminSettings.waPhoneId → 1135726059632019`, `waWabaId → 990436760646692`,
  `waTemplateReminderAr/He → dawa_rsvp_reminder_ar/he`, 4. re-verify through the
  app (admin test-send → Send-tab invite → receipt pills → functions logs).
  Prod is never pointed at an unproven number; rollback = restore old phone-id.
- **If register still refused (Unverified WABA):** escalate in-session — Business
  Support Home, business verification if offered, Meta ticket — log exact state,
  leave prod on the test number, retry a later session.
- Caution: recipients should expect the message — a spam report on a fresh number
  damages `quality_rating`.

**Execution result (2026-07-06): still blocked — registration refused again.**

- `POST /1135726059632019/register` (with the owner's PIN) → `(#100)` "Phone Link
  to WABA Failed — **Unverified WABA**", same as 07-04. Card + approved templates
  did NOT unblock it.
- Root cause pinned via `health_status` on the WABA: WABA `AVAILABLE`, app
  `AVAILABLE`, **BUSINESS `LIMITED` with error `141010` "The Business has not
  passed business verification."** → Meta requires *business verification* of
  portfolio dawa.invitation before any number can register on this WABA.
- **Business verification wizard walked end-to-end (hybrid Playwright):** country
  Israel → Sole proprietorship → "Not yet registered" (individual) → business
  details (Dawa / שדרות הציונות 36 א חיפה 35312 / +972544642743 / dawa.to) → Meta
  found **no matching record** → demands documents proving the legal name; accepted
  types are business-only (bank statement / registration / tax doc / incorporation
  cert). Owner has **no usable document** → wizard exited (progress not saved).
  The likely-viable route documented for later: set legal business name = owner's
  personal legal name (trade name "Dawa"), upload a personal bank statement /
  tax document bearing that name.
- **Support escalation dead end:** Business Support Home shows zero violations
  ("Request review" disabled — nothing to appeal); Direct Support only offers the
  no-reply "Report a problem" feedback form; the `/cases/async/create/dialog/`
  URL renders empty (case creation not offered to this account).
- **Prod untouched:** `waPhoneId` still points at the test number; nothing
  regressed. The 07-04 assumption "no registered business → stay unverified" is
  now **disproven for registration** — Meta hard-gates this WABA's number
  registration on business verification (141010), not just conversation caps.
- Unblock paths (owner): (a) resume the verification wizard with legal name =
  personal name + a bank statement (\~30 min once the PDF exists); (b) register an
  עוסק פטור and use its certificate; (c) stay on the test number + allow-listed
  recipients until (a)/(b). Tracked in [[Tasks Backlog]].

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
