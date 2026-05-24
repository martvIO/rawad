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

Open the hosted URL and run through the critical paths manually (or via Playwright — see next section):

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

## End-to-End Testing with Playwright

### Install Playwright

```bash
npm install --save-dev @playwright/test
npx playwright install          # download browsers (Chromium, Firefox, WebKit)
```

### Configuration

Create `playwright.config.ts` at the project root:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    video: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
});
```

Add scripts to `package.json`:

```json
{
  "scripts": {
    "test:e2e":        "playwright test",
    "test:e2e:ui":     "playwright test --ui",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:report": "playwright show-report"
  }
}
```

### Writing tests

Place test files in `e2e/`. Convention: one file per role or feature area.

**`e2e/landing.spec.ts` — public pages**

```typescript
import { test, expect } from '@playwright/test';

test('landing page loads and shows correct title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/دعوة|Dawa/i);
});

test('confirmation form renders for valid groom username', async ({ page }) => {
  await page.goto('/confirm/test-groom');
  await expect(page.getByRole('form')).toBeVisible();
});
```

**`e2e/auth.spec.ts` — login flow**

```typescript
import { test, expect } from '@playwright/test';

test('admin can log in and reach admin portal', async ({ page }) => {
  await page.goto('/portal/login');
  await page.getByLabel(/username|phone/i).fill(process.env.TEST_ADMIN_USER!);
  await page.getByLabel(/password/i).fill(process.env.TEST_ADMIN_PASS!);
  await page.getByRole('button', { name: /login|sign in/i }).click();
  await expect(page).toHaveURL(/\/portal\/admin/);
});

test('wrong password shows error message', async ({ page }) => {
  await page.goto('/portal/login');
  await page.getByLabel(/username|phone/i).fill('nobody');
  await page.getByLabel(/password/i).fill('wrong');
  await page.getByRole('button', { name: /login|sign in/i }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});
```

**`e2e/groom.spec.ts` — groom portal**

```typescript
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';

test('groom can view guest list', async ({ page }) => {
  await loginAs(page, 'groom');
  await expect(page.getByTestId('guest-list')).toBeVisible();
});

test('groom can generate invite link for a guest', async ({ page }) => {
  await loginAs(page, 'groom');
  await page.getByTestId('guest-row').first().getByRole('button', { name: /invite/i }).click();
  await expect(page.getByTestId('invite-link')).toContainText('/invite/');
});
```

**`e2e/helpers.ts` — shared utilities**

```typescript
import { Page } from '@playwright/test';

export async function loginAs(page: Page, role: 'admin' | 'groom' | 'driver') {
  const creds = {
    admin:  { user: process.env.TEST_ADMIN_USER!,  pass: process.env.TEST_ADMIN_PASS!  },
    groom:  { user: process.env.TEST_GROOM_USER!,  pass: process.env.TEST_GROOM_PASS!  },
    driver: { user: process.env.TEST_DRIVER_USER!, pass: process.env.TEST_DRIVER_PASS! },
  };
  await page.goto('/portal/login');
  await page.getByLabel(/username|phone/i).fill(creds[role].user);
  await page.getByLabel(/password/i).fill(creds[role].pass);
  await page.getByRole('button', { name: /login|sign in/i }).click();
}
```

Store test credentials in a `.env.test` file (never commit this file):

```bash
TEST_ADMIN_USER=admin-test
TEST_ADMIN_PASS=...
TEST_GROOM_USER=groom-test
TEST_GROOM_PASS=...
TEST_DRIVER_USER=driver-test
TEST_DRIVER_PASS=...
```

### Running tests

```bash
# Against local dev server (start it first with npm run dev:emulator)
npm run test:e2e

# Against the deployed production URL
PLAYWRIGHT_BASE_URL=https://dawa-aa793.web.app npm run test:e2e

# Open the interactive UI runner
npm run test:e2e:ui

# View the last HTML report
npm run test:e2e:report
```

### CI integration (GitHub Actions example)

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  playwright:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
        env:
          PLAYWRIGHT_BASE_URL: ${{ secrets.STAGING_URL }}
          TEST_ADMIN_USER: ${{ secrets.TEST_ADMIN_USER }}
          TEST_ADMIN_PASS: ${{ secrets.TEST_ADMIN_PASS }}
          TEST_GROOM_USER: ${{ secrets.TEST_GROOM_USER }}
          TEST_GROOM_PASS: ${{ secrets.TEST_GROOM_PASS }}
          TEST_DRIVER_USER: ${{ secrets.TEST_DRIVER_USER }}
          TEST_DRIVER_PASS: ${{ secrets.TEST_DRIVER_PASS }}
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

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

e2e/                  Playwright end-to-end tests
  helpers.ts          Shared login utilities
  landing.spec.ts     Public page tests
  auth.spec.ts        Login / auth-guard tests
  groom.spec.ts       Groom portal tests
  driver.spec.ts      Driver portal tests
  admin.spec.ts       Admin portal tests
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