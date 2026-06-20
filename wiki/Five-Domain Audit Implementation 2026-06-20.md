# Five-Domain Audit Implementation 2026-06-20

Implementation of the five-domain web audit (`docs/WEB-AUDIT-2026-06-20.md`) — a
Strategy / Design / Copy / Technical / Post-launch audit merged into one
lead-consultant decision document, then executed end-to-end and deployed to
production. Sibling of [[Audit Remediation 2026]], [[CRO and IA Audit 2026-06-20]],
[[QA Analytics and Ops Hardening 2026-06-20]], [[Product Audit 2026-06-13]].

## The audit
Five domain auditors (each applying an 8-point framework) → adversarial verifier
per domain → lead-consultant merge, ranked under a **solo-operator / no-deadline /
no-budget** lens. Two brief assumptions were re-verified by hand and proved **false**:
the frontend build is healthy (`npm run build` clean), and the admin-SDK key is
**not** in git history (gitignored, never committed — only a test-fixture key +
emulator seeds exist). Full report: `docs/WEB-AUDIT-2026-06-20.md`.

## What shipped (7 commits, deployed to dawa-aa793 on Node.js 22)
- **A11y + mobile** — `<main>` + skip-link, real `<label htmlFor>`/id on the
  confirm + digital-RSVP forms (PhoneInput/CityField gained an `inputId` prop),
  `role=alert`/`role=status` on form errors/success; inputs bumped to 16px to stop
  iOS focus auto-zoom (`.input-field`/`.phone-input-native`/`.dawa-inv-input`).
- **Rate limit** — confirmation form was 5/hr/**IP** (a venue NATs 200–600 guests
  → the 6th got a 429); now `keyedRateLimit` keyed by groomUsername + IP backstop.
- **Cost guardrail** — `api` capped at `maxInstances:20`.
- **Invite-open KPI** — new `POST /invites/digital/opened` stamps first-party
  `viewedAt` + the language opened in (`locale`); surfaced as
  digitalOpened/digitalOpenRatePct in the analytics aggregator.
- **Localized reminders** — `reminderText(locale,name)` (AR/HE + first-name; AR
  fallback) replaces the Arabic-only RSVP reminder.
- **Retention/privacy** — `purgeOldAuditLogs` (180d) sweeper; biometric purge now
  falls back to createdAt+90d for **undated** weddings (previously never purged).
- **Runtime** — Node 20 → 22 (EOL 2026-10-30); deployed + verified live.
- **Monitoring** — Sentry wired front + back, **inert until a DSN is set**;
  `/api/health` now reports `monitoring`.
- **CI** — added a production-build gate + a `gitleaks` secrets-scan job; tests:
  i18n AR/HE parity, price-drift guard, reminderText, open-rate.
- **UX** — onboarding checklist reused on handwritten-groom + driver dashboards;
  default OG share image (SVG); pin/warning/info icons; SkeletonList `variant`.
- **Legal/docs** — softened the 30-day-deletion privacy clause to match reality
  (biometric auto-purged; other PII kept-as-needed + on-request); corrected the
  false "secrets in git history" claim in RUNBOOK/ONBOARDING; added the owner
  activation checklist (RUNBOOK §9).

Final gates: 451 frontend unit · 189 backend unit · 123 integration · both builds
clean. Smoke-tested live: `/api/health` (monitoring field present), the new opened
endpoint (400 on bad token), landing OG tags. Demo-invite render is clean (the 10
console errors are pre-existing CSP blocks on the demo's Unsplash stock photos —
real invites use firebasestorage, which is allowed).

## Still owner-gated (cannot be done from the codebase — see RUNBOOK §9)
Set the **WhatsApp business number** (funnel is inert until then — `/settings/public`
returns `{}`); **GCP+AWS budget alerts**; enable **backups** + test a restore;
**UptimeRobot** + a **Sentry DSN**; make CI **required** in branch protection;
**gitleaks** the remote + move on-disk secrets out of OneDrive; real
**testimonials** (AR+HE); go-live secrets (Stripe/WhatsApp/AWS); export
`og-default.png`; **KPI baseline** (+ optional GA4/Clarity). See [[Conversion KPIs]].

## Explicitly skipped (audit "skip" tier)
PWA service worker, bundle gold-plating, enabling the RSA password layer,
`NODE_ENV=production`, self-serve signup, adminSettings price migration, and a
general-PII purge job (owner chose to soften the policy copy instead).
