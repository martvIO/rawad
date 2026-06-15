---
date: 2026-06-14
tags: [audit, implementation, roadmap, shipped]
---

# Audit Remediation 2026

Implementation of the entire [[Product Audit 2026-06-13]] roadmap — **Phases 1-13,
all shipped to production** (`dawa-aa793`) across 15 commits (`fa5d3bb` → `dfa3bfb`).
Every phase was verified (frontend + Cloud Functions build clean, **431 frontend /
147 backend unit tests** green) then committed and deployed. The parallel
password-encryption feature was deliberately left uncommitted for the owner.

Related: [[Dawa]] · [[Product Audit 2026-06-13]] · [[Payments]] ·
[[WhatsApp Messaging]] · [[Communication Settings]] · [[REST API Architecture]] ·
[[Security Model]] · [[Digital Invitations]] · [[Known Bugs]] · [[Tasks Backlog]]

---

## Phases shipped

- **Phase 1 — Quick wins.** `frontend/src/utils/apiError.js` `localizeApiError()`
  maps transport/domain codes (`api_429`, `network_error`, `request_timeout`,
  `session_expired`, `design_not_approved`, …) to AR/HE strings — routed through
  every error toast so users never see a raw code. Stale Telegram "share_invalid"
  copy rewritten to WhatsApp/phone-specific keys. Shared `isProofImage()`
  (`utils/mediaUtils.js`) fixes the groom dashboard hiding Storage-backed proofs.
  Softened the unkept reminder + "automatic emergency message" promises. Backend
  error-detail leak closed: `errorMessage()` suppresses raw detail by default,
  opt-in via `DAWA_DEBUG_ERRORS=1` (see [[Security Model]]). Fixed the stale
  `adminSettings` RTDB `.validate` rules. ([[Optimistic UI Pattern]] context.)
- **Phase 2 — [[Communication Settings]]** (audit reqs 1 & 3): admin Communication
  tab (WhatsApp/phone/email/socials + enable toggles), public `GET /settings/public`,
  `CONTACT` config fallback + `utils/contact.js`, landing-page CTAs/footer + Terms
  page now open WhatsApp.
- **Phase 3 — [[Payments]]** (req 2): Stripe Payment Links (test mode) + webhook +
  admin user-editor PaymentSection.
- **Phase 4 — [[WhatsApp Messaging]]:** WhatsApp Cloud API send helper + Meta
  webhook (4a) and a daily `onSchedule` RSVP reminder job (4b).
- **Phase 5 — Onboarding.** `components/OnboardingChecklist.jsx` on the digital
  dashboard + a "the team sends invites after approval" note on the guest list
  (fixes the "groom hunts for a non-existent Send button" confusion). See
  [[User Roles]].
- **Phase 6 — Driver delivery outcomes.** New statuses `no_answer` / `wrong_address`
  / `refused` across `data/status.js`, backend `ALLOWED_STATUS`, and the
  `guestsByGroom` RTDB rule; `markGuestOutcome` handler + driver-UI buttons. So a
  groom can tell a real delivery from an attempt that couldn't complete.
- **Phase 7 — Bulk guest import.** `utils/bulkGuests.js` (`toLocalIL` +
  `parseGuestLines`) + a paste-and-preview panel on the digital add-guest page.
- **Phase 8 — Admin audit-log reader.** `GET /admin/audit` (admin, paginated) +
  an Audit tab — the append-only `/audit` trail finally has a read path.
- **Phase 9 — Dashboard reply rollup.** Confirmed / awaiting / not-sent tiles on
  the handwritten groom dashboard.
- **Phase 10 — Growth loop.** Subtle "made with Dawa — create yours" credit on the
  public invitation linking back with `?ref=invite`; the landing page folds the
  ref into the WhatsApp booking message.
- **Phase 11 — Consent links.** `components/ConsentNotice.jsx` on the public
  confirm/invite forms, linking to the Terms & Privacy page at the point of data
  collection.
- **Phase 12 — Hebrew fonts + i18n.** Heebo + Frank Ruhl Libre added globally; the
  `'Amiri',serif` stack extended with a Hebrew fallback across 30 files (Hebrew no
  longer falls back to OS serif); fixed the mixed Arabic+Hebrew driver button.
- **Phase 13 — Export + venue.** Guest-list CSV export (`utils/csv.js`, UTF-8 BOM)
  + a Waze deep-link alongside Google Maps on the venue section.

## Dormant until credentials are set (degrade safely)
- **[[Payments]] (Stripe):** `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + a
  Stripe webhook pointed at `/api/payments/webhook`.
- **[[WhatsApp Messaging]]:** `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_ID` /
  `WHATSAPP_VERIFY_TOKEN` + the Meta webhook → the `whatsappWebhook` function URL.
- **Contact number:** set in admin → Settings → Communication.

## Deferred — needs owner decision (NOT done autonomously)
- **30-day PII auto-deletion** (audit critical): either rewrite the published legal
  policy or deploy a destructive daily deletion cron. Both left for human sign-off;
  consent links added in the meantime. See [[Security Model]].
- **Server-side "invite opened" analytics** (touches the public hot path).
- **Ops:** Firebase functions runtime is Node 20 — decommissioned 2026-10-30; bump
  before then.
