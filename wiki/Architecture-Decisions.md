---
date: 2026-05-26
sources:
  - DECISIONS.md
tags: [architecture, decisions, reference]
---

# Architecture Decisions

Index of the closed architectural questions in [[Dawa]] (full rationale in `DECISIONS.md`). Each exists so future engineers don't re-litigate them.

- **No Firebase Auth SDK on the frontend** — REST auth + custom token manager. See [[Authentication]], [[REST API Architecture]].
- **REST API layer instead of direct RTDB/Firestore SDK** — server owns authorization. See [[REST API Architecture]].
- **Polling instead of realtime** (except live GPS via SSE). See [[Polling and Realtime]].
- **RTDB sharded by groomUid** — rules apply to subscribed path. See [[Data Storage Model]].
- **Synthetic email auth** (`username@dawa.local`) — users have no email. See [[Authentication]].
- **JWT custom claims for role + assignment** — unified `role` string replaced legacy `admin: true`. See [[Authentication]], [[Security Model]].
- **Firestore for digital invitations** — RTDB had write-after-login rollback. See [[Digital Invitations]].
- **Inline styles only** — see [[Inline Styling Convention]].
- **No App Check** — rate limiting is the abuse gate instead. See [[Security Model]].
- **Rate limiting: in-memory, per-instance** — resets on cold start; acceptable for low-volume endpoints. See [[Security Model]].
- **Phone OTP password reset** — no email reset links. See [[Authentication]].
- **Server-side face index (not client-only or third-party)** — a Cloud Function indexes every photographer photo's faces once; guests enrol a descriptor server-side for an instant, uncapped gallery. Runtime is `@vladmandic/face-api` on the **tfjs WASM backend** (not tfjs-node — no native binary build risk; speed irrelevant for a background trigger), with the recognition weights kept **byte-identical** to the browser copy so client/server descriptors stay comparable. See [[Face Matching]].
- **Groom mobile app = Expo / React Native** (REVERSED from Capacitor on 2026-06-26, one day after the Capacitor decision), separate `app/` package. The reversal: the user made *genuinely native, smooth UX* a non-negotiable product standard, accepted regardless of measurement. Fully-native (Swift/Kotlin) was rejected because the only thing that would justify it — heavy AR/3D — is the **guest-facing** invitation experience (guests tap a WhatsApp link, they don't install the app), so the groom *management* app has zero native-only requirement. Expo wins here: reuses the DOM-free JS logic, same React model, **EAS builds iOS in the cloud** (dev is on Windows, no Mac), and runs the existing Three.js 3D via `expo-gl`. Business logic now lives in a DOM-free **`@dawa/core`** package: the web imports it via a Vite alias + one-line re-export shims (kept 192 import sites untouched), the Expo app via Metro `extraNodeModules` — **no npm workspace** (avoids disturbing the Firebase Functions deploy + the Windows npm workaround). Platform edges are injected through adapters (storage → `expo-secure-store`, env → `expo-constants`). iOS payments still **Apple StoreKit IAP**, Android **Lemon Squeezy**. Decided 2026-06-26; Phases 0–2 built same day. See [[Mobile App]].
- **Premium 3D invitation envelope rebuilt INSIDE the shared celestial scene** (not a second WebGL canvas/context) — one renderer; the matte-cardstock + wax-seal + cream-card reveal floats in the particle starfield and dissolves straight into it. PBR materials + ACES tone-mapping + AA are enabled on the shared renderer **only when an envelope is present** (the particle `ShaderMaterial` is pinned `toneMapped:false`, so non-envelope pages stay byte-identical). Responsibility split: `envelopeMesh.js` owns geometry/materials/bursts + a returned camera POSE; `celestialEngine.js` owns the clock + camera + glide. Gated to device **tier ≥ 2** (tier-1/no-WebGL/reduced-motion get the 2D fallback). Theme drives a full per-theme envelope palette (`themeToEnvelopePalette`) with contrast clamps. Decided + built 2026-06-26. See [[Digital Invitations]].
- **`blessing` + `welcome` are new authorable `{ar,he}` design fields scoped to the envelope card** (3D + 2D fallback, not the hero/sections) — added through the strict backend allowlist (`sanitize.ts` `localizedScalars` + `DESIGN_FIELDS`); they flow onto invite tokens via the existing `...designFields` snapshot spread (no snapshot-builder change). See [[Digital Invitations]].
