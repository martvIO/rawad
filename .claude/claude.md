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
  firebase.js          — initializeApp, emulator wiring (App Check removed)
  services/
    _helpers.js        — subscribeList() + callable() with auto-retry on permission-denied
    auth.js            — signIn, signOut, subscribeAuth, subscribeIdToken, forceRefreshToken,
                         sendPasswordResetCode
    guests.js          — subscribeGuestsForGroom, addGuest, updateGuest, removeGuest, markDelivered
    users.js           — subscribeUsers (admin), createPortalUser, deletePortalUser,
                         updatePortalUser, adminSetPassword
    liveLocations.js   — publishMyFix (driver → RTDB), subscribeDriversForGroom (groom listener)
    confirmations.js   — subscribeConfirmations, submitConfirmation (via Cloud Function),
                         updateConfirmation (admin patch)
    adminSettings.js   — subscribeSettings, saveSettings
    proofs.js          — uploadProof (Firebase Storage), proofDownloadUrl
    digitalInvitation.js — addDigitalGuest (Firestore), saveDigitalMediaFile,
                           uploadPhotographerFile (Firebase Storage)
  hooks/
    usePortalState.js  — all portal state; subscribes to BOTH subscribeAuth + subscribeIdToken
                         (live claim refresh); isAdmin = claims?.role === "admin"
    useGeolocation.js  — GPS watch + RTDB publish/subscribe
  utils/
    logger.js          — tagged [dawa] console wrapper; ON when DEV or VITE_DEBUG=1
    matchUtils.js      — phone normalization, fuzzy name/address similarity, classifyConfirmation
    phone.js           — toIntlPhone, validatePhone
    validation.js      — validateName
    storage.js         — localStorage helpers
  styles/
    theme.js           — palette tokens (C, ROLE, S) — replaces 254 inline hex literals
  data/
    status.js          — STATUS map (delivery), REPLY_STATUS map (not-sent/pending/confirmed),
                         replyStateOf(guest) helper
  pages/
    LandingPage.jsx
    ConfirmationForm.jsx
    InvitePage.jsx     — per-guest invite link handler (/invite/:token)
    portal/
      Portal.jsx         — auth guard + role routing (RoleGuard)
      LoginScreen.jsx
      admin/
        AdminPortal.jsx
        AdminUserManager.jsx   — full CRUD account management
        AdminSendTab.jsx       — shows only non-confirmed guests; amber pending pill + tint
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
        GroomGuests.jsx        — shows delivery + reply state pills per guest
        GroomAddGuest.jsx
        GroomProofs.jsx
        GroomLiveMap.jsx
        digital/
          DigitalPortal.jsx
          DigitalDashboard.jsx   — groom uploads digital media; photo upload flow
          DigitalAddGuest.jsx    — add digital guest (name + phone only)
          DigitalPhotographer.jsx — photographer uploads files
  components/
    RoleGuard.jsx            — client-side role enforcement
    EditUserModal.jsx         — admin user edit form
    EditConfirmationModal.jsx — admin confirmation edit form
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
    ar.js   — reply_notSent, reply_pending, reply_confirmed keys added
    he.js   — same

functions/src/
  index.ts             — exports all Cloud Functions
  users.ts             — createPortalUser (stamps {role, username} claim for every role),
                         deletePortalUser, setAdminClaim (writes role, strips legacy admin)
  updateUser.ts        — updatePortalUser; updates {role, username} claim when either changes
  adminSetPassword.ts  — admin resets another user's password
  assignments.ts       — assignDriverToGroom (preserves role + username, adds assignedGrooms)
  confirmations.ts     — submitConfirmation (public HTTPS, rate limit; enforceAppCheck: false)
                         phone-match runs even without GPS coords; always sets confirmedAt
  invite.ts            — createGuestInvite (mints 32-char token, 90-day TTL),
                         submitGuestInvite (validates token, patches guest with confirmedAt,
                         writes /confirmations row, marks token usedAt)
  resetPassword.ts     — phone-OTP verified password reset
  audit.ts             — writeAudit helper (internal)
  rateLimit.ts         — in-memory per-key rate limiter
  helpers.ts           — assertAdmin (checks auth.token.role === "admin"), isE164, isRole,
                         isUsername, normalisePhone, phoneIndexKey, syntheticEmail

functions/scripts/
  seedAdmin.js         — initial admin bootstrap (first run only)
  inspectUser.js       — dump Auth record + RTDB profile + claims for diagnostics
  resetUser.js         — reset password, optionally stamp {role: "admin", username} claim
  fixAdminClaim.js     — one-off repair for a single user missing the role claim
  migrateClaims.js     — backfills {role, username} on every Auth user; --dry, --revoke

scripts/
  build-functions.cjs  — wipes functions/lib/ + tsconfig.tsbuildinfo before every tsc run
                         (prevents stale incremental cache causing firebase to prompt deletion)

database.rules.json    — default-deny; per-node role checks + schema .validate
                         /confirmations/$confId: admin client writes (update only)
                         /guestsByGroom/$uid/$guestId/confirmedAt: isNumber validator
storage.rules          — proof photos gated by assignedGrooms; digitalMedia/photographerFiles rules
firebase.json          — CSP/HSTS/X-Frame-Options headers; hosting + functions + db + storage config
netlify.toml           — Netlify build config (VITE_USE_EMULATORS=0, SPA fallback)
.env.production        — VITE_USE_EMULATORS=0 for production/Netlify builds
firestore.rules        — digitalGuests, digitalMedia, photographerFiles collection rules
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
- **`firebase deploy`** runs both predeploy hooks without error; `build-functions.cjs` now wipes the tsc cache on every run to prevent stale-export prompts.
- **Admin account seeded** (UID `9gnlTRbtB0T7VW1ISdYqsIsbtq13`, username `admin`).
- **Production Firebase** reachable from `localhost` (no App Check — removed project-wide).
- **Confirmation matching** — fuzzy phone/name/address with GREEN/RED/Unknown sections + admin edit.
- **Admin User Manager** — full CRUD: create/edit/delete all account types.
- **RoleGuard** — wraps every role portal in Portal.jsx.
- **Guest invite lifecycle** — not-sent / pending (amber) / confirmed (green) fully implemented. Confirmed guests disappear from AdminSendTab and appear in AdminConfirmationsTab. Both the per-guest `/invite/:token` flow and the public `/confirm/:groomUsername` form mark `confirmedAt` on the guest record and write a `/confirmations` row.
- **Digital invitation section** — groom can add digital guests (Firestore), upload media (Storage), photographer can upload files. Storage rules deployed; Firestore rules in place.
- **URL routing** — planned but NOT YET IMPLEMENTED (see `plans/routing-plan.md`).
- **KNOWN ISSUE** — `DigitalAddGuest.jsx` form submit hangs (button loads forever, data not saved). Photo upload on DigitalDashboard and DigitalPhotographer stays "uploading..." forever after success. Both need investigation.

---

## Immediate Next Steps (deploy pending)

Local work is committed-clean; live Firebase is still on the old claim shape until these run:

1. **`firebase login`** (browser auth — must run interactively in user's own terminal).
2. **Migrate live users** — `node functions/scripts/migrateClaims.js` from workstation (requires `GOOGLE_APPLICATION_CREDENTIALS` pointing at the service-account key). Adds `{role, username}` to every user's claims; strips legacy `admin: true`. Already run locally — re-run if any users were created since.
3. **Deploy backend atomically** — `firebase deploy --only functions,database,storage --project dawa-aa793`. The new RTDB rules check `auth.token.role === 'admin'`; must land together with the migration script's output.
4. **Deploy frontend** — `firebase deploy --only hosting --project dawa-aa793` OR push to Netlify (whichever hosts live).
5. **Smoke test** — sign in as `rawad / Rawad2026`, confirm admin user manager loads, edit + delete work; sign in as a groom, confirm guest list; sign in as a driver, confirm proof upload (exercises `assignedGrooms` claim).
6. **Change admin password** if still on the default `StrongPass123`.

---

## Known Remaining Items

- The `dawa-aa793-firebase-adminsdk-fbsvc-e42554a05c.json` key file is in project root (excluded from Git). Store it securely and delete the local copy.
- Vite bundle is ~775 KB (minified) — consider code-splitting (route-based lazy loading via react-router) if it grows further.
- `re.js` at project root is a Google Cloud reCAPTCHA Enterprise sample that's not imported anywhere — can be deleted.
- Rule tests (`npm test`) require Java 21 for the Firebase emulator. Without it, rely on the grep audit for `auth.token.admin` (should return 0 references in non-doc files).

---

## Recent Session History (for future context)

**Removed**: client App Check / reCAPTCHA Enterprise entirely. Site key dropped from `.env`, `netlify.toml`. Init code removed from `src/firebase.js`. `<script>` tag removed from `index.html`. CSP allowlist trimmed (kept `google.com` for Phone Auth invisible reCAPTCHA — different system). `submitConfirmation` Cloud Function flipped to `enforceAppCheck: false`. Rate limit remains the sole abuse gate.

**JWT schema migration**: Replaced binary `admin: true` claim with single `role: "admin"|"driver"|"groom"` claim + `username` claim for every user. Migration done in three layers: (1) Functions that mint claims — `createPortalUser`, `setAdminClaim`, `updatePortalUser` all write the new shape; (2) Rules — `database.rules.json` and `storage.rules` swapped `auth.token.admin === true` → `auth.token.role === 'admin'` at 14 sites; (3) Client — `usePortalState.js` reads `isAdmin = claims?.role === "admin"`, subscribes to BOTH `subscribeAuth` AND `subscribeIdToken` for live claim refresh.

**Service consolidation**: Created `src/services/_helpers.js` with `subscribeList()` (RTDB onValue→array) and `callable()` (https callable with auto-retry on `permission-denied`/`unauthenticated` via `forceRefreshToken()`). `users.js`, `guests.js`, `confirmations.js`, `liveLocations.js` now use these.

**Design tokens**: Created `src/styles/theme.js` with palette tokens. PowerShell sweep replaced 254 hex literals across 32 files with `C.token` references.

**Centralized logger**: Created `src/utils/logger.js` (tagged `[dawa]` console wrapper). 13 catch blocks across hooks/components now route errors through it.

**Refused (security-critical)**: User twice proposed shortcuts that would have created severe vulnerabilities — (1) shipping the Firebase Admin SDK service-account JSON to the browser to avoid `.env`, and (2) replacing Firebase Auth with a homegrown encrypted-password RTDB scheme. Both refused with explanation. The role-claim migration was the negotiated alternative.

**Guest invite lifecycle** (not-sent → pending → confirmed): Added `confirmedAt` field to guest schema. `submitGuestInvite` (invite.ts) now sets `confirmedAt` on the guest and writes a `/confirmations` row so the guest shows up on AdminConfirmationsTab. `submitConfirmation` (confirmations.ts) now runs the phone-match lookup unconditionally (not just when GPS coords present) and always patches `confirmedAt` on a single-match guest. AdminSendTab filters out confirmed guests and shows an amber pending pill for sent-but-not-confirmed guests. GroomGuests shows the same three-state reply pill. REPLY_STATUS map + replyStateOf() added to `src/data/status.js`. i18n keys `reply_notSent`, `reply_pending`, `reply_confirmed` added to both ar.js and he.js.

**Storage 403 fix**: `storage.rules` had correct rules for `digitalMedia/{groomUid}` and `photographerFiles/{groomUid}` since commit b282aad but were never deployed. User ran `firebase deploy --only storage --project dawa-aa793` manually. Rules now live.

**tsc incremental cache fix**: When `lib/` was deleted but `tsconfig.tsbuildinfo` survived, tsc skipped emit and firebase deploy prompted to delete `createGuestInvite`/`submitGuestInvite`. Fixed by updating `scripts/build-functions.cjs` to wipe both `functions/lib/` and `functions/tsconfig.tsbuildinfo` before every tsc invocation. Predeploy hook always starts from a clean slate.

**Digital invitation feature** (PARTIALLY working): Grooms can add digital guests (Firestore `digitalGuests/{uid}/guests`), upload media files (Storage `digitalMedia/{uid}/`), and photographer can upload files (Storage `photographerFiles/{uid}/`). Storage rules now deployed. KNOWN BUGS: (1) DigitalAddGuest form submission hangs — button spins forever, data not saved to Firestore. (2) Photo upload on DigitalDashboard + DigitalPhotographer shows "uploading..." forever after success. Both are in queue to fix.

**Pending work**: Fix DigitalAddGuest submit hang + reduce form to name+phone only + add `inviteType` field (digital/physical/both, since same phone can get both). Fix photo upload state not clearing on DigitalDashboard and DigitalPhotographer.
