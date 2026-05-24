# Architecture — Dawa

---

## Overview

Dawa is a three-tier web application:

```
Browser (React SPA)
    │
    │  HTTPS REST  (JSON + Bearer token)
    ▼
Cloud Functions (Express API)  ←→  Firebase Auth (identity)
    │
    ├──  RTDB  (guests, users, confirmations, live GPS, settings)
    ├──  Firestore  (digital guests, media, photographer files)
    └──  Storage  (proof photos, digital media)
```

---

## Frontend

**Framework:** React 18 + Vite

**No Firebase SDK on the client.** The browser never talks directly to RTDB, Firestore, or Firebase Auth. All communication goes through the REST API.

### Auth flow (client side)
1. `POST /auth/login` → receives `{ idToken, refreshToken, expiresIn, uid, role, username }`
2. `tokenManager.js` stores tokens in `localStorage` under `dawa.*` keys
3. Every subsequent `apiClient.js` request attaches `Authorization: Bearer <idToken>`
4. On 401: `apiClient.js` calls `refreshIdToken()` once, then retries the original request
5. On permanent auth failure: `clearTokens()` + notify `usePortalState` → routes to login

### Polling (subscription replacement)
Firebase's `onValue` real-time subscriptions are replaced by `poller.js` — HTTP polling on configurable intervals. Most resources poll every 15–30 seconds. Live driver GPS uses SSE instead.

### State management
`usePortalState.js` is the single source of truth for all portal state. It runs once inside `PortalProvider` and provides data + handlers to all portal views via `usePortal()` context hook.

### Routing
react-router-dom v7. All routes defined in `App.jsx`:

| Path | Component | Notes |
|---|---|---|
| `/` | LandingPage | Public marketing |
| `/confirm/:groomUsername` | ConfirmationForm | Public RSVP |
| `/invite/:token` | InviteForm | Handwritten invite |
| `/invite/digital/:token` | DigitalInviteForm | Digital invite |
| `/d/:groomUsername/:token/*` | DigitalInvitationPage | SSR'd digital page |
| `/portal/*` | Portal | Auth-gated |

---

## Backend

**Runtime:** Cloud Functions v2 — Node 20 — TypeScript

### REST API (`functions/src/api/`)

An Express application exported as the `api` Cloud Function. Firebase Hosting rewrites `/api/**` to it.

```
app
 ├── CORS (allowlist from ALLOWED_ORIGINS env var)
 ├── JSON body parser (10 MB limit)
 ├── stripApiPrefix middleware (normalizes /api/... vs /... paths)
 ├── /auth         — login, logout, refresh, me, OTP, reset
 ├── /users        — admin CRUD
 ├── /guests       — guest CRUD, sharded by groomUid
 ├── /confirmations — submit (public), list (admin), patch (admin)
 ├── /live-locations — driver GPS (SSE + publish/clear)
 ├── /invites      — create token, submit token
 ├── /assignments  — driver → groom
 ├── /proofs       — proof photo upload (multipart)
 ├── /digital      — digital guests, media, photographer
 ├── /settings     — WhatsApp template
 └── /health       — uptime probe
```

### Auth middleware (`functions/src/api/middleware/auth.ts`)
`requireAuth` verifies the Firebase ID token on every protected route using `getAuth().verifyIdToken()`. Attaches `req.caller = { uid, claims }`. All routes use this middleware except explicitly public ones (login, submitConfirmation, submitGuestInvite).

### Rate limiting
Two layers:
1. `ipRateLimit(key, limit, windowMs)` — Express middleware, applied per route
2. `allow(key, limit, windowMs)` — in-memory function called inside route handlers for finer control

Both use the in-memory sliding-window implementation in `rateLimit.ts`. Not shared across Cloud Function instances.

### Legacy callable Cloud Functions
Some Firebase HTTPS Callable functions still exist in `functions/src/index.ts` alongside the `api` export. They are being replaced by REST routes. Once all frontend calls migrate, these can be removed.

---

## Data Layer

### RTDB vs Firestore
RTDB is the primary store. Firestore is used only for digital invitation data (guests, media, photographer files) because it proved more reliable for the write-after-login pattern the digital flow requires.

### Sharding
RTDB data is sharded by `groomUid` where possible:
- `/guestsByGroom/{groomUid}` — grooms and drivers only read their own subtree
- `/liveLocationsByGroom/{groomUid}` — grooms read their own subtree
- `/driverAssignments/{driverUid}` — drivers read their own subtree

### Authorization in rules
`database.rules.json` and `storage.rules` read `auth.token.role` and `auth.token.assignedGrooms`. These claims are minted by Cloud Functions, never by the client.

---

## Deployment

Firebase Hosting serves the static React SPA. Rewrites:
- `/api/**` → `api` Cloud Function (Express app)
- `/d/**` → `digitalInvitePreview` Cloud Function (SSR digital invitation page)
- `**` → `/index.html` (SPA fallback)

Security headers applied at the Hosting layer (in `firebase.json`): HSTS, X-Frame-Options: DENY, CSP, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.

See `docs/deployment.md` for the full deploy procedure.

---

## Key Design Patterns

### Service layer contract
Every `src/services/*.js` file exports subscription functions (using `createPoller`) and mutation functions (using `apiClient`). Hooks consume services; components consume hooks via context. No component calls a service directly.

### Error handling
- Network errors → `Error("network_error")`
- HTTP errors → `ApiError(status, body, message)` with `.status` and `.body`
- Auth expiry → `authChangeCb(null)` notification → routes to login
- Logging → `logErr("tag", err)` — tagged `[dawa]`, silent in production

### i18n
All user-visible strings use `t(key)` from `makeT(lang)`. The `lang` state lives in `App.jsx` and flows down through `langProps`. New strings must be added to both `ar.js` and `he.js`.
