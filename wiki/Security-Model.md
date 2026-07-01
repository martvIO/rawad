---
date: 2026-05-26
sources:
  - README.md
  - AI_RULES.md
  - DECISIONS.md
tags: [security, rules, auth, concept]
---

# Security Model

[[Dawa]] enforces authorization in **three server-side layers** plus a non-authoritative UI guard.

1. **Cloud Functions** — `assertAdmin()` in `helpers.ts` throws `permission-denied` before any privileged logic; `requireAuth` middleware in `api/middleware/auth.ts` gates authed routes.
2. **RTDB rules** (`database.rules.json`) — check `auth.token.role === 'admin'`, ownership, and schema `.validate`.
3. **Storage rules** (`storage.rules`) — gate proof photos on the `assignedGrooms[groomUid] === true` claim.
4. **Client UI** — `RoleGuard` prevents wrong-role rendering. **Convenience only — not authoritative.**

All three enforced layers read JWT custom claims (`role`, `username`, `assignedGrooms`) — see [[Authentication]]. The claims model is why data is [[Data Storage Model|sharded by groomUid]]: rules read claims, not DB lookups.

## Abuse controls
- **No App Check** — it caused false rejections on mobile WebViews. The public `submitConfirmation` endpoint is rate-limited instead.
- **Rate limiting** — `rateLimit.ts` uses an in-memory sliding window (per-function-instance, resets on cold start). Limits: confirmation form 5/hr/IP, login 10/hr/IP, refresh 60/hr/IP, OTP 5/hr/IP.
  - **IP derivation (hardened 2026-06-11):** the client IP is now taken from Express `req.ip` with a fixed `trust proxy` hop count (`api/index.ts`), NOT the attacker-controlled leftmost `X-Forwarded-For` entry. Previously a rotating XFF header gave a fresh bucket per request, defeating every IP-keyed limit. The in-memory/per-instance nature remains a known limitation — a shared-store limiter is a documented follow-up.

## 2026-06-11 audit hardening
A full audit added several server-side protections (all verified by unit/integration/e2e + emulator API checks):
- **Auth/session:** `POST /auth/logout` now calls `revokeRefreshTokens` (was a no-op) so a captured token dies on sign-out; the `?token=` query fallback in `requireAuth` is restricted to GET at runtime (no replay on POST/PATCH/DELETE); login/OTP responses return generic codes (no `USER_DISABLED`/Firebase-code enumeration).
- **Invite tokens:** physical `POST /invites/submit` enforces a one-shot `usedAt` guard (transaction-claimed); `GET /invites/token/:token` returns a projected subset (no internal ids); `inviteTokens/$token` RTDB `.read` is now `false` (server Admin SDK only).
- **Access control:** `POST /live-locations` filters `shareWith` to the driver's `assignedGrooms` claim, and `database.rules.json` requires an assignment to write a location shard (clearing still allowed); `GET /digital/:uid/public` is approved-only; the public confirmation auto-attach no longer mutates a guest's GPS pin; `PATCH /users/:uid` enforces a field allowlist.
- **Supply chain / deps:** `@grpc/grpc-js`/`uuid`/`qs` bumped to patched versions (functions `npm audit` clean); Leaflet CDN injection pinned with SRI; CORS defaults hardened (explicit `ALLOWED_ORIGINS` + always-allow localhost/`*.web.app`).

## Password-encryption layer (2026-06-13)
A defense-in-depth [[Password Encryption]] layer RSA-encrypts password fields as
`enc:v1:` envelopes before they leave the client, keeping plaintext out of access
logs / DevTools. It is **on top of** HTTPS (not a replacement) and does not defend
against an active body-modifying adversary. Backward-compatible and fail-safe
(no key ⇒ plaintext-over-TLS); `/api/health` exposes `encryption: true|false`.
Committed `dc22fd6`; inert in prod until `PASSWORD_ENC_PRIVATE_KEY` is provisioned.

## Biometric face data (2026-06-12)
The [[Face Matching]] feature stores face descriptors (biometric data) in two
Firestore collections that are **explicitly `allow read, write: if false`** —
Cloud Functions Admin SDK only, never client-readable, and descriptors never
appear in any API response. Guest enrollment requires an explicit AR/HE consent
screen (a `consentAt` timestamp is stored) and is auto-deleted via a Firestore
TTL policy on `guestFaces.expireAt` at token expiry, plus a guest-facing delete
button. The public photo endpoints are rate-limited **per invite token** (with a
per-IP backstop) rather than per-IP, because wedding guests share the venue's
NAT IP — keying by IP alone would throttle the whole party as one client.

## Hard rules for contributors
Per [[AI Engineering Rules]], never weaken `database.rules.json`, `storage.rules`, `assertAdmin()`, `requireAuth`, rate limits, or input validation; always test security changes with rule tests. Note: a service-account JSON key sits in the repo root and must not be committed — see [[Tasks Backlog]] TASK-008.

## 2026-07-01 — Monitoring, blocking & comprehensive input validation

Added a fourth-generation hardening pass (see [[Backend-Security-Hardening-2026-07-01]]):

- **Input validation** — `zod` + a `validate()` middleware (`api/middleware/validate.ts`, `api/schemas/common.ts`) reject bad body/params/query with a 400 *before* the handler and emit a `malformed_input` event. Reuses the existing `isUsername`/`isE164`/`isStrongPassword` helpers.
- **Per-request monitoring** — every request → Cloud Logging (redacted, no PII) via `api/middleware/requestLog.ts`; the threat subset → Firestore `securityEvents` (`securityEvents.ts`), high-severity mirrored to Sentry. Threat types: auth/brute-force, authorization abuse, rate-limit/flood, malformed input, path-scan, blocks.
- **Blocking** — RTDB `securityBlocks` (account/IP/fingerprint) via `blockList.ts` + pre-auth `blockCheck` middleware (fail-open, cached); account blocks also `disable + revokeRefreshTokens` in Firebase Auth. Best-effort device fingerprint (`X-Device-FP`, evadable — not hardware) + conservative time-boxed IP auto-block (`autoBlock.ts`).
- **Admin Security page** — `/admin/security` routes + `AdminSecurityTab.jsx` to filter events and block/unblock.
- **Encryption enforcement** — `REQUIRE_ENCRYPTED_PASSWORDS=true` in prod (skipped under the emulator so plaintext api-tests still pass).
- **Explicit deny rules** added for `securityBlocks` (RTDB) + `securityEvents` (Firestore), mirroring the biometric-data lockdown (they were already covered by default-deny).

Note: "block hardware to defeat VPN" is not achievable from a server — the layered account+IP+fingerprint approach is the realistic equivalent, and the fingerprint is an evadable weak signal.
