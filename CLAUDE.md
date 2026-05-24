# Dawa (دعوة) — Codebase Reference

> **Note (2026-05-22):** the Firebase client SDK was fully removed in
> commits `fed9d38…6ad2ae5`. All client/server traffic now goes through a
> REST API. See [docs/USER-FLOWS.md](docs/USER-FLOWS.md) for the
> interaction map and [docs/AUDIT-2026-05-22.md](docs/AUDIT-2026-05-22.md)
> for the audit that drove this rewrite of the doc.

## 1. What This Project Is

**Dawa** ("Invitation" in Arabic) is a wedding-invitation management and
distribution platform for the Arab/Israeli market. There are three roles:

- **Admin** — manages users, monitors confirmations, edits guests, sends WhatsApp messages, controls settings.
- **Groom** — manages their own guest list, monitors delivery + live driver locations, sends per-guest digital invite links.
- **Driver** — picks a groom's delivery route, marks guests delivered, uploads proof photos, shares GPS.

The app supports both **handwritten** (physical delivery by driver, with
photo proof + GPS) and **digital** (WhatsApp invite link with RSVP form)
invitations.

---

## 2. Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, react-router-dom v7 |
| Frontend state | One central hook ([src/hooks/usePortalState.js](src/hooks/usePortalState.js)) exposed via [PortalContext](src/context/PortalContext.jsx) |
| Frontend ↔ backend | REST over `fetch`. Bearer-token auth. No Firebase client SDK. |
| REST client | [src/utils/apiClient.js](src/utils/apiClient.js) + [tokenManager.js](src/utils/tokenManager.js) + [poller.js](src/utils/poller.js) |
| Backend | Express app mounted as the `api` Cloud Function ([functions/src/api/](functions/src/api/)), Node 20 |
| Backend ↔ Firebase | `firebase-admin` SDK (RTDB + Firestore + Storage + Auth) — server-side only |
| Auth | Synthetic email `username@dawa.local` + password proxied to Firebase Identity Toolkit (REST) |
| Password reset | Phone SMS OTP via Firebase Phone Auth REST + `/api/auth/reset-password` |
| Map library | Leaflet 1.9.4 (lazily injected from CDN by [useLeaflet](src/hooks/useLeaflet.js)) |
| Styling | 100% inline styles + design tokens in [src/styles/theme.js](src/styles/theme.js) |
| Testing | Vitest — 404 unit tests pass (`npm run test:unit`); integration tests via Firebase Database emulator |
| Deployment | Firebase Hosting (frontend) + Cloud Functions (`api`, `digitalInvitePreview`) |

---

## 3. High-Level Request Flow

```
Browser  ── fetch ──▶  Firebase Hosting  ── /api/** rewrite ──▶  Cloud Function `api`
                                                                       │
                                                                       ▼
                                                                  Express app
                                                                  ([functions/src/api/index.ts](functions/src/api/index.ts))
                                                                       │
                                                                       ├─ /auth/*           → Firebase Identity Toolkit REST
                                                                       ├─ /users/*          → firebase-admin (Auth + RTDB)
                                                                       ├─ /guests/*         → firebase-admin (RTDB)
                                                                       ├─ /confirmations/*  → firebase-admin (RTDB)
                                                                       ├─ /digital/*        → firebase-admin (Firestore + Storage)
                                                                       ├─ /invites/*        → firebase-admin (RTDB)
                                                                       ├─ /assignments/*    → firebase-admin (RTDB + custom claims)
                                                                       ├─ /proofs/*         → firebase-admin (Storage signed URLs)
                                                                       ├─ /live-locations/* → firebase-admin (RTDB) + SSE
                                                                       └─ /settings         → firebase-admin (RTDB)
```

The frontend never speaks to Firebase directly. Browser → Hosting →
Express → `firebase-admin`. The Firebase client SDK is no longer installed
or imported. [src/firebase.js](src/firebase.js) is an empty shell kept only
so any lingering imports don't crash module load.

---

## 4. Project Structure (top-level)

```
rawad/
├── src/
│   ├── main.jsx                        — Entry point; mounts React in BrowserRouter
│   ├── App.jsx                         — Top-level routes; language state
│   ├── firebase.js                     — EMPTY SHELL (kept for back-compat)
│   ├── config/index.js                 — All env vars + tuning constants
│   ├── constants/                      — Frozen string/number maps (roles, status, storage keys)
│   ├── i18n/                           — Arabic + Hebrew string maps + makeT factory
│   ├── data/                           — Static seed data (cities, status, invite templates)
│   ├── assets/                         — Inline SVG strings
│   ├── styles/                         — theme.js tokens + GlobalStyle.jsx
│   ├── hooks/
│   │   ├── usePortalState.js           — Central portal state + handlers (≈1000 LOC)
│   │   ├── useGeolocation.js           — GPS watch + REST publish/subscribe (driver share + groom map)
│   │   └── useLeaflet.js               — Lazy CDN-load Leaflet
│   ├── context/PortalContext.jsx       — One context exposing usePortalState
│   ├── utils/
│   │   ├── apiClient.js                — fetch wrapper: auth + 401-refresh-retry + timeout
│   │   ├── tokenManager.js             — idToken + refreshToken lifecycle (localStorage)
│   │   ├── poller.js                   — createPoller — fires fetchFn every N ms (subscription substitute)
│   │   ├── logger.js                   — Tagged [dawa] console wrapper (silent in prod)
│   │   ├── matchUtils.js               — Confirmation phone/name/address fuzzy matching
│   │   ├── phone.js, validation.js, password.js, geo.js, storage.js
│   ├── services/                       — One file per resource. Each file = REST calls + subscriptions.
│   │   ├── _helpers.js                 — subscribeList(endpoint, cb) = createPoller(api.get(endpoint), cb)
│   │   ├── auth.js                     — signIn, signOutNow, subscribeAuth (polls /auth/me), OTP flow
│   │   ├── guests.js                   — guests RTDB endpoints
│   │   ├── users.js                    — admin user CRUD endpoints
│   │   ├── confirmations.js            — public submit + admin list/edit
│   │   ├── adminSettings.js            — /settings subscribe + save
│   │   ├── assignments.js              — driver↔groom claim management
│   │   ├── invites.js                  — per-guest token mint/redeem
│   │   ├── liveLocations.js            — REST publish + SSE subscribe for driver GPS
│   │   ├── proofs.js                   — delivery photo upload (multipart)
│   │   ├── digitalInvitation.js        — Firestore-backed digital guests + media + photographer
│   │   └── designRequests.js           — design workflow
│   ├── pages/
│   │   ├── LandingPage.jsx, ConfirmationForm.jsx, InviteForm.jsx,
│   │   ├── DigitalInviteForm.jsx, DigitalInvitationPage.jsx
│   │   └── portal/
│   │       ├── Portal.jsx                — Auth gate + role-based route tree
│   │       ├── LoginScreen.jsx, LogoutPage.jsx
│   │       ├── admin/  — AdminPortal + tabs (Users, Send, Confirmations, Designs, Settings)
│   │       ├── driver/ — DriverPortal + tabs (PickGroom, DeliveryList, Map, ShareLocation, SharedCities)
│   │       └── groom/  — GroomPortalView + handwritten + digital/ subtrees
│   └── components/                     — Modals, inputs, map, brand widgets (see folder)
│
├── functions/
│   ├── src/
│   │   ├── index.ts                    — `api` and `digitalInvitePreview` Cloud Function entry
│   │   ├── api/
│   │   │   ├── index.ts                — Express app factory + CORS + stripApiPrefix middleware
│   │   │   ├── middleware/auth.ts      — requireAuth (verifies Bearer), requireAdmin
│   │   │   ├── middleware/rateLimit.ts — Express adapter over rateLimit.ts
│   │   │   └── routes/                 — auth, users, guests, confirmations, settings, invites,
│   │   │                                  assignments, proofs, liveLocations, digital (10 routers)
│   │   ├── helpers.ts                  — assertAdmin shim, isE164, syntheticEmail, phoneIndexKey, isStrongPassword
│   │   ├── audit.ts                    — writeAudit helper (/audit/{id})
│   │   └── rateLimit.ts                — Sliding-window in-memory limiter
│   ├── lib/                            — tsc output (gitignored)
│   └── .env                            — WEB_API_KEY (server-only; do not expose to client)
│
├── database.rules.json                 — RTDB rules (auth.token.role === 'admin', ownership, schema)
├── storage.rules                       — Storage rules (assignedGrooms claim for proof photos)
├── firestore.rules                     — Firestore rules (digital invitation data)
├── firebase.json                       — Hosting rewrites, CSP headers, emulator ports
├── netlify.toml                        — SPA fallback config (for Netlify mirror deploys)
├── .env                                — VITE_* + VITE_API_BASE_URL=/api
├── docs/
│   ├── USER-FLOWS.md                   — Interaction map for every user flow
│   ├── AUDIT-2026-05-22.md             — Audit findings + fixes shipped 2026-05-22
│   └── SMOKE_TEST.md                   — Manual smoke-test checklist
└── tests/                              — Integration tests against the emulator
```

---

## 5. The Three Critical Frontend Modules

These three files run every network round trip. If you touch them, run
[src/__tests__/utils/apiClient.test.js](src/__tests__/utils/apiClient.test.js)
and the poller + tokenManager tests.

### 5.1 [src/utils/apiClient.js](src/utils/apiClient.js)
- `api.get / post / patch / put / delete` — JSON bodies, always returns parsed body or throws `ApiError`.
- `api.upload(path, FormData, opts?)` — multipart; optional `opts.signal` for caller-supplied AbortSignal.
- Both forms auto-attach `Authorization: Bearer <idToken>` via `tokenManager.getIdToken()`.
- On 401 (non-public): one-shot `refreshIdToken()` then retry. Second 401 → clear tokens + fire `authChangeCb(null)`.
- Every request is wrapped in `fetchWithTimeout` (default 30s, uploads 2 min). A stalled request becomes `Error("request_timeout")`, not an infinite spinner.

### 5.2 [src/utils/tokenManager.js](src/utils/tokenManager.js)
- `storeTokens` — writes `idToken`, `refreshToken`, `expiresAt`, `uid` to localStorage and memory cache.
- `getIdToken` — proactively refreshes when within `REFRESH_LEAD_MS` of expiry.
- `refreshIdToken` — calls `POST /auth/refresh`; deduplicates concurrent refreshes via `inflightRefresh`.
- `clearTokens` — wipes both layers + cancels pending refresh timer; fires registered `onAuthClearedCb` so apiClient can route to login.

### 5.3 [src/utils/poller.js](src/utils/poller.js)
- `createPoller(fetchFn, callback, { intervalMs })` — replaces Firebase `onValue`/`onSnapshot`.
- Fires once immediately, then every `intervalMs`. Returns `unsubscribe()`.
- On `ApiError` 401 → callback `(null)` and stop polling (lets the hook layer route to login).
- Other errors are logged and the next tick retries.

---

## 6. Auth + Routing in 10 Lines

1. User submits LoginScreen → `handleLogin` in [usePortalState.js:378](src/hooks/usePortalState.js#L378).
2. `signIn(u, p)` posts `/api/auth/login`, gets `{idToken, refreshToken, uid, role, username, ...}`, stores them.
3. `handleLogin` applies the session locally (`setAuthUser`, `setAuthReady`, bump `authKey`) and `navigate("/portal/{role}/…")`.
4. `PortalRouter` ([Portal.jsx](src/pages/portal/Portal.jsx)) sees `authed = true` and matches the role route.
5. `RoleGuard` checks `userType` matches the route's role; mismatch → redirect to defaultPath.
6. The `authKey` bump re-runs the `subscribeAuth` effect, which starts a new poller hitting `/auth/me` every 30s.
7. `/auth/me` returns the current claims; role/assignment changes propagate without a re-login.
8. On logout, `doLogout` calls `signOutNow` (which POSTs `/auth/logout` + clears tokens) and bumps `authKey` again → poller stops, `authUser = null`.
9. Any 401 from any request fires `authChangeCb(null)` via tokenManager, dropping the user to login.
10. The `AuthLoadingScreen` covers the brief window between mount and the first `subscribeAuth` callback so the user doesn't see a login flash on reload.

---

## 7. Security Model (unchanged)

Three layers, all enforced server-side:

| Layer | Where | Mechanism |
|---|---|---|
| Express middleware | [functions/src/api/middleware/auth.ts](functions/src/api/middleware/auth.ts) | `requireAuth` verifies the Bearer token; `requireAdmin` checks `claims.role === "admin"` |
| RTDB rules | [database.rules.json](database.rules.json) | `auth.token.role === 'admin'`, ownership, schema validators |
| Storage rules | [storage.rules](storage.rules) | Proof photos require `assignedGrooms[groomUid] === true` claim |

JWT custom claims: `{ role, username }` on every user. Drivers also carry
`assignedGrooms: { [groomUid]: true }`. The `/api/assignments/*` route is
the only place that mutates `assignedGrooms`.

Rate limiting: in-memory per-IP / per-admin sliding window in
[functions/src/rateLimit.ts](functions/src/rateLimit.ts). Login is 10/hr per
IP; admin mutations 30/hr per admin; OTP send 5/hr per IP.

---

## 8. RTDB / Firestore / Storage Layout

```
RTDB:
  /users/{uid}                            — portal user profile
  /usernameIndex/{username}               — uid
  /phoneIndex/{normalizedPhone}           — uid
  /groomProfiles/{uid}                    — { username, displayName }
  /guestsByGroom/{groomUid}/{guestId}     — handwritten guest records
  /confirmations/{confId}                 — confirmation submissions
  /inviteTokens/{token}                   — per-guest invite tokens
  /liveLocationsByGroom/{groomUid}/{driverUid} — live GPS
  /driverAssignments/{driverUid}          — { [groomUid]: true }
  /adminSettings                          — { messageBody, formLink, mode, digitalBaseUrl, digitalMessage }
  /audit/{eventId}                        — admin action audit log

Firestore (digital invitations):
  digitalInvitations/{groomUid}                              — invitation doc (media[], settings)
  digitalInvitations/{groomUid}/guests/{guestId}             — RSVP list
  digitalInvitations/{groomUid}/photographerFiles/{fileId}   — photo metadata
  digitalInvitations/{groomUid}/designRequests/{reqId}       — design workflow

Storage:
  proofs/{groomUid}/{guestId}/{ts}.jpg     — delivery proof photos
  digitalMedia/{groomUid}/m_{ts}.{ext}     — invite background media
  photographerFiles/{groomUid}/{ts}.{ext}  — wedding photos for guests
  designMockups/{groomUid}/{reqId}/...     — admin mockups
```

---

## 9. Running the Project

```bash
# Frontend dev server pointing at the deployed /api function
npm run dev

# Frontend dev server + local emulators (Auth/DB/Firestore/Storage/Functions)
npm run dev:full

# Build frontend
npm run build

# Build Cloud Functions
cd functions && npm run build

# Unit tests (no emulator needed)
npm run test:unit

# Integration tests (requires Java 21 for the emulator)
npm test

# Deploy everything
firebase deploy --project dawa-aa793

# Deploy only the API + frontend (most common after a fix)
firebase deploy --only functions:api,hosting --project dawa-aa793
```

Required env vars: see [.env](.env) (client) and [functions/.env](functions/.env) (server).
`WEB_API_KEY` is the only server-only secret; it must be set in the
deployed function or `/api/auth/*` returns `500 server_misconfigured`.

---

## 10. Common gotchas

- **Polling intervals**: defined in [src/config/index.js](src/config/index.js) under `POLL_MS`. Bumping these reduces load but increases UI lag.
- **/auth/me does not block login**: `handleLogin` applies the session locally and only later does the poller confirm it. So if `/auth/me` returns stale claims for one poll cycle, the UI is still consistent because login wrote them directly.
- **`role: null` after login**: the backend returns `null` if the RTDB `/users/{uid}` profile is missing. The frontend treats `null` as groom (the default `defaultPath`), then `RoleGuard` rejects → redirect loop. Fix: seed the profile via `POST /api/users` (admin only).
- **CSP** ([firebase.json](firebase.json)): `connect-src` must include `*.cloudfunctions.net`. Adding new external HTTPS dependencies requires updating the CSP header.
- **Cold start**: the `api` function can take up to ~5s on the first request after idle. apiClient times out at 30s, so cold starts succeed.
- **`firebase deploy` predeploy hook**: [scripts/build-functions.cjs](scripts/build-functions.cjs) wipes `functions/lib/` + `functions/tsconfig.tsbuildinfo` on every run to avoid stale-export prompts.
