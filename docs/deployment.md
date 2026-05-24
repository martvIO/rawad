# Deployment — Dawa

---

## Prerequisites

- Node.js 20+
- Firebase CLI: `npm install -g firebase-tools`
- Firebase project: `dawa-aa793`
- Java 21 (for emulators + integration tests only)
- Authenticated: `firebase login` (browser auth — run interactively)

---

## Environment Variables

### Frontend (Vite)
Set in `.env` for local dev, `.env.production` for production builds.

| Variable | Local dev | Production |
|---|---|---|
| `VITE_USE_EMULATORS` | `1` | `0` (set in `.env.production`) |
| `VITE_API_BASE_URL` | `http://127.0.0.1:5001/dawa-aa793/us-central1/api` | Empty (uses same-origin `/api` rewrite) |
| `VITE_INVITE_BASE_URL` | Empty | Your production domain |
| `VITE_RECAPTCHA_V2_SITE_KEY` | Test key | Production reCAPTCHA v2 site key |

### Cloud Functions
Set via Firebase environment config or Google Cloud Secret Manager.

```bash
# Set WEB_API_KEY (required for all auth routes)
firebase functions:secrets:set WEB_API_KEY --project dawa-aa793

# Set ALLOWED_ORIGINS (optional — empty = allow all, fine for single-domain deploys)
firebase functions:secrets:set ALLOWED_ORIGINS --project dawa-aa793
```

---

## Full Deploy (first time or atomic update)

```bash
# 1. Build Cloud Functions
cd functions && npm run build && cd ..

# 2. Build frontend
npm run build

# 3. Deploy everything atomically
firebase deploy --project dawa-aa793
```

This runs both predeploy hooks (`scripts/build-functions.cjs` + `scripts/build-vite.cjs`) and deploys hosting + functions + database rules + storage rules + Firestore rules.

---

## Partial Deploys

```bash
# Frontend only
firebase deploy --only hosting --project dawa-aa793

# Cloud Functions only
firebase deploy --only functions --project dawa-aa793

# Rules only
firebase deploy --only database,storage,firestore --project dawa-aa793
```

---

## Migration Steps (after major schema or claim changes)

When JWT claim shape or RTDB rules change, this order is required to avoid downtime:

1. Deploy Cloud Functions (new claim shape takes effect for new logins)
2. Run migration script (backfill existing users):
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=./dawa-aa793-firebase-adminsdk-fbsvc-e42554a05c.json \
     node functions/scripts/migrateClaims.js
   ```
3. Deploy database + storage rules (new rules now match new claim shape)
4. Deploy frontend

---

## First-Time Setup (new project / new machine)

```bash
# 1. Bootstrap first admin account
GOOGLE_APPLICATION_CREDENTIALS=./dawa-aa793-firebase-adminsdk-fbsvc-e42554a05c.json \
  node functions/scripts/seedAdmin.js

# 2. Verify the admin was created
node functions/scripts/inspectUser.js admin
```

---

## Local Development with Emulators

```bash
# Start everything in one command (builds functions, starts emulators + Vite)
npm run dev:full

# Or start emulators manually, then Vite
npm run emulators:build     # builds functions and starts emulators
npm run dev:emulator        # starts Vite pointed at emulator API URL

# Seed the emulator with test data
npm run emulators:seed
```

Emulator ports (from `firebase.json`):
- Auth: 9099
- RTDB: 9000
- Firestore: 8080
- Storage: 9199
- Functions: 5001
- Hosting: 5000
- UI: 4000

---

## Post-Deploy Smoke Test

See `docs/SMOKE_TEST.md` for the manual checklist.

Quick sanity checks:

```bash
# Health probe
curl https://us-central1-dawa-aa793.cloudfunctions.net/api/health

# Expected response:
# {"ok":true,"uptimeSeconds":N}
```

---

## Rollback

Firebase Hosting rollback (reverts frontend only):
```bash
firebase hosting:clone dawa-aa793:live dawa-aa793:live --version <VERSION_ID>
```

Cloud Function rollback requires redeploying a previous build. Maintain tagged git releases for this.

---

## Netlify (alternative hosting)

`netlify.toml` configures Netlify as an alternative to Firebase Hosting. Set:
- Build command: `npm run build`
- Publish directory: `dist`
- Environment variable: `VITE_USE_EMULATORS=0`

Note: Cloud Functions are not deployed via Netlify — Firebase still hosts functions, and `VITE_API_BASE_URL` must point to the Cloud Functions URL.
