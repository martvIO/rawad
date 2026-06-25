---
date: 2026-06-25
tags: [mobile, capacitor, android, ios, roadmap]
---

# Mobile App (Groom)

Native **Android + iOS** app for the **groom** experience only, built by wrapping
the existing [[Dawa]] `frontend/` React app in **Capacitor**. Decided in a
grilling session on 2026-06-25 and Phase 1 built the same day on branch
`feat/groom-mobile-app`.

## Scope

- **In the app:** groom portal (digital track + type-select; handwritten stays
  behind `FEATURES.physical`), auth (login / forgot-password / password-change /
  logout), `/terms`, and a **new Help/Support page**.
- **Excluded:** landing page, admin portal, driver portal, and all guest-facing
  public pages (`/confirm`, `/invite`, `/d/...`, `/g/...`, `/pay`) — guests keep
  using the website via WhatsApp links. The groom gets an in-app "preview my
  invitation" affordance (planned) that opens `/d/...` in the system browser.
- **Permissions:** notifications (push, Phase 2) + photo/file access (photographer
  uploads + CSV/.vcf import) only. **No GPS** (the groom never broadcasts
  location — `GroomLiveMap` only *watches* drivers over SSE), no camera-for-face
  (guest-only).

## Key decisions

- **Capacitor wrapper, not a React Native rewrite** — reuse ~100% of the web code.
- **Separate `app/` package** (the repo's reserved folder) with its own Vite +
  Capacitor project that imports shared screens from `frontend/src` via the
  `@app` alias. A trimmed `MobilePortal` imports only auth + `GroomPortalView`, so
  admin/driver/landing are never bundled (verified: no aws-amplify/recharts/
  admin/driver chunks in the build).
- **Public App Store + Google Play** distribution.
- **App identity:** appId `to.dawa.app` (permanent), display name "دعوة".
- **Auth storage:** reuse `localStorage` (persists in the Capacitor WebView; no
  change to the shared token manager). OS Keychain/Keystore is a future hardening.
- **Online-only** (no offline cache/queue) with good error states.

## Phased rollout

1. **Foundation (built 2026-06-25):** Capacitor wrapper + groom portal + auth +
   Terms + Help; login-only (existing accounts). Branch `feat/groom-mobile-app`.
2. **Push:** FCM + APNs, device-token registry, Cloud Function triggers
   (new RSVP / photos-ready / invitation-delivered).
3. **Self-serve signup + payments:** new signup flow; **Android → Lemon Squeezy**
   (see [[Payments]]); **iOS → Apple StoreKit IAP** with a new server endpoint
   that validates the receipt and provisions the groom account (the current
   `order_created` webhook only handles Lemon Squeezy). Packages are one-time:
   premium ₪1,500 / VIP ₪2,000.

## Open follow-ups

- **Backend CORS:** add the Capacitor WebView origins
  (`capacitor://localhost,http://localhost,https://localhost`) to Cloud Functions
  `ALLOWED_ORIGINS` and redeploy — until then on-device login fails CORS.
- **iOS build is macOS-only** (Xcode/CocoaPods) — generate `ios/` on a Mac.
- App icons/splash, Android display-name localization, store accounts + listings.

See [[Authentication]], [[Payments]], [[Security Model]], [[Digital Invitations]].
