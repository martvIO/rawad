---
date: 2026-06-14
tags: [settings, contact, whatsapp, marketing]
---

# Communication Settings

Admin-managed contact channels + the public contact CTAs, added in
[[Audit Remediation 2026]] Phase 2 (audit reqs 1 & 3). Fixes the dead-ended
marketing funnel (every "contact to book" CTA used to open the login screen).

Related: [[Dawa]] · [[REST API Architecture]] · [[WhatsApp Messaging]] ·
[[Payments]] · [[Audit Remediation 2026]] · [[Product Audit 2026-06-13]]

## Model
`/adminSettings` gains contact fields — `contactWhatsapp`, `contactPhone`,
`contactEmail`, `socialFacebook/Instagram/Tiktok` + a matching `*Enabled` boolean
each — validated in `backend/functions/src/api/routes/settings.ts` and mirrored in
`database.rules.json` (the earlier stale-rule lesson applied).

## Surfaces
- **Admin:** Communication section in `AdminSettingsTab.jsx` (input + enable toggle
  per channel), via `usePortalAdminSettings` `contact`/`setContactField`.
- **Public:** `GET /settings/public` (no auth) returns ONLY enabled channels;
  `services/publicSettings.js` + `utils/contact.js` (`buildWhatsAppUrl`,
  `resolveContact`, with a `CONTACT` build-time fallback in `config/index.js`).
- **Wired:** landing-page pricing/CTA/footer buttons + the Terms page contact now
  open WhatsApp (`buildWhatsAppUrl` with a prefilled booking message; the
  [[Audit Remediation 2026]] Phase 10 growth loop folds `?ref=` into that message).

## To activate
Set the WhatsApp business number in admin → Settings → Communication (or the
`VITE_CONTACT_WHATSAPP` build fallback). Until set, the CTAs fall back to login.
