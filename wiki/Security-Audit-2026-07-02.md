---
date: 2026-07-02
sources:
  - docs/security/audit-2026-07-02.md
tags: [security, audit, rate-limit, validation, rules, analysis]
---

# Security Audit 2026-07-02

Fresh **trust-nothing** re-audit of the *entire* codebase (backend API +
standalone functions, RTDB/Firestore/Storage rules, frontend, mobile `app/`,
loadtest) using a multi-agent **finder + adversarial-verifier** workflow plus
Semgrep/gitleaks/npm-audit. Extends [[Security Model]],
[[Backend Security Hardening 2026-07-01]], and [[Security Audit 2026-06-29]].
Full report: `docs/security/audit-2026-07-02.md`.

## Verdict
Backend confirmed strong. **16 raw candidates → 12 confirmed, 4 refuted.**
Scanners clean (Semgrep 0, gitleaks 0 real over 681 commits, functions npm audit 0).
The service-account key is **not** at the repo root (TASK-008 already resolved).

## Fixed (code + rules)
- **M1** `firestore.rules`: parent `digitalInvitations/{uid}` read was `if true`,
  leaking legacy design PII past the server allowlist/approval/freeze gates →
  now **owner/admin only** (guests still read via `GET /digital/:uid/public`).
- **M2** `auth.ts`: per-account login lockout was a *pre-credential* 429 →
  cheap targeted account-lockout DoS (incl. admin). Now verifies password first;
  a correct password always logs in + clears the counter, only failed attempts on
  a maxed account get 429. See [[Authentication]].
- **H1** load-test suite committed real prod admin/groom passwords
  (`locustfile.py`, `configstore.py`, `.env.example`, `CONFIGURATION.md`, a test
  fixture) → literals scrubbed, `BASE_URL` default → localhost. **Rotation is a
  user action.**
- **L1/L2** photographer + media uploads accepted `image/svg+xml` / any type →
  public-bucket JS/phishing host. New `isSafeMediaContentType` (image/video, no
  SVG) on both routes **and** the public `digitalMedia`/`photographerFiles`
  storage-rule writes.
- **L3** added rate limiters: media/photographer uploads, all gallery
  read/curation routes, `PATCH /settings`.
- **L4** `PATCH /gallery` title/coverPhoto now bounded-validated.
- **L5** OG-image no longer caches renders for non-existent tokens (Storage
  amplification). No IP limiter — Meta crawler hits it.
- **L6-L8** login/OTP input-length bounds; API security headers
  (nosniff/frame-deny/referrer + no `x-powered-by`); WhatsApp verify-token
  `timingSafeEqual`.

## Refuted (no change)
Admin-SDK key "at repo root" (gitignored, never committed), refresh-token in
`localStorage` (standard Firebase, no XSS sink), mobile WebView wildcard origin
(no reachable nav sink), WhatsApp verify-token timing (echoes only the challenge).

## User-action items (cannot be code)
Rotate prod admin/groom passwords + the AWS IAM key; dedicated staging loadtest
accounts; optional git-history purge of old creds; bump `aws-amplify` to clear
the frontend F-1 npm advisories.

## Verification
`tsc`/`vite build`/`build-functions` clean; backend unit 478✓; rules/integration
134✓ (parent-doc test flipped to secure + SVG storage tests added); frontend unit
unchanged (42 pre-existing jsdom failures). Committed to `main`; **prod deploy
held for owner review**.
