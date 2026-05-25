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

## Git Workflow — Commit Every Step

Commit early and often. Each meaningful unit of work (feature, fix, config change) should be its own commit so history stays readable and rollbacks are surgical.

### Initial setup

```bash
git init                          # if not already a git repo
git remote add origin <repo-url>  # link to GitHub
git branch -M main
```

### Recommended commit cadence

```bash
# 1. Stage only what belongs in this commit
git add <file-or-folder>

# 2. Write a short, imperative subject line (≤72 chars)
git commit -m "feat: add driver GPS live-share endpoint"

# 3. Push to the remote branch
git push origin main              # or your feature branch
```

### Suggested commit message prefixes

| Prefix | When to use |
|---|---|
| `feat:` | New feature or page |
| `fix:` | Bug fix |
| `chore:` | Dependency updates, tooling, config |
| `refactor:` | Code restructure without behavior change |
| `test:` | Adding or updating tests |
| `docs:` | README or comment changes |
| `deploy:` | Firebase config, rules, or deploy-only changes |

### Typical step-by-step example

```bash
# After installing deps
git add package.json package-lock.json
git commit -m "chore: install project dependencies"

# After writing a new service
git add src/services/inviteService.js
git commit -m "feat: add inviteService with CRUD methods"

# After updating Firestore rules
git add firestore.rules
git commit -m "deploy: tighten Firestore rules for driver role"

# After all tests pass
git add .
git commit -m "test: add unit tests for matchUtils fuzzy matching"

git push origin main
```

### Branching strategy (recommended)

```bash
git checkout -b feature/<short-name>   # work on a branch
# ... commits ...
git push origin feature/<short-name>
# open a Pull Request on GitHub, review, then merge to main
```

---

## Deploy to Firebase & Smoke-Test

### 1. Authenticate and select project

```bash
firebase login
firebase use dawa-aa793
```

### 2. Build everything

```bash
npm run build
cd functions && npm run build && cd ..
```

### 3. Run pre-deploy tests

```bash
npm run test:unit          # fast — no emulators needed
npm test                   # integration tests against emulator
```

Only proceed to deploy if all tests pass.

### 4. Deploy

```bash
# Full deploy (hosting + functions + rules)
firebase deploy --project dawa-aa793

# Or deploy targets individually to limit blast radius
firebase deploy --only hosting   --project dawa-aa793
firebase deploy --only functions --project dawa-aa793
firebase deploy --only firestore,database,storage --project dawa-aa793
```

### 5. Commit the deploy

```bash
git add .
git commit -m "deploy: release vX.Y.Z to production"
git push origin main
```

### 6. Smoke-test after deploy

Use the Playwright MCP to verify critical paths (the MCP server is configured in `.claude/settings.local.json`). Ask Claude to navigate to the hosted URL and walk through:

| Path | What to verify |
|---|---|
| `/` | Landing page loads, RTL layout correct |
| `/portal/login` | Login with each role (admin / groom / driver) |
| `/portal/admin/*` | User list loads, bulk-WhatsApp button visible |
| `/portal/groom/*` | Guest list loads, invite link generation works |
| `/portal/driver/*` | Route list loads, photo-upload flow works |
| `/confirm/:groomUsername` | Public confirmation form renders |
| `/invite/:token` | Invite form renders with correct guest data |

### 7. Monitor logs

```bash
firebase functions:log --project dawa-aa793
```

Check for unhandled errors or unexpected `permission-denied` exceptions right after deploy.

---

## Browser Testing with Playwright MCP

The Playwright MCP server is configured in `.claude/settings.local.json` and runs at `http://localhost:8931/mcp`. Claude uses it directly to control a browser — no test files or `playwright test` CLI needed.

### How to use

Start the dev server first (`npm run dev:emulator` or `npm run dev`), then ask Claude to verify a flow. Claude will use MCP browser tools to navigate, click, fill forms, and take screenshots in real time.

### Critical paths to verify

| Path | What to verify |
|---|---|
| `/` | Landing page loads, RTL layout correct |
| `/portal/login` | Login with each role (admin / groom / driver) |
| `/portal/admin/*` | User list loads, bulk-WhatsApp button visible |
| `/portal/groom/*` | Guest list loads, invite link generation works |
| `/portal/driver/*` | Route list loads, photo-upload flow works |
| `/confirm/:groomUsername` | Public confirmation form renders |
| `/invite/:token` | Invite form renders with correct guest data |

### Example prompts for Claude

```
# Verify login works
"Use the Playwright MCP to navigate to http://localhost:5173/portal/login, log in as admin, and confirm we land on /portal/admin"

# Smoke-test after deploy
"Use the Playwright MCP to smoke-test https://dawa-aa793.web.app — check the landing page, login page, and confirm RTL layout is correct"

# Verify a specific fix
"Use the Playwright MCP to verify the proof photo upload flow works for a driver in the emulator environment"
```

### When to use

- After any UI change — verify the feature works in the real browser before closing the task
- Post-deploy smoke tests — navigate the hosted URL and check critical paths
- Debugging visual or layout issues — take a screenshot to see what the browser actually renders

### MCP server setup

The server is pre-configured. If it is not running, start it separately before asking Claude to use it. The MCP URL is `http://localhost:8931/mcp`.

---

## Environment variables

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

e2e/                  (optional) Playwright spec files for CI — primary browser testing via Playwright MCP
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