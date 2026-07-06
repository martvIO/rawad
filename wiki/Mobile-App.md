---
date: 2026-06-25
updated: 2026-06-26
tags: [mobile, expo, react-native, android, ios, roadmap]
---

# Mobile App (Groom)

Native **Android + iOS** app for the **groom** experience only. Originally a
**Capacitor** wrapper (decided + Phase-1-built 2026-06-25); **reversed to a native
**Expo / React Native** rewrite on 2026-06-26** — see [[Architecture-Decisions]].
Lives in the repo's `app/` package on branch `feat/groom-mobile-app`.

## Why Expo (the reversal)

The user made *genuinely native, smooth UX* a non-negotiable product standard.
Fully-native (Swift/Kotlin) was rejected: the only justification (heavy AR/3D) is
the **guest-facing** invitation (guests tap a WhatsApp link — they don't install
the app), so the groom *management* app has no native-only need. Expo reuses the
JS logic, keeps the React model, **builds iOS in the cloud via EAS** (the dev is on
Windows, no Mac), and runs the existing Three.js 3D via `expo-gl`.

## Architecture

- **`@dawa/core`** (`shared/`) — a DOM-free package holding the REST client, all
  services, pure utils, i18n, and theme tokens. The **web** imports it via a Vite
  alias + one-line re-export shims left at the old `frontend/src` paths (192 import
  sites untouched); the **Expo app** via a `metro.config.js` `resolveRequest` that
  maps the bare `@dawa/core` specifier to absolute `../shared/src/*` source paths.
  **No npm workspace** (would disturb the Firebase Functions deploy + the Windows
  npm workaround). `react`/`react-native` are deduped to one copy.
  - **SDK 56 gotcha (Metro 0.84):** Metro will only bundle files under its *server
    root*, which Expo derives from `getMetroServerRoot()`. With no workspace declared
    that collapses to `app/`, so the sibling `shared/` tree can't be indexed
    ("Failed to get the SHA-1 … not watched"). Fixed with a repo-root
    **`pnpm-workspace.yaml`** (`packages: [app, shared]`) — this flips the server
    root to the repo root and adds `shared/` to watchFolders, the standard Expo
    monorepo wiring. **npm ignores `pnpm-workspace.yaml`**, so installs and the
    Firebase deploy are unaffected; only Expo's `resolve-workspace-root` reads it.
- **Platform adapters** inject the platform edges into `@dawa/core`: storage
  (`tokenManager`/`storage.js`) → web `localStorage` / native `expo-secure-store`;
  env (`config`/`logger`) → web `import.meta.env` / native `expo-constants` `extra`.
  Wired before the router boots (`app/src/initAdapters.js`, web `main.jsx`).
- **expo-router** file-based routing. Auth gate (`index`) → `login` /
  `change-password` / `forgot-password` / `not-a-groom` / `(groom)` tabs.
- **`(groom)` Tabs**: Dashboard · Guests · Manage, wrapped by a `ToastProvider` +
  the composed **`useGroomDigital`** data context (subscribes once, shared across
  tabs, to `subscribeDigitalGuests/Media/Designs`; optimistic mutations + the
  upload pending-map + AppState poll-pausing). Per-screen header has a language
  toggle + a kebab menu (Help / Terms / Logout). Help/Terms are push screens.
- **UI:** faithful web look (dark `#07070a` + gold, RTL, Arabic type) with native
  interactions (FlatList, tap-to-cycle status, bottom-sheet edit, native date
  picker, native nav). Component library in `app/src/ui/`.

## Scope

- **In the app:** auth (login / change-password / forgot-password-stub / logout),
  Help, Terms, and the groom **digital** track: Dashboard (media gallery, wedding
  date, ranks, attendance stats, guest messages), Guests (list, search/filter,
  status cycle, inline edit, delete, CSV export), Manage (wedding lifecycle),
  **Add-Guest** (single + bulk paste/.vcf/.csv import, dup-phone block),
  **Photographer** (upload library/camera, rename, delete, search, publish w/
  biometric-consent ack), and the **Design editor** (full-parity native form +
  live WebView preview) — see Phase 3 below.
- **Later phases:** push, self-serve signup + payments.
- **Excluded:** landing, admin, driver, all guest-facing public pages, and the
  handwritten track. **No GPS, no camera-for-face.**

## Build status (2026-06-28)

- **Phase 0 — `@dawa/core` extraction: ✅** (`11d1f60`). Frontend 500/500 + backend
  440/440 green.
- **Phase 1 — Expo SDK 52 auth shell: ✅** (`41ce680`). Replaced the Capacitor
  scaffold; expo-router auth gate + native adapters. Metro bundle green.
- **Phase 2 — Groom core screens: ✅** (`b4fecd6`, `1e496e3`, `a837bd8`). Component
  library, nav shell, data context, Help/Terms, Manage, Guests, Dashboard. Android
  Metro bundle green (1044 modules). Native modules: datetimepicker, image-picker,
  file-system, sharing.
- **SDK 52 → 56 upgrade: ✅ (offline-verified)** (`0d56fc7`, 2026-06-28). expo
  ~56.0.12, **React 19.2.3, React Native 0.85.3**, expo-router 56, New Architecture
  (mandatory from SDK 55). Changes: clean reinstall; `expo-file-system` File/Paths
  API migration in `guests.jsx` (legacy `cacheDirectory`/`writeAsStringAsync` removed
  SDK 54+); installed `@expo/vector-icons` (no longer a transitive expo-router dep,
  deprecated → `@react-native-vector-icons/*` is a later follow-up); the Metro
  server-root fix above (`pnpm-workspace.yaml`). **expo-doctor 21/21 clean; ios +
  android Hermes bundles export OK.** Pending: on-device EAS dev-client run (needs the
  user's `eas login`; iOS needs an Apple Developer account). See [[Architecture-Decisions]].

## Phase 3 — remaining groom pages + i18n fix + hardware-rendered design (2026-07-01)

- **i18n English-leak fix.** `makeT` returns the raw key on a miss, so 23 keys the
  app used but the registry lacked rendered as English (`login_username`,
  `pwd_*`, `tab_manage`, …) and defeated the `t(k) || "fallback"` pattern (the key
  is truthy). Fixed by adding the keys to `shared/src/i18n/{ar,he}.js` (+ repointing
  `login_username→login_user`, `login_password→login_pass`) and a **regression
  guard**: `frontend/src/__tests__/i18n/appKeyCoverage.test.js` scans every `t("…")`
  in `app/` and fails if a key is absent from ar+he. Registry now 734 keys, 0 missing.
- **Add-Guest** (`app/(groom)/add-guest.jsx`, push from Guests header). Single add
  (+972 · 9 digits, 2-word name, dup-phone block) + bulk paste (`parseGuestLines`)
  + **.vcf/.csv import** via the built-in `expo-file-system` `File.pickFileAsync`
  → new shared `contactsTextToLines()` (DOM-free sibling of `contactsFileToText`).
  New `addGuest` in `useGroomDigital` w/ optimistic pending-guest poll-race bridge.
- **Photographer** (tab, gated on `canUsePhotographer`). Upload from library +
  **camera** (`ImagePicker.launchCameraAsync` — no `expo-camera` needed), rename,
  delete, search/type-filter, **publish toggle** behind a biometric-indexing consent
  modal (`setPhotographerPublished(uid,true,true)`; server 409s ack_required).
- **Design editor** (tab) — **full-parity native form** driven by a new shared
  schema `@dawa/core/data/digitalDesignSchema.js` (SCALAR/ARRAY/TOGGLE keys +
  status meta, now imported by the **web** editor too, so they can't drift).
  `useDesignEditor` hook mirrors the web buffer+dirty autosave (`patchDesignById`):
  switcher (create/duplicate/delete), edit-language toggle, theme + font pickers,
  all 15 scalars (localized per-lang), date, all 15 toggles, the 5 array editors,
  gallery+hero media, and 3D-envelope + custom-background overrides (hex fields +
  steppers + switches). Submit/cancel for approval.
- **Hardware-rendered preview** (the "use device hardware to render" ask). The
  design page's **👁 Preview** opens `app/(groom)/design-preview.jsx` — a
  `react-native-webview` loading the **new authenticated web route
  `/preview/digital/:designId`** (`frontend/src/pages/DigitalDesignPreviewPage.jsx`)
  which renders the real `<DigitalInvitationView mode="preview">`. Its WebGL 3D
  envelope runs on the **device GPU** inside the WebView = one renderer, zero fork,
  always what the guest sees. Auth: the app seeds the WebView's `localStorage` with
  the groom's tokens via new `tokenManager.peekTokens()` (before content loads), so
  the web apiClient reads the still-**draft** design (which `/d` would refuse).
  Guests stay on the website — the app preview is groom-only.
- **Export & share:** `react-native-view-shot` `captureRef` → `expo-sharing` on the
  preview screen (⤴). New native deps: `react-native-webview`, `react-native-view-shot`.
- **Verified:** app Metro bundle (Android Hermes) ✅, `expo-doctor` 21/21 ✅, web
  `vite build` ✅, i18n coverage+parity + contactsImport/bulkGuests unit tests ✅,
  `/preview/digital/:id` serves the SPA ✅. (Full on-device render still needs the
  user's EAS/Apple accounts; Playwright render check needs Chrome installed.)

## Phase 3b — contacts import + bulk role change (2026-07-01)

- **Add-Guest now imports from device contacts** (`expo-contacts`), **replacing**
  the app's `.vcf/.csv` file picker. "📇 اختيار من جهات الاتصال" →
  `requestPermissionsAsync()` (permission-gated) → `getContactsAsync({ Name,
  PhoneNumbers })` → a searchable **multi-select modal**; checked contacts become
  "Name, Phone" lines feeding the existing `parseGuestLines` preview + `runBulkAdd`.
  Contacts permission string added to `app.config.js`. (The web keeps its
  `contactsFileToText` file import.)
- **Bulk role assignment** in Guests: a "☑ تحديد" header button enters **selection
  mode** (row checkboxes, "select all filtered"); a floating bar → **"تعيين الرتب
  (N)"** opens a sheet with rank chips + an **Add / Replace** toggle. The client
  computes each guest's final `ranks` (Add = union, Replace = the set) and sends
  them as **ONE** `PATCH /digital/:uid/guests` — the server commits a single
  **Firestore WriteBatch chunked at 500** (new `guestStore.patchMany` + route,
  ranks-only via `coerceRanks`), so a bulk edit is one API call, not one per guest.
  New shared `updateManyDigitalGuests` + context `bulkUpdateGuests` (optimistic).
- **Verified:** backend `tsc` + **471/471** unit tests (incl. new `patchMany` +
  500-chunk tests), app Metro bundle ✅, `expo-doctor` 21/21 ✅, i18n guard ✅.

## Publish prep (2026-07-05) — grilled decisions + store readiness

Grilling session before Google Play / App Store submission. Decisions:

- **Scope:** QA + fix + store-prep in-session; the owner runs `eas build`/`eas submit`
  with his own accounts (all three exist: Expo, Apple Developer, Play Console).
- **QA strategy:** hybrid — deep destructive QA against the **Firebase emulator
  stack** (seeded `groom/Groom1234`), then a contained **prod smoke** on a dedicated
  test groom (same account doubles as Apple's App-Review demo login). Android SDK +
  ARM64 emulator installed locally on the Mac (headless cmdline-tools, JDK 21 —
  RN 0.85 Gradle can't run on the machine's JDK 26).
- **Drift fixes shipped** (app was frozen 2026-07-01 while web/backend moved):
  1. Wedding **date+time** picker (web moved to datetime-local; app was date-only
     and silently wiped the hour) — iOS single datetime picker, Android two-step.
  2. **Native photographer upload**: shared `putFileToStorage` was web-XHR-only
     (`xhr.send(plainObject)` with no `size` on native) — added an injectable
     **binary-upload adapter** (`shared/src/adapters/upload.js` + native impl on
     expo-file-system `File.createUploadTask` PUT) + lifted the web's bounded
     queue/3-attempt retry into `shared/src/utils/uploadQueue.js`; app cap 200MB→2GB.
  3. **Design-editor parity**: native starfield section (color/size/opacity), missing
     `stars`/`sealStar` toggles, `starIntensity` default 0.22/step .05, background
     `imageOverlay`/`circle*` controls, and an explicit-false **toggle-persistence
     bugfix** (switches passed `v || null` → OFF never persisted server-side).
- **Store identity/config:** icon + splash generated from the gold دعوة brand seal
  on `#07070a`; privacy-policy URL `https://dawa-aa793.web.app/terms`;
  `ITSAppUsesNonExemptEncryption=false`; permissions hardened at prebuild —
  `READ_CONTACTS` + Arabic `NSContactsUsageDescription` now actually generated
  (the stale on-disk native folders had NEITHER → contacts picker would have
  hard-crashed iOS), `RECORD_AUDIO` dropped (`microphonePermission:false` — camera
  calls are images-only), `WRITE_CONTACTS` + `SYSTEM_ALERT_WINDOW` blocked.
- `extra` URLs in `app.config.js` are now **env-overridable** (`DAWA_API_BASE_URL`,
  `DAWA_SSE_BASE_URL`, `DAWA_WEB_BASE_URL` at config-eval time) for emulator QA.

See [[Architecture-Decisions]], [[Digital Invitations]]. Session log 2026-07-05.

## Publish-prep QA execution (2026-07-06)

Full on-device QA on **both** platforms (iOS 26 sim + Android 36 emulator, built
locally: `expo run:ios`, `expo run:android`). Store hand-off checklist:
`docs/STORE_SUBMISSION.md`.

**Critical bugs found only by running the app** (unit tests + static review missed
them because they're runtime/SDK-native):

1. **Native login was impossible** — Hermes has no WebCrypto, so the shared
   `passwordCrypto` fell back to plaintext, which prod REJECTS
   (`REQUIRE_ENCRYPTED_PASSWORDS`). No store user could ever have logged in. Fixed
   with an injectable password-encryptor adapter + a node-forge RSA-OAEP(SHA-256)
   native impl (byte-compatible with the backend decrypt). Verified `POST /login →
   200` on both iOS and Android.
2. **Contacts picker crashed on SDK 56** — `expo-contacts` deprecated the top-level
   `getContactsAsync` ("will throw in runtime"). The whole "select from contacts"
   flow errored. Fixed by importing from `expo-contacts/legacy`. Verified E2E on
   Android: picker opens → 3 contacts load → multi-select → 2 guests persist.
3. **Contacts dropped Arabic-Indic digit phones** — `toLocalIL` stripped `٠٥٢…`
   instead of converting. Fixed (`toWesternDigits` first) + regression test.
   Verified E2E: a contact saved `٠٥٢١٢٣٤٥٦٧` imports as guest `0521234567`.

**API + static sweep** (workflow): every groom endpoint the app calls hit live
against the emulator — **35/35 pass**; a per-screen static audit surfaced **8
confirmed bugs**, all fixed: lifecycle status read the wrong field (Manage stuck on
"active"), no auth-redirect on mid-session token death, design-editor array-row
auto-persist/poll-reconcile loss, HexField committing backend-invalid colors,
localized-scalar HE-edit dropping the AR value, contacts first-phone-not-mobile,
not-a-groom logout dead-end.

**Verified on-device:** login + session stability (no refresh storms), contacts
full flow, **Android two-step datetime picker** (date→time; time component persists
— `weddingDate` saved with the hour), guest list/add/search, tab nav + RTL (RTL tab
order needs one reload on iOS first-launch — RN `forceRTL` limitation, self-heals),
brand icon/splash. **Gradle note:** local Android build needs Gradle 8.14.x (RN 0.85
+ Gradle 9 `IBM_SEMERU` clash); EAS is unaffected.

**Still owner-gated:** prod smoke on a real test-groom, then `eas build`/`submit`.

See `docs/STORE_SUBMISSION.md`, [[Architecture-Decisions]], [[Authentication]].

## Roadmap (later)

1. **Push:** FCM + APNs (`expo-notifications`), device-token registry, Cloud
   Function triggers.
3. **Self-serve signup + payments:** **Android → Lemon Squeezy** (see [[Payments]]);
   **iOS → Apple StoreKit IAP** with a new receipt-validation endpoint. Packages
   one-time: premium ₪1,500 / VIP ₪2,000. App identity: appId `to.dawa.app`.

## Open follow-ups

- **On-device validation (EAS dev client)** — needs the user's **Expo account** +
  **Apple Developer membership** (iOS). See `docs/mobile-device-build.md`. The
  Capacitor-era CORS follow-up is **obsolete** (native `fetch` sends no Origin →
  passes CORS; iOS builds in the EAS cloud, not on a Mac).
- **Upload-progress spike** — `ENABLE_UPLOAD_PROGRESS=false` (robust `fetch` path)
  until `xhr.upload` progress is verified on a real Android + iOS device.
- **Brand icon/splash** PNGs before store submission (Expo defaults build for now).
- **forgot-password** is a WhatsApp-support stub on native (full SMS-OTP + reCAPTCHA
  reset is a later phase).

See [[Architecture-Decisions]], [[Authentication]], [[Payments]], [[Digital Invitations]].
