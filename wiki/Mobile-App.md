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
  status cycle, inline edit, delete, CSV export), Manage (wedding lifecycle).
- **Later phases:** Add-Guest (+ contact import), Photographer, Design editor (+
  the 3D preview via react-three-fiber/expo-gl), push, self-serve signup + payments.
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

## Roadmap (later)

1. **Add-Guest + Photographer + Design editor** (+ image-picker/contacts/3D).
2. **Push:** FCM + APNs (`expo-notifications`), device-token registry, Cloud
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
