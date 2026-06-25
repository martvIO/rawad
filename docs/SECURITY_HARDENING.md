# Security hardening batch — changes, accepted trade-offs, and ops follow-ups

This batch closed the genuinely-open items from the platform audit. It's grouped
into **code changes** (shipped on `feat/arch-tech-debt-seams`), **accepted
trade-offs** (deliberate, documented), **already-fine** (suspected but not actual
gaps), and **operational follow-ups you must apply** (config/secret/ops actions
that can't be done in code).

## Code changes shipped
| Area | Change |
|---|---|
| CORS | `ALLOWED_ORIGINS` unset is now **fail-closed** (only the built-in allow-list passes); prod domains `dawa.to` + `invite.dawa.to` are always-allowed. `api/cors.ts`. |
| Auth limiters | Login / OTP / password-reset / per-account-lockout counters are now **persistent** (RTDB via the DbPort.transaction seam), so a cold start can't reset brute-force protection. High-volume public limiters stay in-memory. Fail-open on store error. `rateLimitPersistent.ts`. |
| SSE | Live-location stream now uses a **short-lived (~5-min) HMAC stream token** in the URL instead of the ~1h idToken (re-minted before expiry); `?token=` kept for rollout. `api/streamToken.ts`. |
| Payments | The payment-link reverse index is written **atomically** with the user metadata (one multi-path update). `payments.ts`. |
| Frontend | Poller interval **jittered ±15%**; removed a `console.log` that leaked an admin's new password; first **RTL component tests**. |

## Accepted trade-offs (deliberate — do NOT "fix")
- **Logout token-revocation is best-effort** (`auth.ts` `/logout`): a revoke failure
  must never block sign-out, and the idToken self-expires (~1h). Already documented
  in-code.
- **Public (non-auth) rate limiters stay in-memory** (`rateLimit.ts`): a cold-start
  bypass there only allows a few extra RSVP/confirmation submissions (spam, not
  breach). Persisting them would add a Firestore/RTDB read to every public request
  — latency + a new availability dependency — for no real security gain. Only the
  credential-critical counters were persisted.

## Already-fine (audit false-positives — left as-is)
- **CI validates the rules**: the `integration` job loads `database.rules.json` /
  `firestore.rules` / `storage.rules` into the emulator and runs the rules suites
  (blocking). Not a gap.
- **E2E is already blocking** in `.github/workflows/ci.yml` (no `continue-on-error`).
- **Bundle is already code-split**: AWS Liveness / Amplify are `React.lazy()`;
  `face-api` isn't in the browser bundle.

---

## Operational follow-ups (apply these in prod — not code)

### 1. ⚠️ Set `STREAM_TOKEN_SECRET` (REQUIRED for the SSE change)
The new stream tokens are HMAC-signed. Without `STREAM_TOKEN_SECRET` set, each
Cloud Function instance generates its own **ephemeral** secret, so a token minted
on instance A won't verify on instance B → the new `?streamToken=` path is flaky
under scaling (the `?token=` fallback still works). **Set a strong random
`STREAM_TOKEN_SECRET`** (≥32 bytes) in Functions config / Secret Manager, like
`WEB_API_KEY`.

### 2. Enforce encrypted passwords (`REQUIRE_ENCRYPTED_PASSWORDS`)
Order matters:
1. Confirm `GET /api/health` reports `encryption: true` (i.e. `PASSWORD_ENC_PRIVATE_KEY`
   is provisioned in prod).
2. Set `REQUIRE_ENCRYPTED_PASSWORDS=true`.
3. Deploy; watch logs for `encryption_required` 400s (a stale client) for a day.
4. Rollback = unset the flag. All current clients (browser + load test) already encrypt.

### 3. Relocate the Admin-SDK service-account key
Move `dawa-aa793-firebase-adminsdk-*.json` out of the repo root to a non-repo dir
(e.g. `~/.config/dawa/`); point `GOOGLE_APPLICATION_CREDENTIALS` at the new path for
local prod-admin work (emulator dev needs no key); re-confirm the `*-adminsdk-*.json`
gitignore. Rotate the key in GCP if it was ever shared.

### 4. `ALLOWED_ORIGINS` (optional)
The code hardcodes `dawa.to` + `invite.dawa.to` + `*.web.app` as always-allowed, so
no env var is required for the current frontends. If you add another cross-origin
caller, set `ALLOWED_ORIGINS` to it (comma-separated) — the default is now
fail-closed.

### 5. Deploy-hold — re-enable criteria
Auto-deploy stays **off**. Re-enable the SessionEnd hook only after: the in-flight
feature work is committed, this whole batch is deployed once **manually and
reviewed**, and a post-deploy smoke (login, a driver→groom live stream, a guest
RSVP) passes.
