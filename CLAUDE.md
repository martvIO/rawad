# دعوة (Dawa)

Wedding-invitation management and distribution platform for the Arab/Israeli market.

Grooms manage a guest list. Drivers deliver physical invitations and upload proof photos. An admin oversees all users and operations. Guests can also receive personalized digital invitation links via WhatsApp.

---

## Working Agreement — Ask First, Never Assume

- If anything in a request is unclear or ambiguous, **ask before acting** — do not
  guess or fill gaps with assumptions.
- **Always ask for explicit confirmation before adding or editing any website
  feature, or any change to the database** (schema, RTDB/Firestore rules, or
  stored data). Describe what you intend to change and wait for a go-ahead.
- Sessions default to **plan mode** (`defaultMode: "plan"` in
  `.claude/settings.local.json`) — present the approach before implementing.

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
npm install --prefix frontend
cd backend/functions && npm install && cd ../..
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
cd backend/functions && npm run build

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
cd backend/functions && npm run build && cd ../..
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

---

## Session Workflow — Start & End

These are standing instructions for every session in this project.

### Start of session (automatic)

A `SessionStart` hook in `.claude/settings.local.json` runs `git pull --ff-only`
to bring the working tree up to date with `origin/main` before any work begins.
This is non-destructive: if the fast-forward can't apply (local commits diverged,
or uncommitted changes block it) the hook just reports the error and the session
continues on the current state — resolve it manually before relying on a clean base.

The hook also runs a best-effort **Playwright MCP availability check** and prints
a warning if the MCP server isn't launchable.

### Start of session — read the wiki-brain (Claude-driven, every session)

**At the very start of every session, before any substantive work, actively read
the wiki-brain** to load the compounding knowledge base. Do all of the following:

1. **Read** `wiki/index.md` — the catalog hub — to orient on the full wiki structure.
2. **Run `/recall`** — surfaces the last 5 activities and reads their linked wiki pages.
3. **Invoke `/wiki-brain`** — the knowledge-base status/overview.

The global `SessionStart` hook already prints the wiki index + recent `log.md`
lines into context automatically; treat that as the starting point, then actively
read/recall as above (and `graphify query "..."` before reading any raw files).

### End of session (Claude-driven checklist)

Before ending any session that changed code, run these steps **in order**. Each
gate must pass before moving to the next; if a step can't be completed, stop and
tell the user rather than skipping ahead. (Hooks can't do these — testing and
fixing need active reasoning — so they live here as instructions Claude follows.)

1. **Test every change with Playwright MCP.** Start the dev server
   (`npm run dev:emulator`, or `npm run dev` against prod Firebase), then drive
   the affected flows in the browser via the Playwright MCP
   (`http://localhost:8931/mcp`). Cover the critical paths the change touches
   (see the tables under "Deploy & Smoke-Test" and "Browser Testing"). **If
   anything is broken, fix it, rebuild, and re-test** — loop until the changed
   flows pass or you hit a genuine blocker worth surfacing to the user.
2. **Update the wiki-brain files.** Per the Wiki-Brain Session Rules below:
   update/create the relevant `wiki/` pages, refresh `wiki/index.md`, and append
   the session line to `log.md`.
3. **Commit to `main`.** Stage the *specific* changed files (never blind
   `git add -A` — the Firebase admin-SDK key lives in the repo root), write a
   conventional commit message (see the "Git Workflow" prefixes), and
   `git push origin main`.
4. **Build + deploy to Firebase (automatic on session end).** A `SessionEnd`
   hook runs `.claude/hooks/session-end.sh` when the session ends — it re-runs
   the unit-test gate, builds the frontend + functions, and deploys everything
   to `dawa-aa793`. Do **not** run it manually here as well, or you'll deploy
   twice; just ensure steps 1–3 are finished so the on-disk state it deploys is
   tested and committed. (The script never commits — step 3 owns staging, for
   the secret-safety reason above.) Smoke-test the hosted URL after the deploy.

If the session was trivial (no code change), skip steps 1, 3, and 4 — but still
append the `log.md` line per the Wiki-Brain rules.

## Context Navigation (Wiki-Brain)

You have access to a personal wiki at `C:\Users\martv\OneDrive\Documents\github\rawad`. This is the user's
compounding knowledge base. Use it as your primary context source.

When you need to understand the codebase, docs, past work, or any stored
knowledge:

1. **ALWAYS query the knowledge graph first:** `graphify query "your question"`
   (run from `C:\Users\martv\OneDrive\Documents\github\rawad`).
2. **Use `C:\Users\martv\OneDrive\Documents\github\rawad\wiki\index.md`** as your navigation entrypoint for
   browsing the wiki structure.
3. **Use `C:\Users\martv\OneDrive\Documents\github\rawad\graphify-out\wiki\index.md`** if it exists — it's
   the auto-generated Graphify wiki index.
4. **Only read raw files in `C:\Users\martv\OneDrive\Documents\github\rawad\raw\`** if the user explicitly
   says "read the raw file" or the graph query doesn't have the answer.

## Wiki-Brain Session Rules

**Ingesting sources.** When the user drops a file into `C:\Users\martv\OneDrive\Documents\github\rawad\raw\`
and asks you to ingest it, follow `/wiki-brain ingest` — read the source,
summarize, create/update wiki pages, cross-link aggressively, update
`wiki/index.md`, append to `log.md`.

**Every session must end with a log entry.** Before ending a session, append
one line to `C:\Users\martv\OneDrive\Documents\github\rawad\log.md` in this exact format:

```
## [YYYY-MM-DD HH:MM] session | <3-8 word session title>
Touched: <comma-separated wiki pages, or "none">
```

**If the session produced durable knowledge** (decisions made, things learned,
project state changed, problems solved) — update or create relevant wiki
pages with that knowledge before ending. Cross-link with `[[Page Name]]`.
Update `wiki/index.md`.

**If the session was trivial** (one-off fix, routine task, exploratory
chatter) — skip the wiki update. Just append the log line.

**Never modify files in `raw/`.** Sources are immutable.
**Claude owns `wiki/` entirely.** Update it, don't ask permission for each
page — just report what changed.
**Always update `wiki/index.md`** when you create or rename a wiki page.
**Cross-link aggressively.** `[[Page Name]]` Obsidian syntax. A page with
no inbound links is a dead-end.

## Wiki-Brain Commands Available

- `/wiki-brain` — status menu
- `/wiki-brain ingest <file>` — ingest a source
- `/wiki-brain query "<q>"` — query the graph + wiki
- `/wiki-brain lint` — health-check the wiki
- `/wiki-brain rebuild` — force a Graphify rebuild
- `/wiki-brain doctor` — verify install
- `/recall` — show last 5 activities + read linked pages
