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
| Routing | react-router-dom (planned, not yet implemented) | Bookmarkable URLs, back button, direct links |

---

## Architecture

```
src/
  firebase.js          — initializeApp, emulator wiring, App Check
  services/
    auth.js            — signIn, signOut, subscribeAuth, sendPasswordResetCode
    guests.js          — subscribeGuestsForGroom, addGuest, updateGuest, removeGuest, markDelivered
    users.js           — subscribeUsers (admin), createPortalUser, deletePortalUser,
                         updatePortalUser, adminSetPassword
    liveLocations.js   — publishMyFix (driver → RTDB), subscribeDriversForGroom (groom listener)
    confirmations.js   — subscribeConfirmations, submitConfirmation (via Cloud Function),
                         updateConfirmation (admin patch)
    adminSettings.js   — subscribeSettings, saveSettings
    proofs.js          — uploadProof (Firebase Storage), proofDownloadUrl
  hooks/
    usePortalState.js  — all portal state; Firebase subscriptions + handlers
    useGeolocation.js  — GPS watch + RTDB publish/subscribe
  utils/
    matchUtils.js      — phone normalization, fuzzy name/address similarity, classifyConfirmation
    phone.js           — toIntlPhone, validatePhone
    validation.js      — validateName
    storage.js         — localStorage helpers
  pages/
    LandingPage.jsx
    ConfirmationForm.jsx
    portal/
      Portal.jsx         — auth guard + role routing (RoleGuard)
      LoginScreen.jsx
      admin/
        AdminPortal.jsx
        AdminUserManager.jsx   ← NEW: full CRUD account management
        AdminSendTab.jsx
        AdminConfirmationsTab.jsx
        AdminSettingsTab.jsx
      driver/
        DriverPortal.jsx
        DriverPickGroom.jsx
        DriverDeliveryList.jsx
        SharedCities.jsx
      groom/
        GroomPortalView.jsx
        GroomDashboard.jsx
        GroomGuests.jsx
        GroomAddGuest.jsx
        GroomProofs.jsx
        GroomLiveMap.jsx
  components/
    RoleGuard.jsx            ← NEW: client-side role enforcement
    EditUserModal.jsx         ← NEW: admin user edit form
    EditConfirmationModal.jsx ← NEW: admin confirmation edit form
    EditGuestModal.jsx
    AddressInput.jsx
    BrandLogo.jsx
    CityField.jsx
    LangSwitcher.jsx
    LiveMap.jsx
    LogoutConfirm.jsx
    PasswordResetFlow.jsx
    PhotoViewer.jsx
    Toast.jsx
  context/
    PortalContext.jsx
  i18n/
    ar.js
    he.js

functions/src/
  index.ts             — exports all Cloud Functions
  users.ts             — createPortalUser, deletePortalUser, setAdminClaim
  updateUser.ts        ← NEW: updatePortalUser (admin patches user details)
  adminSetPassword.ts  ← NEW: admin resets another user's password
  assignments.ts       — assignDriverToGroom
  confirmations.ts     — submitConfirmation (public HTTPS, rate limit only)
  resetPassword.ts     — phone-OTP verified password reset
  audit.ts             — writeAudit helper (internal)
  rateLimit.ts         — in-memory per-key rate limiter
  helpers.ts           — assertAdmin, isE164, isRole, isUsername, normalisePhone, phoneIndexKey, syntheticEmail

database.rules.json    — default-deny; per-node role checks + schema .validate
                         /confirmations/$confId now allows admin client writes (update only)
storage.rules          — proof photos gated by assignedGrooms custom claim
firebase.json          — CSP/HSTS/X-Frame-Options headers; hosting + functions + db + storage config
netlify.toml           ← NEW: Netlify build config (VITE_USE_EMULATORS=0, SPA fallback)
.env.production        ← NEW: VITE_USE_EMULATORS=0 for production/Netlify builds
```

---

## Security Model (summary)

- **No plaintext passwords** — Firebase Auth owns credentials.
- **No hardcoded admin** — first admin created via `functions/scripts/seedAdmin.js`.
- **JWT custom claims** — every user carries `{ role: "admin"|"driver"|"groom", username }` in `auth.token`. Drivers additionally carry `assignedGrooms: { [groomUid]: true }`. The legacy `admin: true` boolean was retired in favour of the single `role` field. RTDB / Storage / Cloud Functions all check `auth.token.role === "admin"`.
- **Default-deny RTDB** — every node requires explicit `.read`/`.write`; all `.validate` schema checks.
- **Default-deny Storage** — proof photos require `assignedGrooms[groomUid] === true` in custom claim.
- **Rate limiting** — `submitConfirmation`: 5/hr per IP (sole abuse gate on the public endpoint); `createPortalUser`/`deletePortalUser`/`updatePortalUser`/`adminSetPassword`: 30/hr per admin.
- **Audit log** — admin mutations written to `/audit/{eventId}` by Functions.
- **CSP headers** — full allowlist in `firebase.json`.
- **HSTS** — `max-age=63072000; includeSubDomains; preload`.
- **assertAdmin** — shared helper in `functions/src/helpers.ts`; every privileged Cloud Function calls it first.
- **RoleGuard** — client-side component wrapping each role portal; not authoritative but prevents wrong-role UI from rendering.
- **Live claim refresh** — the client subscribes to `onIdTokenChanged` (via `subscribeIdToken` in `services/auth.js`) so a role change picks up automatically, and `callable()` retries once after `getIdToken(true)` on `permission-denied` to handle just-granted claims.

---

## Security Layer — Three Rings

| Layer | Where | Enforced by |
|---|---|---|
| Server: RTDB | `database.rules.json` | `auth.token.role === 'admin'`, ownership checks |
| Server: Functions | `functions/src/helpers.ts` → `assertAdmin()` | Throws `permission-denied` before any logic runs |
| Client: UI | `src/components/RoleGuard.jsx` | Renders `null` for wrong role |

---

## Confirmation Matching (Guest Form → Admin Panel)

Implemented in `src/utils/matchUtils.js`:

- **Phone normalization** — strips country codes (+972, 972, 00972, +970, etc.) and leading zeros. `+972-50-123-4567` and `0501234567` both map to `501234567` for comparison.
- **Name similarity** — Dice bigram coefficient + Jaccard word-set (handles Arabic/Hebrew/English transliterations and word reordering). Threshold: 0.55.
- **Address similarity** — Jaccard word-set on normalized city/area. Threshold: 0.40.
- **Case A** — phone + name similar + address similar → GREEN
- **Case B** — phone + name similar + groom has no address → GREEN
- **Case C** — phone matched but name/address differ → RED with reason badges
- **Unknown** — phone not in groom's guest list → separate "Unknown Person" section

Admin can edit any confirmation record (opens `EditConfirmationModal`). Save patches `/confirmations/{id}` and propagates to the matched guest record in `/guestsByGroom`.

---

## Account Management (Admin)

`AdminUserManager.jsx` (replaces old `AdminUsersTab`):
- Create users: all three roles (groom, driver, admin), with username, password, phone, optional display name
- Filter list by role (All / Admin / Groom / Driver)
- Edit button → `EditUserModal` — change username, display name, phone, role, optional new password
- Delete with inline confirmation step

Cloud Functions backing it:
- `createPortalUser` — creates Auth user + RTDB profile + indices + custom claim
- `updatePortalUser` (`updateUser.ts`) — patches any combination of username/phone/role/displayName; updates Auth email, RTDB, indices, custom claim atomically
- `deletePortalUser` — cascade-deletes Auth + RTDB + indices + guest data
- `adminSetPassword` — sets another user's password + revokes their refresh tokens
- `setAdminClaim` — promotes/demotes admin↔groom without recreating

---

## Windows Build Fixes (all resolved)

| Problem | Fix |
|---|---|
| `$RESOURCE_DIR` Bash variable | `build-functions.cmd` wrapper |
| `spawn npm ENOENT` | Single-word `.cmd` files in project root |
| npm stdin crash | `.npmrc`: `foreground-scripts=true` |
| `ERR_REQUIRE_ESM` for vite.js | `scripts/build-vite.cjs` with dynamic `await import()` |
| `ERR_UNSUPPORTED_DIR_IMPORT` | Import `vite/dist/node/index.js` directly |
| TypeScript `moduleResolution=node10` | Updated to `module: Node16` + `moduleResolution: node16` |
| VS Code stale TS errors | Root `tsconfig.json` + `.vscode/settings.json` |
| CSP blocks localhost in production | `.env.production` with `VITE_USE_EMULATORS=0` |
| `PASSWORD_LOGIN_DISABLED` error | Enable Email/Password in Firebase Console → Authentication → Sign-in method |

---

## Current State

- **79/79 database rules tests pass** (emulator — requires Java 21).
- **Vite client build** succeeds (`npm run build`).
- **Cloud Functions TypeScript build** succeeds (`cd functions && npm run build`).
- **`firebase deploy`** runs both predeploy hooks without error.
- **Admin account seeded** (UID `9gnlTRbtB0T7VW1ISdYqsIsbtq13`, username `admin`).
- **Production Firebase** reachable from `localhost` (no App Check — removed project-wide).
- **Confirmation matching** — fuzzy phone/name/address with GREEN/RED/Unknown sections + admin edit.
- **Admin User Manager** — full CRUD: create/edit/delete all account types.
- **RoleGuard** — wraps every role portal in Portal.jsx.
- **URL routing** — planned but NOT YET IMPLEMENTED (see `plans/routing-plan.md`).

---

## Immediate Next Steps

1. **Deploy Cloud Functions** — `firebase deploy --only functions` to push the `submitConfirmation` enforceAppCheck:false flip.
2. **Deploy hosting** — `firebase deploy --only hosting` so the updated CSP (reCAPTCHA Enterprise allowlist dropped, google.com kept for Phone Auth) ships.
3. **Change admin password** — default is `StrongPass123`.
4. **Role matrix smoke test** on live URL.

---

## Known Remaining Items

- The `dawa-aa793-firebase-adminsdk-fbsvc-e42554a05c.json` key file is in project root (excluded from Git). Store it securely and delete the local copy.
- Vite bundle is ~775 KB (minified) — consider code-splitting (route-based lazy loading via react-router) if it grows further.
- `re.js` at project root is a Google Cloud reCAPTCHA Enterprise sample that's not imported anywhere — can be deleted.
