# دعوة — Groom Mobile App (Capacitor)

Native **Android + iOS** app for the **groom** experience only. It wraps the
existing `frontend/` React code in a [Capacitor](https://capacitorjs.com) shell
and ships **only** the groom portal + auth + Terms + Help — **not** the landing
page, admin portal, or driver portal (those stay on the web).

This is **Phase 1 (Foundation)** of the phased rollout:

| Phase | Scope | Status |
|---|---|---|
| **1 — Foundation** | Capacitor wrapper, groom portal + auth + Terms + new Help page, login-only (existing accounts) | **this package** |
| 2 — Push | FCM + APNs, device-token registry, Cloud Function triggers (RSVP / photos-ready / delivered) | planned |
| 3 — Self-serve signup + payments | new signup flow, Android Lemon Squeezy, iOS StoreKit IAP + receipt-validation provisioning | planned |

---

## How it works

- **One codebase.** This package has its **own** Vite + Capacitor project but
  imports screens/services/hooks/styles/i18n from the sibling `frontend/`
  package via the `@app` path alias (see [vite.config.js](./vite.config.js)).
- **Groom-only by construction.** [src/MobilePortal.jsx](./src/MobilePortal.jsx)
  imports only the auth screens + `GroomPortalView`. The admin/driver portals and
  landing page are never imported, so Rollup never bundles them. (Verified: the
  build emits no `aws-amplify`/`recharts`/admin/driver chunks.)
- **Auth.** `PortalProvider` hydrates tokens from `localStorage` on mount, which
  persists in the Capacitor WebView — no code change needed. (A future hardening
  step can move tokens to the OS Keychain/Keystore via a secure-storage plugin.)
- **Feature flags inherited.** `FEATURES.physical` is `false`, so the app shows
  the **digital** track + type-select (same as the live web app).

## Develop

```bash
cd app
npm install                 # also requires `npm install --prefix ../frontend`
cp .env.example .env        # public URLs; edit if needed
npm run build               # produces dist/ (groom-only bundle)
npm run preview             # serve the built app in a browser to smoke-test
```

## Run on a device / emulator

```bash
npm run build && npx cap sync android
npx cap open android        # opens Android Studio → Run on emulator/device
# or, with an emulator/device already attached:
npm run cap:android
```

### iOS — requires macOS

iOS **cannot be built on Windows.** On a Mac with Xcode + CocoaPods:

```bash
npx cap add ios             # generate the ios/ project (one-time)
npm run build && npx cap sync ios
npx cap open ios            # opens Xcode → set signing team → Run
```

## ⚠️ Backend requirement (CORS)

The WebView origins must be allowed by the API. Add to the Cloud Functions
`ALLOWED_ORIGINS` env (comma-separated), then redeploy functions:

```
capacitor://localhost,http://localhost,https://localhost
```

Until then, API calls from the app fail CORS (login won't work on-device).

## App identity (permanent)

- **Bundle / app id:** `to.dawa.app` — **never change after first publish.**
- **Display name:** "دعوة" — set per-platform after generating the native
  projects: Android `android/app/src/main/res/values/strings.xml` (`app_name`),
  iOS `Info.plist` (`CFBundleDisplayName`). The Capacitor `appName` is kept ASCII
  ("Dawa") to avoid Gradle/Xcode project-name issues.

## What's committed

The `android/` native project is committed; build artifacts
(`android/app/build`, `.gradle`, `dist/`, `node_modules/`) are gitignored. The
`ios/` project is generated on a Mac and committed from there.
