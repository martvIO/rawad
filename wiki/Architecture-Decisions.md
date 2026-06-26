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
- **Groom mobile app = Capacitor wrapper, separate `app/` package** (not a React Native rewrite, not a bundle-everything build) — reuse the web code; a trimmed `MobilePortal` imports only auth + groom views so admin/driver/landing are never bundled. iOS payments use **Apple StoreKit IAP**, Android uses **Lemon Squeezy** (Apple 3.1.1 forbids external IAP for digital goods). Decided 2026-06-25. See [[Mobile App]].
- **Premium 3D invitation envelope rebuilt INSIDE the shared celestial scene** (not a second WebGL canvas/context) — one renderer; the matte-cardstock + wax-seal + cream-card reveal floats in the particle starfield and dissolves straight into it. PBR materials + ACES tone-mapping + AA are enabled on the shared renderer **only when an envelope is present** (the particle `ShaderMaterial` is pinned `toneMapped:false`, so non-envelope pages stay byte-identical). Responsibility split: `envelopeMesh.js` owns geometry/materials/bursts + a returned camera POSE; `celestialEngine.js` owns the clock + camera + glide. Gated to device **tier ≥ 2** (tier-1/no-WebGL/reduced-motion get the 2D fallback). Theme drives a full per-theme envelope palette (`themeToEnvelopePalette`) with contrast clamps. Decided + built 2026-06-26. See [[Digital Invitations]].
- **`blessing` + `welcome` are new authorable `{ar,he}` design fields scoped to the envelope card** (3D + 2D fallback, not the hero/sections) — added through the strict backend allowlist (`sanitize.ts` `localizedScalars` + `DESIGN_FIELDS`); they flow onto invite tokens via the existing `...designFields` snapshot spread (no snapshot-builder change). See [[Digital Invitations]].
