---
date: 2026-05-26
sources:
  - DECISIONS.md
  - API_CONTRACTS.md
  - DATABASE_SCHEMA.md
tags: [auth, jwt, tokens, otp, concept]
---

# Authentication

[[Dawa]] authenticates through the [[REST API Architecture|REST API]] (`/auth/*`), never the Firebase Auth SDK on the client.

## Synthetic email
Users don't have real emails. Firebase Auth uses `username@dawa.local` synthetic addresses; the API accepts just `{ username, password }`. Target users (grooms, drivers) have no email and don't need one.

## Token lifecycle
`utils/tokenManager.js` stores `idToken` + `refreshToken` in localStorage and schedules refresh. Flow:
- `POST /auth/login` → `{ idToken, refreshToken, expiresIn, uid, role, username, displayName, phoneE164 }`
- `POST /auth/refresh` → new tokens
- `GET /auth/me` → caller profile + claims
- `apiClient.js` retries once on 401 by refreshing.

## JWT custom claims
Every user carries `{ role: "admin"|"driver"|"groom", username }`. Drivers additionally carry `{ assignedGrooms: { [groomUid]: true } }`. These claims are the only place RTDB rules and Storage rules can read per-user authorization without a DB round-trip — central to the [[Security Model]]. (The legacy `admin: true` boolean was retired for the unified `role` string.)

## Password reset via phone OTP
No email reset links — users have phone numbers, not emails. Flow: enter phone → SMS OTP (`/auth/send-otp`, requires reCAPTCHA v2) → verify (`/auth/verify-otp`) → `/auth/reset-password` verifies the phone-auth token's `phone_number` claim matches a user's `phoneE164` before resetting.

## Troubleshooting "can't log in" (live site)
A `invalid_credentials` / "wrong username or password" failure on the deployed site is **almost always a real password mismatch, not an API/code bug** — the client renders the same generic message for any non-429/non-5xx failure, which hides the distinction. Diagnose from the outside in before touching code:
1. `curl https://dawa.to/api/health` → 200 means the function is deployed and routing works.
2. `curl -X POST https://dawa.to/api/auth/login -d '{"username":"x","password":"y"}'` with a known-bad cred → a clean `401 invalid_credentials` (not 500/`server_misconfigured`, not `API_KEY_INVALID`) proves CORS + `WEB_API_KEY` + the Firebase Auth proxy are all healthy. A 500 ⇒ missing `WEB_API_KEY`; a CORS/network error ⇒ origin/build config.
3. `node functions/scripts/inspectUser.js <username>` (needs the repo-root Admin SDK key + `GOOGLE_APPLICATION_CREDENTIALS`) confirms the Auth user exists, isn't disabled, and its claims/`usernameIndex`/`/users` profile agree. `metadata.lastSignInTime` recent ⇒ the account works and someone has the real password.
4. Repair a forgotten password with `node functions/scripts/resetUser.js <username> <newPassword>` — resets via Admin SDK + revokes old sessions (the client REST path can't reset without the old password). This is a **Firebase Auth write** → get user confirmation first; it logs out any active session for that user.

Seed/dev defaults (`e2e/helpers/seed.ts`): `admin/Admin1234`, `groom/Groom1234`, `driver/Driver1234` — but **production passwords drift from these**, so a 401 with the seed value just means prod was changed.

## Password encryption (in-body, defense-in-depth)
As of 2026-06-13, the client RSA-encrypts the `password`/`newPassword` field as an
`enc:v1:` envelope before POSTing to `/auth/login`, `/auth/reset-password`, and the
`/users` password routes; a backend middleware decrypts it in place so this flow is
otherwise unchanged. Backward-compatible (plaintext still accepted) and fail-safe.
Full design + threat model: [[Password Encryption]].

See [[User Roles]] for what each role can do once authenticated.
