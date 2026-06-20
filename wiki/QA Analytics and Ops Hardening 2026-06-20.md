# QA, Analytics & Ops Hardening 2026-06-20

Remediation of the analytics / QA / web-operations audit lane (see
[[Product Audit 2026-06-13]], [[Audit Remediation 2026]]). The audit's ground
truth: **no data backups, no error/uptime alerting, no CI, Chromium-only e2e,
no web analytics, bus-factor 1.** Owner decisions anchored the work: analytics
direction = **GA4 + heatmaps**; maintainer horizon = **hiring a co-maintainer**;
QA reach = **real users + several real devices + solo phone/emulator** (no paid
device lab).

## Shipped this session (in-repo, committed `502e33f`, NOT yet deployed)

Everything here is additive and changes **no production behavior or data** —
inert until the owner enables it.

- **Disaster recovery (the survival item).**
  - `backend/functions/src/backupRtdb.ts` — daily scheduled RTDB → GCS JSON
    snapshot. **No-op until `BACKUP_BUCKET` is set** (mirrors the `reminders`
    no-op-until-configured pattern). RTDB has no native scheduled export, hence
    a custom function; Firestore + Storage use managed features.
  - `backend/scripts/setup-backups.sh` — one-time owner script: Firestore **PITR**
    + managed daily backups, Storage **object versioning** + 30-day lifecycle,
    backup-bucket IAM. Same 30-day window as the biometric-purge promise.
  - Restore procedures live in `docs/RUNBOOK.md` §3.
- **CI** — `.github/workflows/ci.yml`: `unit` + `integration` (security rules) +
  `e2e` (Chromium+WebKit) on every PR. Make `unit`+`integration` *required*
  status checks in branch protection to enforce block-on-red.
- **Cross-browser / cross-device QA** — Playwright now runs Chromium/Firefox/
  WebKit + emulated Pixel 7 & iPhone 14; real-device smoke matrix in
  `docs/SMOKE_TEST.md` §G (WhatsApp in-app browser is the highest-value real
  check). WebKit matters: large iOS-Safari share in this market.
- **Security-rules tests** — new Firestore + Storage rules tests; `npm test` now
  boots all three emulators. **123 integration tests pass** (was 47). Confirms
  the biometric subtrees are server-only and the proof-write `assignedGrooms`
  gate holds. Strengthens [[Security Model]].
- **Accessibility** — axe-core audit over public pages (`e2e/a11y-axe.spec.ts`),
  fails only on critical/serious WCAG 2 A/AA.
- **Handoff docs** — `RUNBOOK.md` (incident/restore/secret-rotation),
  `ONBOARDING.md` (co-maintainer first-week ramp), `KPIS.md` (the analytics
  precondition — extends [[Conversion KPIs]]), `USER_TESTING.md` (moderated
  AR/HE session scripts), `CHANGELOG.md`.

## Blocked — needs owner inputs / hands (not done)

- **GA4 + consent banner + server-side invite-open `viewedAt`** — needs the GA4
  Measurement ID + sign-off on the cookie-consent-banner UX (it's a public-page
  website feature touching CSP + privacy). Invite-open is the highest-value
  missing metric (top of the RSVP funnel; today a link counts as engaged only on
  submit). Relates to [[Admin Analytics]]'s empty open-rate + [[Conversion KPIs]].
- **Microsoft Clarity heatmaps** — needs project ID + strict PII masking (phones,
  names, **face photos**) or route exclusion. Free; chosen over Hotjar.
- **Monitoring/alerting** — needs Sentry DSN + UptimeRobot/Cloud Monitoring
  accounts. `/api/health` exists but is unwatched.
- **Enable backup infra** — run `setup-backups.sh`, set `BACKUP_BUCKET`, deploy
  `backupRtdb`, then **test a restore** (untested backup ≠ backup).
- **Credential + history hygiene** (destructive, owner-only) — rotate leaked
  driver/`rawad` creds; scrub the admin-SDK key from git history before any
  repo handoff. A co-maintainer handoff blocker (RUNBOOK §7).

## Prioritized next (value-to-effort)

1. Run `setup-backups.sh` + deploy `backupRtdb` (survival).
2. Stand up monitoring (Sentry + UptimeRobot on `/api/health`).
3. GA4 + invite-open tracking (give me the Measurement ID + banner sign-off).
4. Clarity (give me the project ID).
5. Rotate creds + scrub history before the co-maintainer starts.
