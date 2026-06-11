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

## Hard rules for contributors
Per [[AI Engineering Rules]], never weaken `database.rules.json`, `storage.rules`, `assertAdmin()`, `requireAuth`, rate limits, or input validation; always test security changes with rule tests. Note: a service-account JSON key sits in the repo root and must not be committed — see [[Tasks Backlog]] TASK-008.
