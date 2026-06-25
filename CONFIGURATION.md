# Configuration reference

The single place that tells you **where every environment variable and config setting lives** —
where it's read in code, where you set it, and what it does. Covers env vars, the admin-editable
runtime settings, the code-level config constants, and the infra/config files.

> **Secrets are never in this file.** It lists variable *names* and *locations* only — no token,
> key, or password values. Real secrets live in `.env*` files (gitignored) and Firebase Secret
> Manager. See [Where secrets live](#where-secrets-live).

---

## Where do I change X? (quick-lookup)

| I want to… | Change it here | Kind |
|---|---|---|
| Turn the physical/handwritten track on or off | `frontend/src/config/index.js` → `FEATURES.physical` (then rebuild + redeploy) | Code config |
| Change the WhatsApp number / phone / email / socials shown publicly | Admin **Settings** tab → `/adminSettings` (`contactWhatsapp`, `contactPhone`, `contactEmail`, `social*`, + `*Enabled`) | Runtime |
| Enable WhatsApp auto-send / set the daily cap | Admin **WhatsApp** tab → `/adminSettings.waAutoSendEnabled`, `waDailyCap` | Runtime |
| Set the WhatsApp Cloud API access token / app secret | Secret Manager / functions env: `WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET` (env-only, never DB) | Env (secret) |
| Point the frontend at the local emulators | `npm run dev:emulator` (sets `VITE_API_BASE_URL` → emulator + `VITE_USE_EMULATORS=1`) | Script |
| Set the REST API base URL (prod build) | `VITE_API_BASE_URL` (Netlify env / `.env.production`) | Env |
| Set the CORS allowlist | `ALLOWED_ORIGINS` (functions env) → read in `backend/functions/src/api/cors.ts` | Env |
| Set the server-side Firebase Web API key | `WEB_API_KEY` (functions env, never `VITE_*`) | Env (secret) |
| Enable the password-encryption layer | `PASSWORD_ENC_PRIVATE_KEY` (functions env) + optional `REQUIRE_ENCRYPTED_PASSWORDS` | Env (secret) |
| Enable Stripe payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (functions env) | Env (secret) |
| Enable AWS Rekognition face matching | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` (functions env) | Env (secret) |
| Tune poll intervals / request timeouts | `frontend/src/config/index.js` (`POLL_MS`, `API_TIMEOUT_MS`) | Code config |
| Tune rate limits / field caps / token TTL | `backend/functions/src/constants/*` (`rateLimits.ts`, `limits.ts`, `tokens.ts`, `time.ts`) | Code config |
| Change RTDB / Firestore / Storage security rules | `database.rules.json` / `firestore.rules` / `storage.rules` | Infra |
| Tune a load test | `LOADTEST_*` env vars / `loadtest/run.py` flags | Env |

---

## Environment variables

Tables list **where the value is read in code** and **where you set it**. A blank "Set in" means
you provide it yourself (Secret Manager, `.env`, or shell). Defaults are the in-code fallback used
when the var is unset.

### Frontend build-time (`VITE_*`)

Read in the frontend bundle (Vite inlines `import.meta.env.VITE_*` at build time). Set in
`.env` / `.env.production` locally or the Netlify dashboard; some are set by `frontend/package.json`
dev scripts. The frontend uses a REST API + a localStorage token manager — it has **no Firebase
SDK**, so there are no `VITE_FIREBASE_*` reads here (those are backend-script-only; see below).

| Variable | Read in | Set in | Required | Default | Purpose |
|---|---|---|---|---|---|
| `VITE_API_BASE_URL` | `frontend/src/config/index.js` | `frontend/package.json` (`dev:emulator`), Netlify | Optional | `/api` | REST API base; prod uses same-origin `/api` Hosting rewrite |
| `VITE_SSE_BASE_URL` | `frontend/src/config/index.js` | Netlify | Optional | Cloud Run URL | Direct Cloud Run origin for the live-location SSE stream (Hosting buffers streams) |
| `VITE_INVITE_BASE_URL` | `frontend/src/config/index.js` | Netlify / `.env` | Optional | `https://invite.dawa.to` | Base URL for per-guest invite links |
| `VITE_CONTACT_WHATSAPP` | `frontend/src/config/index.js` | Netlify / `.env` | Optional | `""` | Build-time fallback WhatsApp number for marketing CTAs (admin overrides via `/adminSettings`) |
| `VITE_CONTACT_PHONE` | `frontend/src/config/index.js` | Netlify / `.env` | Optional | `""` | Build-time fallback contact phone |
| `VITE_CONTACT_EMAIL` | `frontend/src/config/index.js` | Netlify / `.env` | Optional | `""` | Build-time fallback contact email |
| `VITE_RECAPTCHA_V2_SITE_KEY` | `frontend/src/pages/PeopleGallery.jsx` | Netlify / `.env` | For OTP/gallery | `""` | reCAPTCHA v2 site key |
| `VITE_SENTRY_DSN` | `frontend/src/utils/sentry.js` | Netlify / `.env` | Optional | unset (no-op) | Frontend error monitoring DSN |
| `VITE_DEBUG` | `frontend/src/utils/logger.js` | `.env` | Optional | unset | `1` = verbose frontend logging (`import.meta.env.DEV` also enables it) |
| `VITE_COGNITO_IDENTITY_POOL_ID` | `frontend/src/utils/awsLiveness.js` | Netlify / `.env` | Optional | `""` | AWS Cognito pool for face-liveness capture |
| `VITE_AWS_REGION` | `frontend/src/utils/awsLiveness.js` | Netlify / `.env` | Optional | `""` | AWS region for face-liveness |
| `VITE_USE_EMULATORS` | — (set only; effective switch is `VITE_API_BASE_URL`) | `frontend/package.json` (`dev:emulator`), `netlify.toml` | Dev | — | Marker that the build targets emulators |

### Cloud Functions runtime (`process.env`)

Read by the deployed Express API / triggers in `backend/functions/src/`. Set via Firebase Secret
Manager or functions env (`.env.local` for the emulator). Template: `backend/functions/.env.example`.

| Variable | Read in | Required | Default | Purpose |
|---|---|---|---|---|
| `WEB_API_KEY` | `api/routes/auth.ts`, `api/routes/digital/galleryAccess.routes.ts` | Yes (prod) | unset → 500 | Firebase Web API key, **server-only** (password sign-in). Never expose as `VITE_*` |
| `ALLOWED_ORIGINS` | `api/cors.ts` | Recommended | built-in allowlist (fail-closed) | Comma-separated extra CORS origins |
| `PASSWORD_ENC_PRIVATE_KEY` | `api/passwordCrypto.ts` | Optional | unset → layer off (emulator auto-gens) | RSA PKCS8 PEM for the password-encryption layer |
| `REQUIRE_ENCRYPTED_PASSWORDS` | `api/middleware/decryptPasswordFields.ts` | Optional | off | `true` = reject plaintext password fields |
| `STREAM_TOKEN_SECRET` | `api/streamToken.ts` | Optional | unset | HMAC secret for short-lived SSE stream tokens |
| `TRUSTED_PROXY_HOPS` | `api/index.ts` | Optional | — | Express `trust proxy` hop count for client-IP rate limiting |
| `DAWA_DEBUG_ERRORS` | `api/errorDetail.ts` (+ many routes) | Optional | off | `1` = include internal error detail in responses (debug only) |
| `FUNCTIONS_EMULATOR` | `api/middleware/rateLimit.ts`, `api/routes/auth.ts`, `api/passwordCrypto.ts` | Auto | — | Firebase-set; relaxes emulator-only code paths |
| `WHATSAPP_TOKEN` | `whatsappConfig.ts`, `whatsapp.ts` | Optional (send = no-op until set) | unset | Meta Cloud API access token — **env-only secret, never DB** |
| `WHATSAPP_APP_SECRET` | `whatsappConfig.ts`, `whatsapp.ts` | Optional | unset | Meta app secret for webhook signature verification — **env-only secret** |
| `WHATSAPP_PHONE_ID` | `whatsappConfig.ts` | Optional | `/adminSettings.waPhoneId` | Sending phone-number ID (DB overrides env) |
| `WHATSAPP_WABA_ID` | `whatsappConfig.ts` | Optional | `/adminSettings.waWabaId` | WhatsApp Business Account ID (DB overrides env) |
| `WHATSAPP_VERIFY_TOKEN` | `whatsappConfig.ts`, `whatsapp.ts` | Optional | `/adminSettings.waVerifyToken` | Webhook verify token (DB overrides env) |
| `WHATSAPP_INVITE_TEMPLATE_PHYSICAL_AR`, `WHATSAPP_INVITE_TEMPLATE_PHYSICAL_HE` | `whatsappConfig.ts` | Optional | DB / free-form | Approved template names, physical invites (DB overrides env) |
| `WHATSAPP_INVITE_TEMPLATE_DIGITAL_AR`, `WHATSAPP_INVITE_TEMPLATE_DIGITAL_HE` | `whatsappConfig.ts` | Optional | DB / free-form | Approved template names, digital invites (DB overrides env) |
| `WHATSAPP_YOURPHOTOS_TEMPLATE` | `api/routes/digital/photoShare.routes.ts`, `whatsapp.ts` | Optional | unset (feature off) | Template for "your photos are ready" |
| `WHATSAPP_YOURPHOTOS_TEMPLATE_LANG` | `api/routes/digital/photoShare.routes.ts` | Optional | `ar` | Language for the photos-ready template |
| `WHATSAPP_CREDENTIALS_TEMPLATE_AR`, `WHATSAPP_CREDENTIALS_TEMPLATE_HE` | `whatsappConfig.ts` | Optional | DB (`waTemplateCredentialsAr/He`) / delivery off if blank | Approved template (3 body vars: username, password, login URL) delivering a new groom's credentials after a paid signup |
| `PUBLIC_BASE_URL` | `whatsappInvite.ts`, `whatsappTemplates.ts`, `api/routes/payments.ts`, `api/routes/digital/photoShare.routes.ts` | Optional | `https://dawa-aa793.web.app` | Origin used to build invite/pay/login links in WhatsApp messages |
| `STRIPE_SECRET_KEY` | `api/routes/payments.ts` | Optional | unset (payments off) | Stripe secret key (paid-signup PaymentIntents) |
| `STRIPE_WEBHOOK_SECRET` | `api/routes/payments.ts` | Optional | unset | Stripe webhook signing secret. Dashboard event to subscribe: `payment_intent.succeeded` |
| `AWS_ACCESS_KEY_ID` | `faceIndex/config.ts` | Optional | unset (Rekognition off) | AWS key for face indexing (set with the other two) |
| `AWS_SECRET_ACCESS_KEY` | `faceIndex/config.ts` | Optional | unset | AWS secret for face indexing |
| `AWS_REGION` | `faceIndex/config.ts`, `faceIndex/rekognition.ts`, `api/routes/photoFaces.ts` | Optional | unset | AWS region for Rekognition |
| `REKOGNITION_COLLECTION_PREFIX` | `faceIndex/rekognition.ts` | Optional | `dawa` | Prefix for per-wedding face collections |
| `REKOGNITION_PURGE_DAYS` | `faceIndex/purge.ts` | Optional | `30` | Days post-wedding before biometric data auto-deletes |
| `SENTRY_DSN` | `sentry.ts` | Optional | unset (no-op) | Backend error monitoring DSN |
| `GCLOUD_PROJECT` | `sentry.ts`, `digitalInvitePreview.ts` (+ scripts) | Auto/optional | — | Google Cloud project id (Firebase-provided at runtime) |
| `BACKUP_BUCKET` | `backupRtdb.ts` | Optional | `""` (job no-op) | GCS bucket for daily RTDB backups |
| `AUDIT_RETENTION_DAYS` | `auditRetention.ts` | Optional | `180` | Days before audit-log entries are purged |

### Backend scripts & emulator hosts

Read by one-off admin scripts in `backend/scripts/` and `backend/functions/scripts/` (seeding,
claim fixes, migrations, e2e verifiers). The `VITE_FIREBASE_*` names are reused here as plain
`process.env` values (shared `.env`), **not** by the frontend.

| Variable | Read in | Purpose |
|---|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS` | `backend/scripts/*` | Path to service-account JSON for the admin SDK (production scripts) |
| `FIREBASE_AUTH_EMULATOR_HOST` | `api/routes/auth.ts`, `api/passwordCrypto.ts`, scripts | Auth emulator host:port (e.g. `127.0.0.1:9099`) |
| `FIREBASE_DATABASE_EMULATOR_HOST` | scripts (admin SDK auto-detects) | RTDB emulator host:port |
| `FIRESTORE_EMULATOR_HOST` | scripts (admin SDK auto-detects) | Firestore emulator host:port |
| `FIREBASE_STORAGE_EMULATOR_HOST` | scripts (admin SDK auto-detects) | Storage emulator host:port |
| `FIREBASE_DATABASE_URL` / `VITE_FIREBASE_DATABASE_URL` | `backend/functions/scripts/seedAdmin.js`, `resetUser.js`, etc. | RTDB URL for script admin-SDK init |
| `FIREBASE_PROJECT` / `VITE_FIREBASE_PROJECT_ID` | `backend/functions/scripts/seedAdmin.js`, `fixAdminClaim.js` | Project id for scripts |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | `backend/functions/scripts/fixAdminClaim.js` | Web SDK config for the client-SDK login a few scripts do |

### Load test (`LOADTEST_*`)

Read in `loadtest/locustfile.py` and `loadtest/dashboard/*`; mostly set by `loadtest/run.py` CLI
flags. Template: `loadtest/.env.example`. Credentials are never read from the run-config JSON.

| Variable | Default | Purpose |
|---|---|---|
| `LOADTEST_CONFIG_FILE` | none | Path to `run_config.json` (set by `run.py --config`) |
| `LOADTEST_BASE_URL` | `https://dawa.to` | Target host |
| `LOADTEST_ADMIN_USER` / `LOADTEST_ADMIN_PASS` | `admin` / `DawaAdmin2026` | Admin creds for bootstrap token mint |
| `LOADTEST_GROOM_USER` / `LOADTEST_GROOM_PASS` | `groom` / `DawaGroom2026` | Groom creds for token discovery |
| `LOADTEST_NO_WRITES` | writes on | `1` = read-only run |
| `LOADTEST_NO_APPROVE` | approve on | `1` = skip design auto-approve |
| `LOADTEST_FALLBACK_TOKEN` | 32 hex zeros | Token used to exercise the 404 path |
| `LOADTEST_FALLBACK_GROOM` | `groom` | Fallback groom username |
| `LOADTEST_OUT_DIR` | `out` | CSV output directory |
| `LOADTEST_SMOKE` | normal ramp | `1` = tiny 5-user/15s shake-out |
| `LOADTEST_DASHBOARD_PORT` | `8765` | Dashboard web UI port (`dashboard/main.py`) |
| `LOADTEST_LOCUST_WEB_PORT` | `8089` | Locust web UI port (`dashboard/runner.py`) |

### CI / build

| Variable | Read in | Set in | Purpose |
|---|---|---|---|
| `CI` | `frontend/playwright.config.ts` | GitHub Actions (auto), `.github/workflows/ci.yml` | `true` → Playwright retries x2 |
| `GITHUB_TOKEN` | `.github/workflows/ci.yml` | GitHub Actions (auto) | Token for the gitleaks secret-scan action |
| `NODE_VERSION` | Netlify build | `netlify.toml` | Node version for Netlify builds (`20`) |

---

## Runtime admin settings (`/adminSettings`)

Admin-editable settings stored in the RTDB node `/adminSettings` — changed live in the portal, no
rebuild. Read/written via `backend/functions/src/api/routes/settings.ts` (`GET /settings`,
`GET /settings/public`, `PATCH /settings`) backed by `domain/settings/firebaseSettingsStore.ts`;
field validation lives in `database.rules.json`. Frontend polls every 30s (`POLL_MS.SETTINGS`).
For `wa*` values the resolver in `whatsappConfig.ts` lets these DB values **override** the matching
env var (the two true secrets — token & app secret — are env-only).

Edited in the admin **Settings** tab:

| Field | Type | Purpose |
|---|---|---|
| `mode` | `"manual"` \| `"digital"` | Invite distribution mode |
| `messageBody`, `formLink` | string | Manual-mode message + form link |
| `digitalBaseUrl`, `digitalMessage` | string | Digital-mode base URL + message |
| `contactWhatsapp` / `contactPhone` / `contactEmail` (+ each `…Enabled`) | string / bool | Public contact channels + visibility toggles |
| `socialFacebook` / `socialInstagram` / `socialTiktok` (+ each `…Enabled`) | string / bool | Public social links + toggles |
| `cancelGraceHours` | number (1–720) | Grace window before a cancellation finalizes |

Edited in the admin **WhatsApp** tab:

| Field | Type | Purpose |
|---|---|---|
| `waPhoneId`, `waWabaId`, `waVerifyToken` | string | Cloud API ids / webhook token (override env) |
| `waAutoSendEnabled` | bool (default true) | Auto-send invites over WhatsApp |
| `waDailyCap` | number (default 250) | Daily send cap |
| `waTemplatePhysicalAr/He`, `waTemplateDigitalAr/He` | string | Approved template names per slot |
| `waFallbackTextAr/He` | string | Free-form fallback text per language |

---

## Frontend code config (`frontend/src/config/index.js`)

Centralized constants imported across the app. Edit here, then rebuild + redeploy.

| Export | Purpose |
|---|---|
| `API_BASE_URL`, `SSE_BASE_URL`, `INVITE_BASE_URL` | Resolved from the `VITE_*` URL vars above |
| `CONTACT` | Build-time contact fallbacks (`VITE_CONTACT_*`) |
| `FEATURES` | Build-time feature flags — `physical` gates the handwritten/driver track (beta, default off) |
| `POLL_MS` | Per-resource REST poll intervals (`ME` 30s, `GUESTS` 15s, `SETTINGS` 30s, `INVITES` 3s, …) |
| `TIMING` | UI timings (`TOAST_MS`, `WA_STAGGER_MS`) |
| `GEO` | Geolocation thresholds (stale/age/timeout/publish) |
| `TOKEN_MGR` | Token refresh lead/floor + default lifetime |
| `API_TIMEOUT_MS` | REST timeouts (`DEFAULT` 30s, `UPLOAD` 120s) |
| `MATCHING` | Fuzzy-match thresholds (name Dice, address Jaccard) |
| `LEAFLET`, `MAP_TILES` | Leaflet CDN + SRI pins and map-tile providers |
| `ADDRESS_JOINER` | Arabic comma used to join address parts |

Other frontend constants: `frontend/src/constants/roles.js` (`ROLES`),
`frontend/src/constants/storageKeys.js` (`STORAGE_KEYS`, incl. `GROOM_TYPE`),
`frontend/src/constants/matchStatuses.js` (`MATCH_STATUS`).

## Backend constants (`backend/functions/src/constants/`)

| File | Exports | Purpose |
|---|---|---|
| `limits.ts` | `MAX_LEN`, `MAX_BYTES` | Field-length + file-size caps (proof 6 MB, photographer 200 MB, …) |
| `rateLimits.ts` | `RATE` | Per-hour rate-limit ceilings per action |
| `tokens.ts` | `TOKEN_BYTES`, `TOKEN_HEX_RE`, `TOKEN_TTL_MS` | Invite-token format (32-hex / 128-bit) + TTL |
| `time.ts` | `HOUR_MS`, `DAY_MS`, `TOKEN_TTL_MS` | Time constants (token TTL 90 days) |
| `format.ts` | `ADDRESS_JOINER` | Arabic comma (mirrors the frontend) |

---

## Infra / config files

| File | Configures |
|---|---|
| `firebase.json` | Hosting rewrites/headers/CSP, functions runtime, predeploy build hooks, emulator ports |
| `.firebaserc` | Default Firebase project alias (`dawa-aa793`) |
| `database.rules.json` | RTDB security rules + field validation (incl. `/adminSettings`) |
| `firestore.rules` | Firestore rules for the `/digitalInvitations/**` tree |
| `firestore.indexes.json` | Firestore composite indexes (currently empty) |
| `storage.rules` | Cloud Storage rules (proofs, digital media, photographer files, mockups) |
| `netlify.toml` | Netlify build for the confirmation form (base `frontend`, `NODE_VERSION`, `VITE_USE_EMULATORS=0`) |
| `frontend/vite.config.js` | Vite + React plugin (SPA build) |
| `frontend/vitest.config.js` | Frontend unit-test project (jsdom, `src/__tests__/**`) |
| `backend/vitest.config.js` | Backend test projects (`unit`, `integration`, `rekognition`) |
| `frontend/playwright.config.ts` | E2E browser matrix + base URL |
| `tsconfig.json`, `backend/functions/tsconfig.json` | TypeScript project config |

---

## Where secrets live

- **`.env*` files are gitignored** — never commit them. Templates: `backend/functions/.env.example`,
  `loadtest/.env.example`.
- **Production secrets** (`WEB_API_KEY`, `WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET`,
  `PASSWORD_ENC_PRIVATE_KEY`, `STRIPE_*`, `AWS_*`, `STREAM_TOKEN_SECRET`, …) go in **Firebase Secret
  Manager** / functions env, **not** the DB and **not** `VITE_*`.
- **Service-account JSON** is referenced by path via `GOOGLE_APPLICATION_CREDENTIALS` (it lives in
  the repo root for local admin scripts — never stage it in a commit).
- The `/api/health` endpoint reports `encryption: true|false` so monitoring can catch a deploy that
  forgot `PASSWORD_ENC_PRIVATE_KEY`.

---

## Maintaining this doc

When you add a new `VITE_*` or `process.env.*` variable, an `/adminSettings` field, or a config
constant, **add a row here** in the matching section. Keep pointers as file paths (no line numbers —
they rot). Quick audits:

```bash
# Frontend build-time vars
grep -rho 'import\.meta\.env[?.]*\.[A-Za-z_]*' frontend/src | sort -u
# Backend runtime vars (ignore lib/ build output and tests)
grep -rho 'process\.env\.[A-Za-z_]*' backend/functions/src backend/scripts | sort -u
# Load-test vars
grep -rho 'LOADTEST_[A-Z_]*' loadtest | sort -u
```
