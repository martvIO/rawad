# Dawa groom app — device builds (EAS)

The Expo app lives in [`app/`](../app). Day-to-day development is offline-verifiable
(`npx expo start` / `npx expo export`), but to run on a **real phone** — and to do
the true end-to-end test (login against prod, secure-store persistence, image
upload, etc.) — you build a **custom dev client** with EAS (Expo's cloud build
service). This works from Windows; iOS is built in the cloud, no Mac needed.

## What you must provide (one-time)

1. **An Expo account** (free) — sign up at https://expo.dev, then `eas login`.
2. **Apple Developer Program membership** ($99/yr) — required for *any* iOS device
   install (EAS handles signing/provisioning interactively on first iOS build).
   Android needs nothing beyond the Expo account.
3. *(Before store submission, not before testing)* brand **icon + splash** PNGs.
   The app currently ships Expo's default icon/splash so dev/preview builds work;
   add `app/assets/icon.png` (1024×1024) + a splash and wire them into
   `app/app.config.js` (`icon`, `android.adaptiveIcon`, the `expo-splash-screen`
   plugin) before a Play Store / App Store release.

## One-time setup

```bash
npm i -g eas-cli          # or use npx eas-cli ... everywhere below
eas login                 # your Expo account
cd app
eas build:configure       # writes the EAS project id into app.config extra
```

## Build a dev client

```bash
cd app

# Android (cloud build — no Android Studio needed). Produces an installable APK:
eas build --profile development --platform android

# iOS (cloud build; needs the Apple Developer account):
eas build --profile development --platform ios
#   - register your test device when prompted, or: eas device:create
```

When the build finishes, EAS shows a QR code / download link. Install the artifact
on the device, then start Metro and connect the dev client to it:

```bash
cd app
npx expo start --dev-client
```

Scan the QR with the installed dev client (not Expo Go — the app uses custom native
modules: secure-store, image-picker, datetimepicker).

## Other profiles

- `--profile preview` — internal release build for QA sharing (APK on Android,
  ad-hoc/TestFlight on iOS). No dev client; behaves like a release build.
- `--profile production` — store-ready (AAB on Android, App Store on iOS),
  `autoIncrement` bumps the build number.

## On-device checklist (Phase-1 + Phase-2 exit test)

- Log in with a groom account against the prod API; confirm the token persists
  across a cold start (kill + reopen).
- Navigate the bottom tabs (Dashboard · Guests · Manage) + the header kebab
  (Help / Terms / Logout); toggle the language.
- Guests: search/filter, tap a status badge to cycle, edit a guest, delete one,
  export CSV (share sheet opens).
- Dashboard: pick a photo/video → it uploads and appears in the gallery; set the
  wedding date; add/remove a rank.
- Manage: postpone (date picker), then resume; start a cancel + undo it.

### Upload-progress spike

`app/src/portal/useGroomDigital.jsx` has `ENABLE_UPLOAD_PROGRESS = false` — the
gallery uses the robust `fetch` upload path (no progress bar, just a spinner)
because `XMLHttpRequest.upload` progress is unreliable on RN/Android. Once you can
test on a device: flip it to `true`, upload a large video on both Android and iOS,
and confirm `onProgress` fires intermediate fractions. If it does, keep it on; if
Android is flaky, leave it off.
