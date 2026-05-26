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

See [[User Roles]] for what each role can do once authenticated.
