# دعوة (Dawa)

Wedding-invitation management and distribution platform for the Arab/Israeli market.

Grooms manage a guest list. Drivers deliver physical invitations and upload proof photos. An admin oversees all users and operations. Guests can also receive personalized digital invitation links via WhatsApp.

---

## Roles

| Role | Primary tasks |
|---|---|
| **Admin** | Manage all users, monitor confirmations, send WhatsApp bulk messages, edit settings |
| **Groom** | Manage guest list, track delivery proofs, send per-guest invite links |
| **Driver** | Receive delivery route, upload proof photos, share live GPS |

---

## Run locally

### Prerequisites

- Node.js 20+
- Java 21 (required for Firebase emulators)
- Firebase CLI (`npm install -g firebase-tools`)

### Install

```bash
npm install
cd functions && npm install && cd ..
```

### Start with emulators (recommended)

```bash
# Build functions + start all emulators + start Vite dev server in one command:
npm run dev:full

# Or start them separately:
npm run emulators:build   # build functions + start emulators
npm run dev:emulator      # start Vite pointed at emulator API
```

### Start without emulators (uses production Firebase)

```bash
npm run dev
```

### Seed emulator data

```bash
npm run emulators:seed
```

---

## Build & Deploy

```bash
# Build frontend
npm run build

# Build Cloud Functions
cd functions && npm run build

# Deploy everything
firebase deploy --project dawa-aa793

# Deploy individual targets
firebase deploy --only hosting --project dawa-aa793
firebase deploy --only functions --project dawa-aa793
firebase deploy --only database,storage,firestore --project dawa-aa793
```

---

## Tests

```bash
# Unit tests (no emulators needed)
npm run test:unit

# Integration tests (Firebase Database emulator required)
npm test

# Unit tests in watch mode
npm run test:unit:watch

# Coverage report
npm run test:coverage
```

---

## Environment variables

> **Full configuration reference** — every env var, admin setting, code constant, and infra file, with where each is read and set: [CONFIGURATION.md](CONFIGURATION.md). The table below is a quick subset.

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | Dev only | REST API base URL. In prod, same-origin `/api` via Firebase Hosting rewrite. |
| `VITE_INVITE_BASE_URL` | Optional | Base URL for per-guest invite links. |
| `VITE_RECAPTCHA_V2_SITE_KEY` | For OTP | reCAPTCHA v2 site key for phone-OTP password reset. |
| `VITE_USE_EMULATORS` | Dev | Set `1` to connect Firebase SDK to emulators. |
| `WEB_API_KEY` | Cloud Functions | Firebase Web API key. Set in Functions environment, never in `VITE_*`. |
| `ALLOWED_ORIGINS` | Cloud Functions | Comma-separated CORS allowed origins. Empty = allow all (dev-friendly). |

Set `VITE_*` vars in `.env` (local) or `.env.production` (prod build). Set `WEB_API_KEY` via `firebase functions:config:set` or Google Cloud Secret Manager.

---

## Project structure

```
src/
  config/           Centralized env vars and constants (POLL_MS, TIMING, GEO, etc.)
  constants/        Role constants, storage key constants, match status constants
  utils/
    tokenManager.js Token lifecycle (localStorage-backed, no Firebase SDK)
    apiClient.js    fetch() wrapper with Bearer auth + 401-retry
    poller.js       Polling helper replacing RTDB onValue subscriptions
    matchUtils.js   Fuzzy phone/name/address matching for admin confirmations
    geo.js          Coordinate parsing, Waze/Maps deep links
    phone.js        E.164 formatting, validation
    validation.js   Name validation
    password.js     Password strength rules
    storage.js      localStorage wrappers
    logger.js       Tagged console wrapper (silent in prod)
  services/         One file per resource — all use apiClient.js
  hooks/
    usePortalState.js   Single source of truth for portal state + auth
    useGeolocation.js   GPS watch + publish/subscribe
    useLeaflet.js       Lazy Leaflet CDN injection
  context/
    PortalContext.jsx   Single hook run once; exposes state to all portal views
  pages/
    LandingPage.jsx
    ConfirmationForm.jsx
    InviteForm.jsx
    DigitalInviteForm.jsx
    DigitalInvitationPage.jsx   Public digital invitation page
    portal/                     Auth-gated portal (login + role views)
  components/         Reusable UI: modals, maps, address fields, Toast, Skeleton, …
  styles/             theme.js (palette tokens C/ROLE/S) + GlobalStyle.jsx
  i18n/               Arabic + Hebrew strings + makeT() factory
  data/               status.js, cities.js, inviteContent.js

functions/src/
  api/               Express app — 10 REST resource routers
  index.ts           Cloud Function exports (api + legacy callables)
  helpers.ts         assertAdmin, validators, phone utils
  *.ts               Legacy callable Cloud Functions (users, invites, confirmations, …)
```

---

## Routes

| Path | Component | Auth |
|---|---|---|
| `/` | LandingPage | Public |
| `/confirm/:groomUsername` | ConfirmationForm | Public |
| `/invite/:token` | InviteForm | Public |
| `/invite/digital/:token` | DigitalInviteForm | Public |
| `/d/:groomUsername/:token/*` | DigitalInvitationPage | Public |
| `/portal/login` | LoginScreen | Public |
| `/portal/logout` | LogoutPage | Authenticated |
| `/portal/admin/*` | AdminPortal | Admin only |
| `/portal/driver/*` | DriverPortal | Driver only |
| `/portal/groom/*` | GroomPortalView | Groom only |

---

## Security model

Three enforced layers:

1. **Cloud Functions** — `assertAdmin()` in `helpers.ts` throws `permission-denied` before any privileged logic
2. **RTDB rules** — `database.rules.json` checks `auth.token.role === 'admin'`, ownership, schema `.validate`
3. **Storage rules** — `storage.rules` gates proof photos on `assignedGrooms[groomUid] === true` claim
4. **Client UI** — `RoleGuard` prevents wrong-role rendering (convenience only — not authoritative)

JWT custom claims: `{ role: "admin"|"driver"|"groom", username }`. Drivers also carry `assignedGrooms: { [groomUid]: true }`.
