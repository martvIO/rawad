---
date: 2026-07-01
sources:
  - docs/SECURITY_AUDIT.md
  - backend/functions/src/securityEvents.ts
  - backend/functions/src/blockList.ts
tags: [security, monitoring, rate-limit, validation, analysis]
---

# Backend Security Hardening 2026-07-01

A grilling session + build pass that added a monitoring/blocking/validation layer
on top of the already-sound [[Security Model]], and ran a full adversarially-verified
backend audit. Extends the earlier [[Security Audit 2026-06-29]] (which covered
AI-introduced vuln classes) with an endpoint-by-endpoint audit + net-new features.

## What already existed (not rebuilt)
Role gates (`requireAuth`/`requireAdmin`/`requireRole`), Firebase-signed JWTs
(role tampering impossible), rate-limit infrastructure, RSA password envelope,
fail-closed CORS, default-deny RTDB + Firestore. This pass filled the gaps.

## New capabilities
- **Comprehensive input validation** — `zod` + `validate()` middleware on endpoints, reusing existing validators (`helpers.ts`).
- **Monitoring** — full access log to Cloud Logging (`requestLog.ts`, redacted/no-PII) + threat subset to Firestore `securityEvents` (`securityEvents.ts`), high-severity → Sentry.
- **Blocking** — RTDB `securityBlocks` account/IP/fingerprint deny-lists (`blockList.ts`) + pre-auth `blockCheck` (fail-open, cached); account block = Firebase Auth disable + token revoke. Device fingerprint header `X-Device-FP` (evadable, not hardware). Conservative time-boxed IP auto-block (`autoBlock.ts`).
- **Admin Security page** — `/admin/security` (events/summary/blocks/block/unblock/resolve) + `AdminSecurityTab.jsx`.
- **Encryption enforcement** — `REQUIRE_ENCRYPTED_PASSWORDS=true` (prod only; emulator skips).

## Audit results (`docs/SECURITY_AUDIT.md`)
35 raw → **28 confirmed/plausible** (7 false positives) via a multi-agent
finder+adversarial-verifier workflow. Dominant theme: **~20 endpoints missing a
rate limiter**. All CONFIRMED rate-limit + input-validation gaps were **fixed**
(invites/lifecycle/payments/users/guests/proofs/assignments/whatsapp/liveLocations).
Documented follow-ups: gallery/photographer tokens in query params (findings 4/17),
confirmation 429-vs-404 enumeration nuance (5), `retryAfterMs` in 429 bodies (27).

## Verification
- Backend `tsc` + frontend Vite build clean; new `securityValidate.test.ts` passes (6/6); 486 unit tests pass (42 pre-existing jsdom/localStorage failures unrelated).
- Emulator end-to-end (curl): auth 401, admin 403 `authz_denied`, zod 400 `invalid_input`, block/unblock, and the event feed recording auth_failure/authz_denied/malformed_input/manual_block.
- Playwright: admin login → Security tab renders summary+feed+filters+blocks, manual block via UI works, no console errors, correct RTL.

## Key decisions
- Layered account+IP+fingerprint blocking (hardware/VPN-proof blocking is impossible from a server).
- Manual + conservative auto-block (IP-only, time-boxed) — never auto-block accounts.
- RTDB for blocks (fast per-request check) + Firestore for events (rich filtering).
- Harden encryption, don't expand field encryption (would break phone matching/search).
