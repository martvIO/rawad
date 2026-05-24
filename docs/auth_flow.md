# Auth Flow — Dawa

---

## Overview

The frontend has no Firebase Auth SDK. All authentication is REST-based. Tokens are stored in `localStorage` via `tokenManager.js`.

---

## Login Flow

```
User enters username + password
         │
         ▼
LoginScreen.jsx
  calls signIn(username, password)
         │
         ▼
services/auth.js → POST /auth/login
  body: { username, password }
         │
         ▼
auth.ts (Cloud Function)
  1. Converts: username → username@dawa.local
  2. Calls Firebase Auth REST API (signInWithPassword)
  3. On success: fetches /users/{uid} from RTDB for role/displayName
  4. Returns: { idToken, refreshToken, expiresIn, uid, role, username, displayName, phoneE164 }
         │
         ▼
tokenManager.js: storeTokens()
  - Saves to localStorage: dawa.idToken, dawa.refreshToken, dawa.expiresAt, dawa.uid
  - Schedules proactive refresh timer (5 min before expiry)
         │
         ▼
usePortalState.js
  - Sets: authed=true, userType=role, currentUid=uid, etc.
  - Routes to role default path
```

---

## Session Persistence (page reload)

```
Page loads
         │
         ▼
usePortalState.js: loadStoredTokens()
  - Reads dawa.* keys from localStorage
  - If idToken exists: polls GET /auth/me
         │
         ▼
apiClient.js: GET /auth/me
  - Attaches Bearer token
  - Returns { uid, role, username, displayName, phoneE164, claims }
         │
         ▼
usePortalState.js
  - Sets authReady=true, authed=true, role data
  - Portal renders with recovered session
```

---

## Token Refresh Flow

### Proactive (scheduled)
```
tokenManager: scheduleRefresh()
  - setTimeout fires 5 min before expiresAt
  - Calls refreshIdToken()
         │
         ▼
POST /auth/refresh
  body: { refreshToken }
  returns: { idToken, refreshToken, expiresIn }
         │
         ▼
tokenManager: storeTokens() — updates localStorage + re-arms timer
```

### Reactive (on 401)
```
apiClient: any request returns 401
         │
         ▼
handleUnauthorized()
  - Calls refreshIdToken()
  - Retries the original request with the new token
  - On second 401: clearTokens() + authChangeCb(null) → routes to login
```

---

## Logout Flow

```
User clicks logout
         │
         ▼
LogoutPage.jsx (or logout handler in portal)
  calls signOutNow()
         │
         ▼
services/auth.js
  - POST /auth/logout (best-effort — stateless ACK)
  - tokenManager.clearTokens()
    - Clears localStorage: dawa.idToken, dawa.refreshToken, dawa.expiresAt, dawa.uid
    - Cancels refresh timer
         │
         ▼
usePortalState.js
  - authChangeCb fires → authed=false
  - Routes to /portal/login
```

---

## Password Reset Flow (Phone OTP)

```
User enters phone number
         │
         ▼
PasswordResetFlow.jsx: Step 1
  calls sendPasswordResetCode(phoneE164)
         │
         ▼
POST /auth/send-otp
  body: { phoneE164, recaptchaToken }
  (reCAPTCHA v2 widget renders in browser)
  returns: { sessionInfo }
         │
         ▼
User receives SMS code
User enters code
         │
         ▼
PasswordResetFlow.jsx: Step 2
  calls confirmCode(sessionInfo, code)
         │
         ▼
POST /auth/verify-otp
  body: { sessionInfo, code }
  returns: { idToken, refreshToken, expiresIn }
  (phone-auth ID token — has phone_number claim, NOT role claim)
         │
         ▼
User enters new password
         │
         ▼
POST /auth/reset-password
  headers: { Authorization: Bearer <phone-auth idToken> }
  body: { newPassword }
         │
         ▼
auth.ts (Cloud Function)
  1. Verifies token has phone_number claim (not a portal login token)
  2. Looks up portal user by phone via /phoneIndex
  3. Verifies phoneE164 matches user profile
  4. Updates password + revokes refresh tokens
  5. Deletes throw-away phone-auth user
  6. Writes audit log
  returns: { ok: true }
         │
         ▼
User redirected to login screen
```

---

## Claims and Role Detection

Firebase ID tokens carry custom claims set by Cloud Functions:

```json
{
  "role": "admin | driver | groom",
  "username": "string",
  "assignedGrooms": { "[groomUid]": true }
}
```

`usePortalState.js` determines the user's role by reading `claims.role` from `GET /auth/me`. This drives:
- Which portal sub-tree renders (`admin/*`, `driver/*`, `groom/*`)
- Which RTDB paths are accessible (enforced server-side by rules)
- Which API routes are accessible (enforced server-side by `requireAuth` + `assertAdmin`)

---

## Role Change Propagation

When an admin changes a user's role:
1. `updatePortalUser` Cloud Function updates the JWT custom claim
2. The affected user's next `GET /auth/me` poll (every 30s) returns the new role
3. `usePortalState.js` updates `userType` and re-routes if needed
4. On any API call that returns 401 (stale token), `apiClient` refreshes the token and retries

---

## Security Notes

- The `WEB_API_KEY` (Firebase Web API key) is used server-side only in Cloud Functions. It is never exposed in `VITE_*` environment variables.
- Tokens in `localStorage` are readable by JavaScript on the same origin. This is acceptable given the CORS controls and the fact that there is no sensitive PII in the token payload itself.
- The phone-auth ID token from `/auth/verify-otp` is short-lived and carries only `phone_number`. It cannot be used to access any portal data — it is only accepted by `/auth/reset-password`.
