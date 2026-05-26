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

## Hard rules for contributors
Per [[AI Engineering Rules]], never weaken `database.rules.json`, `storage.rules`, `assertAdmin()`, `requireAuth`, rate limits, or input validation; always test security changes with rule tests. Note: a service-account JSON key sits in the repo root and must not be committed — see [[Tasks Backlog]] TASK-008.
