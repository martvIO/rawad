# Dawa (دعوة) — Project Progress

## What This App Is

Wedding-invitation distribution app. Grooms manage guest lists, drivers deliver physical invitations and upload proof photos, an admin oversees everything. Originally a single 4 858-line `App (1).jsx` backed entirely by `localStorage`.

---

## Goal

Full rewrite to a production-ready Firebase application:

1. **Multi-file React project** — organized under `src/` with hooks, services, pages, and components separated.
2. **Firebase backend** — Realtime Database replaces `localStorage`; Firebase Auth replaces hardcoded credentials; Cloud Functions handle privileged operations; Storage holds proof photos.
3. **Security hardening** — default-deny RTDB rules, role-based access, App Check, rate limiting, audit log, CSP headers.
4. **Windows-compatible tooling** — all build/deploy scripts work on Windows (cross-spawn quirks, npm stdin bug, pkg-bundled Node ESM gap).

---

## Key Decisions

| Topic | Decision | Reason |
|---|---|---|
| Build tool | Vite + React 18 | Already in use; fast HMR |
| Styling | Keep all inline styles | No regressions; not in scope |
| Auth | Username + password (synthetic email `username@dawa.local`) | Users don't have real emails |
| Password reset | Phone SMS OTP via Firebase Phone Auth | Users share phone numbers |
| Encryption | Firebase built-in (TLS + AES-256 at rest) | Sufficient; no client-side field encryption |
| Firebase plan | Blaze (pay-as-you-go) | Required for Cloud Functions |
| Data layout | Sharded by groomUid (`/guestsByGroom/{uid}`, `/liveLocationsByGroom/{uid}`) | RTDB requires `.read` at the path you subscribe to — flat paths with per-child rules don't work for non-admin listeners |
| TypeScript (functions) | `module: Node16` + `moduleResolution: node16` | Matches Node 20 runtime; non-deprecated in TS 5.9+ |
| Tests | Vitest + `@firebase/rules-unit-testing` against the Database emulator | 79 tests, all passing |

---

## Architecture

```
src/
  firebase.js          — initializeApp, emulator wiring, App Check
  services/
    auth.js            — signIn, signOut, subscribeAuth, sendPasswordResetCode
    guests.js          — subscribeGuestsForGroom, addGuest, updateGuest, removeGuest, markDelivered
    users.js           — subscribeUsers (admin), createPortalUser, deletePortalUser
    liveLocations.js   — publishMyFix (driver → RTDB), subscribeDriversForGroom (groom listener)
    confirmations.js   — subscribeConfirmations, submitConfirmation (via Cloud Function)
    adminSettings.js   — subscribeSettings, saveSettings
    proofs.js          — uploadProof (Firebase Storage), proofDownloadUrl
  hooks/
    usePortalState.js  — all portal state; replaces localStorage reads/writes with Firebase subscriptions
    useGeolocation.js  — GPS watch + RTDB publish/subscribe; fixed driversSharingWithMe shape bug
  pages/ …             — LoginScreen, ConfirmationForm, admin/, driver/, groom/ views
  components/
    PasswordResetFlow.jsx — 3-step phone OTP modal

functions/src/
  users.ts             — createPortalUser, deletePortalUser, setAdminClaim (admin-only callables)
  assignments.ts       — assignDriverToGroom (sets custom claim + RTDB entry)
  confirmations.ts     — submitConfirmation (public HTTPS, App Check, per-IP rate limit 5/hr)
  resetPassword.ts     — phone-OTP verified password reset
  audit.ts             — auditLog helper (internal)
  rateLimit.ts         — in-memory per-key rate limiter used by confirmations

database.rules.json    — default-deny; per-node role checks + schema .validate
storage.rules          — proof photos gated by assignedGrooms custom claim
firebase.json          — CSP/HSTS/X-Frame-Options headers; hosting + functions + db + storage config
```

---

## Security Model (summary)

- **No plaintext passwords** — Firebase Auth owns credentials.
- **No hardcoded admin** — first admin created via `functions/scripts/seedAdmin.js` with service account.
- **Default-deny RTDB** — every node requires explicit `.read`/`.write`; all `.validate` schema checks.
- **Default-deny Storage** — proof photos require `assignedGrooms[groomUid] === true` in custom claim.
- **App Check** — reCAPTCHA Enterprise; enforced on RTDB, Storage, and all callable Functions.
- **Rate limiting** — `submitConfirmation`: 5 requests/hr per IP.
- **Audit log** — admin mutations written to `/audit/{eventId}` by Functions (client write blocked).
- **CSP headers** — full allowlist in `firebase.json`; blocks inline scripts, framing, unknown origins.
- **HSTS** — `max-age=63072000; includeSubDomains; preload`.

---

## Windows Build Fixes (all resolved)

| Problem | Root cause | Fix |
|---|---|---|
| `firebase.json` predeploy `$RESOURCE_DIR` | Bash variable doesn't expand on Windows | Replaced with `build-functions.cmd` wrapper |
| `spawn npm … ENOENT` | `cross-spawn` inside firebase-tools treats the entire predeploy string as one executable name (no shell split) | Single-word `.cmd` files in project root; cross-spawn finds them by extension |
| `npm ERR! Cannot read properties of undefined (reading 'stdin')` | npm 10/11 crashes on `process.stdin` being null in non-TTY contexts | `.npmrc`: `foreground-scripts=true`; build scripts call tsc/vite directly, bypassing npm subprocess |
| `ERR_REQUIRE_ESM` for vite.js | firebase-tools' pkg-bundled Node (v20) can't `require()` ESM; its node wins PATH race | `scripts/build-vite.cjs` loads vite via `await import(pathToFileURL(...))` — dynamic import works in pkg |
| `ERR_UNSUPPORTED_DIR_IMPORT` | `import(directoryPath)` not supported for ESM on Windows | Import `vite/dist/node/index.js` directly |
| TypeScript `moduleResolution=node10` deprecated | `functions/tsconfig.json` used legacy `module: commonjs` + `moduleResolution: node` | Updated to `module: Node16` + `moduleResolution: node16` + `rootDir: src` + `composite: true` |
| VS Code shows stale TS errors | No root `tsconfig.json`; VS Code used implicit project with defaults | Added root `tsconfig.json` (project reference to `functions/`) + `.vscode/settings.json` pointing at workspace TypeScript |
| CSP blocks `http://127.0.0.1:9099` in production | `VITE_USE_EMULATORS=1` in `.env` baked into `vite build` | Created `.env.production` with `VITE_USE_EMULATORS=0`; Vite loads it after `.env` for production builds |
| `seedAdmin.js` — `ENOTFOUND metadata.google.internal` | Admin SDK auto-detects project ID from GCP metadata server (only available inside GCP) | Script now reads `GCLOUD_PROJECT` / parses project ID from database URL; service account key added |

---

## Files Added / Changed (non-exhaustive)

```
.env.production          VITE_USE_EMULATORS=0 (production override)
.npmrc                   foreground-scripts=true (npm stdin fix)
.vscode/settings.json    typescript.tsdk → functions/node_modules/typescript/lib
tsconfig.json            Root solution tsconfig (references ./functions)
build-functions.cmd      Cross-spawn-safe wrapper → scripts/build-functions.cjs
build-vite.cmd           Cross-spawn-safe wrapper → scripts/build-vite.cjs
scripts/build-functions.cjs  Calls tsc directly (no npm, no stdin issue)
scripts/build-vite.cjs   Calls vite via await import() (ESM-safe from pkg node)
functions/tsconfig.json  module: Node16, moduleResolution: node16, rootDir: src, composite: true
functions/scripts/seedAdmin.js  Fixed project-ID detection; uses service account key
database.rules.json      Full default-deny rules
storage.rules            Proof photo access rules
firebase.json            CSP/HSTS headers; predeploy hooks; emulator config
```

---

## Current State

- **79/79 database rules tests pass** against the emulator (`npm test`).
- **Vite client build** succeeds (`npm run build`).
- **Cloud Functions TypeScript build** succeeds (`npm run build` in `functions/`).
- **`firebase deploy`** runs both predeploy hooks without error.
- **Admin account seeded** in production Firebase (UID `9gnlTRbtB0T7VW1ISdYqsIsbtq13`, username `admin`).
- **CSP violation fixed** — production build no longer points at local emulator.

---

## Immediate Next Steps

1. **Fill in real Firebase config in `.env`**
   Get values from Firebase console → Project Settings → Your apps → Web app:
   ```
   VITE_FIREBASE_API_KEY=
   VITE_FIREBASE_AUTH_DOMAIN=dawa-aa793.firebaseapp.com
   VITE_FIREBASE_DATABASE_URL=https://dawa-aa793-default-rtdb.firebaseio.com
   VITE_FIREBASE_PROJECT_ID=dawa-aa793
   VITE_FIREBASE_STORAGE_BUCKET=dawa-aa793.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=
   VITE_FIREBASE_APP_ID=
   VITE_RECAPTCHA_ENTERPRISE_SITE_KEY=6LekWOssAAAAAI3EjkKLqBjmer3BePT5ohOY81lJ
   VITE_USE_EMULATORS=1
   ```

2. **Rebuild and redeploy** after filling in the config:
   ```powershell
   npm run build
   firebase deploy
   ```

3. **Change the admin password** — log in with `admin` / `StrongPass123` and set a strong password immediately.

4. **Role matrix smoke test** on the live URL:
   - Admin: sees all users, guests, confirmations; can create/delete users.
   - Groom: sees only own guests; write to another groom's path → permission denied.
   - Driver: after `assignDriverToGroom`, sees assigned groom's guests; can mark delivered with proof photo.
   - Public confirmation form (`?form=GROOM_USERNAME`) submits without login.

5. **Live location smoke test** — driver broadcasts GPS; groom sees pin in real time; unrelated groom sees nothing.

6. **(Optional) Enable App Check enforcement** in the Firebase console once the live URL is confirmed working, to block unauthenticated API access.

---

## Known Remaining Items

- The `dawa-aa793-firebase-adminsdk-fbsvc-e42554a05c.json` key file is excluded from Git (`.gitignore` rule `*-adminsdk-*.json`) but sits in the project root. Store it somewhere safe (password manager, secrets vault) and delete the local copy once no longer needed.
- The reCAPTCHA site key (`6LekWOssAAAAAI3EjkKLqBjmer3BePT5ohOY81lJ`) is in `.env.example` — this is a **public** key (by design for reCAPTCHA Enterprise) so committing it is fine.
- Vite bundle is 750 KB (minified) — consider code-splitting if load time becomes a concern.
