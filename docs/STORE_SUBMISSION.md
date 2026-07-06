# Dawa Mobile — Store Submission Checklist (Google Play + App Store)

Owner-run hand-off for publishing the groom app (`app/`, Expo SDK 56, bundle id
`to.dawa.app`). The app code, native config, permissions, and store assets are
QA'd and ready (see [[Mobile App]] publish-prep). The steps below need YOUR
accounts and cannot be automated: Expo, Apple Developer, Google Play Console.

Prereqs you confirmed you have: **Expo account · Apple Developer Program · Play Console.**

---

## 0. One-time setup

```bash
npm i -g eas-cli
cd app
eas login                      # your Expo account
eas init                       # writes extra.eas.projectId into app.config.js — COMMIT that change
```

Apple: create the app in App Store Connect (bundle id `to.dawa.app`), note the
**ascAppId** and your **appleTeamId**. Play: create the app in Play Console
(package `to.dawa.app`), create a **service-account JSON** with the "Release
manager" role and save it as `app/secrets/play-sa.json` (git-ignored).

---

## 1. Production builds (EAS cloud — no Mac/Windows toolchain needed)

`eas.json` already has a `production` profile (`autoIncrement: true`, Android
`app-bundle`). Version/build numbers are EAS-managed (`appVersionSource: remote`).

```bash
eas build --profile production --platform ios       # ~15–25 min; prompts to create iOS credentials
eas build --profile production --platform android    # produces the .aab
```

The build runs its own clean prebuild from `app.config.js`, so the permission
hardening (READ_CONTACTS present; RECORD_AUDIO / WRITE_CONTACTS / SYSTEM_ALERT_WINDOW
removed; Arabic usage strings; `ITSAppUsesNonExemptEncryption=false`) is applied
automatically.

---

## 2. Submit

Fill `app/eas.json` → `submit.production`:

```jsonc
"submit": {
  "production": {
    "ios":     { "ascAppId": "<App Store Connect app id>", "appleTeamId": "<team id>" },
    "android": { "serviceAccountKeyPath": "./secrets/play-sa.json", "track": "internal" }
  }
}
```

```bash
eas submit -p ios --latest
eas submit -p android --latest
```

> **Play new-account note:** a brand-new *personal* Play developer account must run
> a **closed test with ≥12 testers for 14 days** before it can promote to production.
> Start the closed track NOW (`track: "internal"` → then a closed track) so the clock runs.

---

## 3. Store listing content

- **Language:** Arabic primary, Hebrew secondary (the app is AR/HE RTL).
- **App name:** دعوة (Dawa)
- **Subtitle / short description:** إدارة وتوزيع دعوات الأفراح — قائمة المدعوين، الردود، وصور المصوّر.
- **Privacy policy URL:** `https://dawa-aa793.web.app/terms`
- **Support / contact:** the WhatsApp number in `app.config.js` extra (`972529348797`).
- **Apple App Review demo account:** a **prod test groom** login (provide username +
  password in App Review notes) — the app is groom-only, so review needs a groom.

### Screenshots (capture from the QA build)
- **iPhone 6.9"** — required size **1320 × 2868**. Capture on an **iPhone 17 Pro Max**
  simulator (the plain iPhone 17's 1206×2622 is NOT an accepted App Store size).
- **Android phone** — 2+ screenshots, 320–3840 px (emulator screencaps are fine) +
  **feature graphic 1024×500** (`app/assets/store/play-feature-1024x500.png`) +
  **512×512 icon** (`app/assets/store/play-icon-512.png`).
- Suggested screens: login, dashboard, guest list, add-guest (contacts import),
  design editor, design preview (3D envelope).

---

## 4. App Privacy / Data safety questionnaires

Answer from the app's ACTUAL data flows:

| Data | Collected? | Use | Linked to user | Shared |
|---|---|---|---|---|
| **Contacts** | Yes (read on device; only the **selected** entries' name+phone are sent) | Build the guest list | Yes | No |
| **Phone numbers / names (guests)** | Yes | Invitations / RSVP | Yes | No |
| **Photos & videos** | Yes (uploaded to the couple's gallery) | Show guests / photographer album | Yes | No |
| **Camera** | Yes | Capture invitation / album media | — | — |
| **Face data (biometric)** | Yes — **only** when the groom publishes the photographer gallery, behind an explicit in-app consent (AWS Rekognition face-indexing so guests find their photos) | Photo-finder | Yes | Processed by AWS as a sub-processor |

- Apple: declare **Sensitive Info / Biometric** for the face-indexing path; everything
  else maps to Contacts / User Content / Identifiers.
- Play Data safety: mirror the table; **Contacts access** needs a declaration (no
  special-access form required for READ_CONTACTS).
- **Encryption export:** already answered — `ITSAppUsesNonExemptEncryption=false`
  in `app.config.js` (HTTPS + the RSA password envelope are exempt). No CCATS needed.
- **Content rating:** Everyone / 3+.

---

## 5. After approval

- Smoke-test the store build against **production** (default URLs — no env overrides):
  login, guest list loads, add+delete a guest, open the design preview, logout.
- Watch `firebase functions:log --project dawa-aa793` for auth/permission errors.

---

## Notes carried over from QA (already handled in code)

- **Native login was broken** before this pass (Hermes has no WebCrypto → plaintext
  passwords → prod rejects them). Fixed with a node-forge RSA adapter — the store
  build CAN log in. Verified against the emulator + on the iOS simulator.
- **Contacts import** dropped Arabic-Indic digit phones — fixed + regression-tested.
- Android local builds need Gradle 8.14.x (RN 0.85 + Gradle 9 `IBM_SEMERU` clash);
  **EAS is unaffected** (it manages its own toolchain). This only matters for local
  `expo run:android`.
