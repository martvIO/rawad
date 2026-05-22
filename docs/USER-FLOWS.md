# Dawa — User Flows & System Interaction Map

> Authoritative map of every user-facing flow and the REST calls each one
> makes. Read this before making changes that touch auth, routing, or any
> CRUD endpoint. For the codebase reference see [/CLAUDE.md](../CLAUDE.md).

The frontend never talks to Firebase directly. Every interaction is:

```
React component → service file → apiClient → fetch → Express route (/api/*)
                                      ↑
                                  tokenManager attaches Bearer + handles 401
```

---

## 1. Guest / unauthenticated state

The site has four entry points that do **not** require authentication:

| URL | Component | Backend calls |
|---|---|---|
| `/` | [LandingPage.jsx](../src/pages/LandingPage.jsx) | None (static marketing page) |
| `/confirm/:groomUsername` | [ConfirmationForm.jsx](../src/pages/ConfirmationForm.jsx) | `POST /api/confirmations` (`skipAuth`) |
| `/invite/:token` | [InviteForm.jsx](../src/pages/InviteForm.jsx) | `GET /api/invites/:token` (poll), `POST /api/invites/:token/submit` |
| `/d/:groomUsername/:token/*` | [DigitalInvitationPage.jsx](../src/pages/DigitalInvitationPage.jsx) | `GET /api/digital/:uid/public` (`skipAuth`) |

Rules:
- These pages never store tokens; `apiClient` is called with `{ skipAuth: true }`.
- The Express routes themselves are public but rate-limited per IP.
- `apiClient` does not attach an `Authorization` header for `skipAuth` calls — a missing/expired session is not surfaced as an error.

Edge cases:
- If the visitor *also* has a logged-in session in another tab, that session is untouched: these public flows do not read or clear tokens.
- Returning to `/portal/*` from a public flow goes through the same auth gate as a cold load.

---

## 2. Registration & Login

### Registration

**No public self-registration.** Only an admin can create accounts.

```
Admin in browser
  → AdminUserManager.jsx "Create user" form
  → usePortalState.addUser
  → createPortalUser (services/users.js)
  → POST /api/users { username, password, role, phoneE164?, displayName? }
  → Backend: helpers.assertAdmin, validate uniqueness, mint custom claims,
    write /users/{uid} + indices, audit log
  → 200 { uid, ... } returned to client
  → Client optimistically inserts into adminUsers list
  → Next /api/users poll (15s) returns the live row; optimistic ghost is dropped
```

If the role is `groom`, the client also writes `/groomProfiles/{uid}` via `PUT /api/users/groom-profiles/{uid}` so the new account is immediately pickable by drivers.

### Login

```
User on LoginScreen
  → handleLogin (usePortalState.js:378)
  → setLoginLoading(true)
  → signIn(username, password) (services/auth.js)
  → POST /api/auth/login { username, password } (skipAuth)
  → Backend proxies to Firebase Identity Toolkit (:signInWithPassword)
  → Backend reads /users/{uid} from RTDB to enrich the response
  → Returns { idToken, refreshToken, expiresIn, uid, role, username, displayName, phoneE164 }
  → tokenManager.storeTokens(...)  -- writes to localStorage + memory cache
  → setAuthUser(user), setAuthReady(true), setAuthKey(k+1)
  → navigate("/portal/{role}/...")
  → setLoginLoading(false) (in finally — always runs)
```

Then:
- `authKey` bump re-runs the `subscribeAuth` effect.
- New `subscribeAuth` creates a poller that hits `GET /api/auth/me` every 30s for live claim refresh.
- `PortalRouter` sees `authed === true`, matches the role route, renders the role's portal.

### Login error states (what the user actually sees)

| Backend response | Frontend behavior |
|---|---|
| `401 invalid_credentials` | Generic `login_error` toast; spinner clears. |
| `400 missing_fields` | Same — the form should have prevented this, but apiClient throws and we show login_error. |
| `429 too_many_requests` | apiClient throws `ApiError` with body; UI shows generic error. (Future: surface rate-limit explicitly.) |
| Network down / fetch rejects | `Error("network_error")` thrown; UI shows login_error. |
| **Timeout (>30s)** | `Error("request_timeout")` thrown — *added in the 2026-05-22 audit so a cold-start or genuinely stalled network can't strand the spinner forever*. |
| `500 server_misconfigured` | Backend `WEB_API_KEY` missing — site needs a redeploy. |

---

## 3. Post-login routing & dashboard behavior

[PortalRouter](../src/pages/portal/Portal.jsx) makes a four-way decision on every render:

```
                ┌─ !authReady ──────────────────────────────▶ <AuthLoadingScreen />
                │
                ├─ !authed ─────────────────────────────────▶ <Routes> only /portal/login
                │                                               (everything else redirects to login)
                │
authState  ─────┤
                │                                             ┌─ admin/*  → AdminPortal  (RoleGuard)
                │                                             ├─ driver/* → DriverPortal (RoleGuard)
                └─ authed + role ──▶ <Routes> nested:        ├─ groom/*  → GroomPortalView (RoleGuard)
                                                              ├─ logout  → LogoutPage
                                                              └─ *       → redirect to defaultPath
```

`defaultPath` is computed from `userType`:
- admin → `/portal/admin/users`
- driver → `/portal/driver/pending`
- groom → `/portal/groom`

### Admin dashboard ([AdminPortal](../src/pages/portal/admin/AdminPortal.jsx))

Tabs (URL-driven via NavLink + nested `<Routes>`):
- **Users** (`/portal/admin/users`) — `GET /api/users` (poll 15s), CRUD via `POST/PUT/PATCH/DELETE /api/users[/:uid]`.
- **Send** (`/portal/admin/send`) — `GET /api/users/groom-profiles`, `GET /api/guests/by-groom/:uid` (for selected groom), `POST /api/invites/:guestId/token` for per-guest links.
- **Confirmations** (`/portal/admin/confirmations`) — `GET /api/confirmations` (poll 15s), `PATCH /api/confirmations/:id`.
- **Designs** (`/portal/admin/designs`) — `GET /api/digital/design-requests` (admin global view), `PATCH /api/digital/:uid/design-requests/:reqId`, multipart `POST .../mockup`.
- **Settings** (`/portal/admin/settings`) — `GET /api/settings` (poll 30s), `PATCH /api/settings`.

### Driver dashboard ([DriverPortal](../src/pages/portal/driver/DriverPortal.jsx))

Drivers must first pick a groom (`POST /api/assignments/driver/:groomUsername`).
That call stamps `assignedGrooms[groomUid] = true` into the driver's JWT
custom claim — required by `storage.rules` for proof-photo upload.

Tabs:
- **Pending** — `GET /api/guests/by-groom/:assignedGroomUid` (poll 15s).
- **Map** — same source.
- **ShareLocation** — POSTs GPS fixes via `POST /api/live-locations/publish` every 1s while sharing.
- **SharedCities** — aggregates `/api/guests/by-groom/:uid` across all assigned grooms.

### Groom dashboard ([GroomPortalView](../src/pages/portal/groom/GroomPortalView.jsx))

First-time grooms see a "choose handwritten or digital" picker
([GroomTypeSelect](../src/pages/portal/groom/GroomTypeSelect.jsx)); the
choice is persisted to `localStorage` and remembered on next login.

Handwritten path: `Dashboard / Guests / Add / Map / Live / Proofs`. Each
subscribes to `GET /api/guests/by-groom/:uid` directly or via the central
`PortalContext`.

Digital path: separate Firestore-backed flow. `Dashboard / Guests / Add /
Photographer / Designs`. All endpoints under `/api/digital/:uid/...`.

---

## 4. CRUD operations & their DB calls

The complete REST surface, organized by resource. Every authed call goes
through `apiClient.get/post/...` which attaches the Bearer token.

### Users (admin only)

| UI | Service call | REST |
|---|---|---|
| List users (admin tab) | `subscribeUsers(cb)` | `GET /api/users` (poll 15s) |
| List groom profiles (drivers, send tab) | `subscribeGroomProfiles(cb)` | `GET /api/users/groom-profiles` (poll 15s) |
| Create user | `createPortalUser(input)` | `POST /api/users` |
| Edit user (username/phone/role) | `updatePortalUser(input)` | `PUT /api/users/:uid` |
| Edit displayName only | `patchUserInRTDB(uid, patch)` | `PATCH /api/users/:uid` |
| Set password | `adminSetPassword(uid, pw)` | `PUT /api/users/:uid/password` |
| Delete user | `deletePortalUser(uid)` | `DELETE /api/users/:uid` |
| Promote/demote admin | `setAdminClaim(uid, isAdmin)` | `POST /api/users/:uid/admin-claim` |
| Upsert groom profile mirror | `upsertGroomProfile(uid, data)` | `PUT /api/users/groom-profiles/:uid` |
| Remove groom profile mirror | `removeGroomProfile(uid)` | `DELETE /api/users/groom-profiles/:uid` |

### Guests (handwritten)

| UI | Service call | REST |
|---|---|---|
| Subscribe (admin: all groups) | `subscribeAllGuests(cb)` | `GET /api/guests` (poll 15s) |
| Subscribe (groom/driver: one groom) | `subscribeGuestsForGroom(uid, cb)` | `GET /api/guests/by-groom/:uid` (poll 15s) |
| Add | `addGuest(groomUid, guest)` | `POST /api/guests/by-groom/:uid` |
| Edit | `updateGuest(groomUid, id, patch)` | `PATCH /api/guests/by-groom/:uid/:id` |
| Delete | `removeGuest(groomUid, id)` | `DELETE /api/guests/by-groom/:uid/:id` |

### Confirmations

| UI | Service call | REST |
|---|---|---|
| Public submit | `submitConfirmation(payload)` | `POST /api/confirmations` (`skipAuth`, rate-limited) |
| Admin list | `subscribeConfirmations(cb)` | `GET /api/confirmations` (poll 15s) |
| Admin edit | `updateConfirmation(id, patch)` | `PATCH /api/confirmations/:id` |
| Attach to guest | `attachConfirmationLocationToGuest({...})` | `POST /api/confirmations/:id/attach-to-guest` |

### Digital invitation (Firestore-backed)

| UI | Service call | REST |
|---|---|---|
| Subscribe guests | `subscribeDigitalGuests(uid, cb)` | `GET /api/digital/:uid/guests` (poll 15s) |
| Add guest | `addDigitalGuest(uid, {...})` | `POST /api/digital/:uid/guests` |
| Edit/delete guest | `updateDigitalGuest / removeDigitalGuest` | `PATCH / DELETE /api/digital/:uid/guests/:id` |
| Subscribe media doc | `subscribeDigitalMedia(uid, cb)` | `GET /api/digital/:uid/media` (poll 15s) |
| Upload media | `addInvitationMedia(uid, file, opts?)` | `POST /api/digital/:uid/media/upload` (multipart, accepts `{signal}`) |
| Patch settings (date, ranks, ...) | `setWeddingDate / setGuestRanks / ...` | `PATCH /api/digital/:uid/media/settings` |
| Subscribe photographer files | `subscribePhotographerFiles(uid, cb)` | `GET /api/digital/:uid/photographer` (poll 15s) |
| Upload photographer file | `uploadPhotographerFile(uid, file, opts?)` | `POST /api/digital/:uid/photographer/upload` (multipart) |
| Public read (guest view) | `getDigitalInvitationPublic(uid)` | `GET /api/digital/:uid/public` (`skipAuth`) |

### Invites (per-guest tokens)

| UI | Service call | REST |
|---|---|---|
| Mint handwritten invite link | `createGuestInvite({groomUid, guestId})` | `POST /api/invites` |
| Mint digital invite link | `createDigitalGuestInvite({groomUid, guestId})` | `POST /api/invites/digital` |
| Subscribe one token | `subscribeInviteToken(token, cb)` | `GET /api/invites/:token` (poll 3s — `POLL_MS.INVITES`) |
| Guest submit | `submitGuestInvite(payload)` | `POST /api/invites/:token/submit` (`skipAuth`) |

### Proofs

| UI | Service call | REST |
|---|---|---|
| Upload delivery proof | `uploadProofBlob(groomUid, guestId, blob)` | `POST /api/proofs/:groomUid/:guestId/upload` (multipart) |
| Resolve signed download URL | `proofDownloadUrl(path)` | `GET /api/proofs/url?path=...` |

### Live locations

| UI | Service call | REST |
|---|---|---|
| Driver publish fix | `publishMyFix(driverUid, name, fix, shareWith)` | `POST /api/live-locations/publish` (every 1s while sharing) |
| Driver clear | `clearMyLocation(driverUid, shareWith)` | `POST /api/live-locations/clear` |
| Groom subscribe to drivers | `subscribeDriversForGroom(groomUid, cb)` | `GET /api/live-locations/by-groom/:uid` (poll or SSE) |

### Assignments + Settings

| UI | Service call | REST |
|---|---|---|
| Driver picks groom | `assignDriverToGroom(groomUsername)` | `POST /api/assignments/driver/:groomUsername` |
| Driver assignment subscription | `subscribeAssignmentsFor(driverUid, cb)` | `GET /api/assignments/by-driver/:uid` (poll 30s) |
| Admin settings subscribe | `subscribeSettings(cb)` | `GET /api/settings` (poll 30s) |
| Admin settings save | `saveSettings(patch)` | `PATCH /api/settings` |

---

## 5. Logout & session expiry

### Explicit logout

```
User clicks 🚪 in role portal header
  → setLogoutAsking(true) → LogoutConfirm modal
  → confirm → doLogout (usePortalState.js:404)
  → signOutNow (services/auth.js)
  → POST /api/auth/logout (best-effort; failures ignored)
  → tokenManager.clearTokens()  — wipes localStorage + cancels refresh timer
  → Clears local UI state (login form, driverServingGroom, shared-cities state)
  → setAuthUser(null), bump authKey
  → navigate("/", { replace: true }) — back to landing
```

The `authKey` bump triggers the `subscribeAuth` effect to re-evaluate.
`subscribeAuth` calls `loadStoredTokens()` → `getStoredUid()` returns
`null` → fires `cb(null)` synchronously. PortalRouter falls into the
`!authed` branch on the next render.

### Idle session expiry

The Firebase ID token has a 1-hour lifetime. tokenManager schedules a
proactive refresh via `setTimeout(scheduleRefresh, expiresAt - REFRESH_LEAD_MS)`:

```
At ~55 minutes in:
  → refreshIdToken()
  → POST /api/auth/refresh { refreshToken }
  → Updates idToken/expiresAt in localStorage + memory
  → Re-arms the timer for the next refresh
```

If the refresh succeeds, the user notices nothing. If it fails (refresh
token revoked/expired/network down):

```
  → clearTokens() fires
  → onAuthClearedCb fires (registered by apiClient)
  → apiClient.authChangeCb fires
  → usePortalState's setAuthChangeCallback fires
  → setAuthUser(null), setAuthReady(true)
  → PortalRouter renders the unauthed branch
  → URL was probably an authed page; auto-redirected to /portal/login
```

### 401 from any non-public call

```
apiClient.request sees 401
  → handleUnauthorized
  → refreshIdToken (one-shot)
  ├─ success → retry the original request with the new token
  │            → still 401? clearTokens + authChangeCb(null); throw "session_expired"
  └─ failure → clearTokens + authChangeCb(null); throw "session_expired"
```

The component receives a normal exception, can show "session expired" if
it wants, and PortalRouter has already routed the user to login by the
time the catch handler runs.

---

## 6. Error states (matrix)

| Trigger | What apiClient throws | What the user sees |
|---|---|---|
| HTTP 4xx (with JSON body) | `ApiError(status, body, "api_<error>")` | Component-specific toast (often the error code) |
| HTTP 5xx | `ApiError(status, body, "api_<error>")` | Same |
| 401 (non-public) after refresh attempt | `ApiError(401, null, "session_expired")` | Routed to login (via `authChangeCb`) |
| 401 on public call (`skipAuth`) | `ApiError(401, body, "api_401")` | Generic toast (rare; usually means the public endpoint requires a token it shouldn't) |
| Network unreachable | `Error("network_error")` | "خطأ" / "שגיאה" toast |
| **Request > 30s (default) / > 2 min (uploads)** | `Error("request_timeout")` | "انتهت مهلة الطلب — حاول مرة أخرى" / "פג זמן הבקשה — נסה שוב" toast — *added in 2026-05-22 audit* |
| `formData` not a FormData | `Error("upload: formData must be a FormData instance")` | Developer error; bubbles unmodified |
| Unmounted-component upload | `AbortError` swallowed by digital uploads | No toast — silently dropped |

### Specific UI hooks

- **Login**: catch block in `handleLogin` shows generic `login_error` regardless of cause.
- **DigitalAddGuest** ([src/pages/portal/groom/digital/DigitalAddGuest.jsx](../src/pages/portal/groom/digital/DigitalAddGuest.jsx)): branches on `request_timeout` vs generic message; gates submit on `currentUid` so the form can't fire before auth resolves.
- **DigitalDashboard / DigitalPhotographer**: branches on `request_timeout` vs generic; pending previews are always cleaned up even if the network actually stalls, because abort is propagated.

---

## 7. Component / interaction quick map

```
Public surface
├── / (LandingPage)
├── /confirm/:groomUsername          → POST /api/confirmations
├── /invite/:token                   → poll + POST /api/invites
└── /d/:groomUsername/:token/*       → GET /api/digital/:uid/public

Portal — auth gate at /portal/*
├── /portal/login                    → POST /api/auth/login
├── /portal/logout                   → POST /api/auth/logout
├── /portal/admin/*                  → role=admin only
│   ├── /users                       → users CRUD endpoints
│   ├── /send                        → guests + invites endpoints
│   ├── /confirmations               → confirmations endpoints
│   ├── /designs                     → digital design-request endpoints
│   └── /settings                    → settings endpoints
├── /portal/driver/*                 → role=driver only
│   ├── /pickGroom                   → POST /api/assignments/driver/:username
│   ├── /pending                     → GET /api/guests/by-groom/:uid (poll)
│   ├── /map                         → same source
│   ├── /share                       → POST /api/live-locations/publish (every 1s)
│   └── /shared-cities               → GET /api/guests/by-groom/:uid × N
└── /portal/groom/*                  → role=groom only
    ├── /type-select                 → localStorage only
    ├── /handwritten/*               → guests + invites + proofs endpoints
    └── /digital/*                   → digital/:uid/* endpoints
```

Background polling (always-on while authed):
- `/api/auth/me` every 30s (subscribeAuth — claim refresh).
- `/api/settings` every 30s (admin sessions only).
- `/api/confirmations` every 15s (admin sessions only).
- `/api/users` every 15s (admin sessions only).
- `/api/guests/by-groom/:uid` every 15s (groom + driver sessions).
- `/api/digital/:uid/*` every 15s (groom sessions on digital flow).

Proactive token refresh: ~5 minutes before expiry (single in-flight at a time).
