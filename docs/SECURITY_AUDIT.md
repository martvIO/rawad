# Backend Security Audit — دعوة (Dawa)

_Generated during the security-hardening effort. Read-only audit of the entire
backend REST API (`backend/functions/src/api/**`) + rules, produced by a
multi-agent sweep (one auditor per router group, each finding adversarially
verified to drop false positives), then triaged and fixed._

## Summary

- **35** raw findings → **28** confirmed/plausible after adversarial verification → **7** rejected as false positives.
- Dominant theme: **missing rate limiters** on individual endpoints (~20 of 28). The core auth/role/encryption controls were already sound.
- **Status:** all CONFIRMED rate-limit gaps and input-validation gaps are **fixed** in this pass. A few auth-token-in-query-param items and one enumeration nuance are documented as follow-ups (they need larger refactors or have accepted trade-offs).

## What was already sound (no change needed)
- **JWT / role tampering:** tokens are Firebase-signed and verified with `verifyIdToken(token, true)` (`checkRevoked:true`); claims are server-set only. Editing a JWT to change role is impossible. Per-route `requireAuth`/`requireAdmin`/`requireRole` gates are correct.
- **Password handling:** RSA-OAEP in-transit envelope + Firebase-Auth scrypt at rest.
- **CORS:** fail-closed allowlist.
- **Rate-limit infrastructure:** in-memory + RTDB-persistent limiters (the gaps below were endpoints that simply didn't _use_ them).
- **DB rules:** RTDB root and Firestore both default-deny.

## New security infrastructure added alongside the fixes
- **Comprehensive input validation** — `zod` + `validate()` middleware (`api/middleware/validate.ts`, `api/schemas/common.ts`) rejecting bad body/params/query with a 400 before handlers run, and emitting a `malformed_input` event.
- **Per-request monitoring** — `api/middleware/requestLog.ts` logs every request to Cloud Logging (redacted path, status, latency, ip, uid/role — no bodies/PII) + path-scan detection; `securityEvents.ts` persists the threat subset (auth/brute-force, authorization abuse, rate-limit/flood, malformed input, blocks) to Firestore, routing high-severity to Sentry.
- **Blocking** — `blockList.ts` (RTDB account/IP/fingerprint deny-lists, cached, fail-open), `api/middleware/blockCheck.ts` (pre-auth IP/fingerprint enforcement; account blocks enforced via Firebase Auth disable + token revoke), best-effort device fingerprint (`X-Device-FP`), and conservative time-boxed IP auto-block (`autoBlock.ts`).
- **Admin Security page** — `/admin/security` routes + `AdminSecurityTab.jsx` to monitor/filter events and block/unblock.

---

## Findings

Legend: **FIXED** = addressed in this pass · **FOLLOW-UP** = documented, deferred · file paths are repo-relative.

### High

| # | Finding | Location | Status |
|---|---------|----------|--------|
| 1 | Public invite-token lookup had no rate limiter (token enumeration via status probing) | `backend/functions/src/api/routes/invites.ts:101` | **FIXED** — `keyedRateLimit` per-token + IP backstop |
| 2 | Public wedding-status lookup had no rate limiter (username enumeration) | `backend/functions/src/api/routes/lifecycle.ts:303` | **FIXED** — `keyedRateLimit` per-username + IP backstop |
| 3 | Admin `GET /payments/links` (returns generated passwords) had no rate limiter | `backend/functions/src/api/routes/payments.ts:662` | **FIXED** — `uidRateLimit` |
| 4 | Gallery access token passed as query param (leaks via logs/history/referer) | `backend/functions/src/api/routes/digital/galleryAccess.routes.ts:181` | **FOLLOW-UP** — move token to `Authorization` header/cookie (larger client+server refactor) |
| 5 | Confirmation endpoint leaks username existence via `429 scope:"key"` vs `404` | `backend/functions/src/api/routes/confirmations.ts:178` | **FOLLOW-UP** — accepted trade-off; needs uniform response shape without breaking the form |

### Medium

| # | Finding | Location | Status |
|---|---------|----------|--------|
| 6 | `POST /users/:uid/admin-claim` no rate limiter | `users.ts:632` | **FIXED** |
| 7 | `PUT /users/groom-profiles/:uid` no rate limiter | `users.ts:91` | **FIXED** |
| 8 | `PATCH /users/:uid` no rate limiter | `users.ts:315` | **FIXED** |
| 9 | `deliveredAt` had no length cap (unbounded string) | `guests.ts:366` | **FIXED** — capped at 64 |
| 10 | `groomUsername` on guest records not format-validated | `guests.ts:346` | **FIXED** — `isUsername()` |
| 11 | Authenticated guest CRUD (GET/POST/PATCH/DELETE) no rate limiters | `guests.ts:99+` | **FIXED** — per-uid read/write limiters |
| 12 | Public digital-wishes read no rate limiter | `invites.ts:830` | **FIXED** — `keyedRateLimit` |
| 13 | Groom lifecycle state-changes (cancel/undo/pause/resume) no rate limiters | `lifecycle.ts:135+` | **FIXED** — shared per-uid limiter |
| 14 | Admin lifecycle actions (confirm-cancel/restore) no rate limiters | `lifecycle.ts:363,393` | **FIXED** |
| 15 | `groomUid` in `POST /live-locations/clear` not format-validated (RTDB path injection, defense-in-depth) | `liveLocations.ts:152` | **FIXED** — `SAFE_UID_RE` in `parseGroomUidList` |
| 16 | `POST /live-locations/:groomUid/stream-token` no rate limiter | `liveLocations.ts:204` | **FIXED** |
| 17 | Photographer read accepts auth token as query param | `digital/access.ts:43` | **FOLLOW-UP** — read-only + authorized; move to short-lived stream token later |
| 18 | (dup of 7) groom-profiles write limiter | `users.ts:91` | **FIXED** |

### Low

| # | Finding | Location | Status |
|---|---------|----------|--------|
| 19/28 | `DELETE /users/groom-profiles/:uid` no rate limiter | `users.ts:121` | **FIXED** |
| 20 | `GET /users` (list all) no rate limiter | `users.ts:146` | **FIXED** |
| 21 | `GET /users/groom-profiles` no rate limiter | `users.ts:71` | **FIXED** |
| 22 | Proof upload / signed-URL endpoints no rate limiters | `proofs.ts:64,157` | **FIXED** |
| 23 | Assignments endpoints no rate limiters | `assignments.ts:35,71` | **FIXED** |
| 24 | Admin invite endpoints trust `groomUid` from body (IDOR only if scoped-admin claim added later) | `invites.ts:243` | **FOLLOW-UP** — no scoped-admin model today; safe as-is |
| 25 | `GET /whatsapp/status` no rate limiter | `whatsapp.routes.ts:137` | **FIXED** |
| 26 | `GET /whatsapp/templates` no rate limiter | `whatsapp.routes.ts:202` | **FIXED** |
| 27 | 429 responses omit `retryAfterMs` | `api/middleware/rateLimit.ts` | **FOLLOW-UP** — cosmetic; clients back off already |

## Rejected as false positives (7)
- Firestore path injection in admin analytics (`admin.ts`) — inputs are fixed collection names.
- RTDB path injection in `POST /live-locations` (main) — keys are server-derived.
- Unrestricted `livenessSessionId`/phone in `photoFaces.ts` enroll — validated upstream / server-mediated.
- Cluster-label validation (`digital/gallery.routes.ts`) — bounded by existing sanitizer.
- Cross-groom member injection via cluster merge (`digital/gallery.routes.ts`) — ownership enforced.
- Lemon Squeezy webhook signature "hex vs buffer" (`payments.ts`) — comparison is correct.
- WhatsApp webhook signature "textual vs hex" (`whatsapp.ts`) — comparison is correct.

## New rate-limit policy constants
All added to `backend/functions/src/constants/rateLimits.ts` (`RATE.*`): admin-security read/action caps, invite/wishes/public-status lookup caps (+ IP backstops), guest read/write, lifecycle action/admin, stream-token, proof upload/url, assignment read/write, users-list, groom-profile read/write, admin-claim, WhatsApp read, payment-links read.

## Recommended follow-ups (not done this pass)
1. Move gallery + photographer read tokens out of query params into `Authorization` headers (findings 4, 17).
2. Make the confirmation endpoint's rate-limit response indistinguishable from `unknown_groom` (finding 5).
3. Add `retryAfterMs` to 429 bodies (finding 27).
4. Flip `REQUIRE_ENCRYPTED_PASSWORDS=true` in prod once all clients are confirmed to encrypt (they do, via the shared apiClient).
