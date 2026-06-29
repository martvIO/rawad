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
- **3D celestial envelope is WebGL-only; no 2D fallback** (2026-06-29) — the immersive intro envelope + particle world render via three.js (`components/digital/celestial/`), gated by `useDeviceCapability`. Policy now leans INTO the 3D: only an explicit **reduced-motion / data-saver opt-in, or no WebGL at all** drops to tier 0 (CSS ambience floor + **no envelope at all**). Software GPUs and in-app browsers (incl. FB/Instagram) still **attempt** the 3D at the lowest quality tier, with the runtime FPS guard as the safety net. The old 2D wax-seal `EnvelopeIntro` fallback was **deleted**. This fixed software-WebGL desktops being shunted to a worse 2D intro. The same shared gate also drives the landing-page hero backdrop. Accepted trade-off: hard in-app browsers can occasionally mis-render WebGL with no auto visual-glitch detection. See [[Digital Invitations]], [[Visual Design System]].
- **Luxury PBR envelope restored over the flat interim build** (2026-06-29) — the celestial intro envelope is the full PBR build (`MeshStandard`/`MeshPhysical`, lights as group children, equirectangular studio env-map, ACES tone-mapping, gold-foil arabesque flap, satin lining, glossy wax seal, baked bilingual calligraphy card), restored from the merged `feat/arch-tech-debt-seams` work (`2f56adf`/`3a9345a`) after an interim commit (`eb3ca55`) had stripped it to flat `MeshBasicMaterial`. It renders **full PBR on every WebGL-capable device and is never downgraded during the reveal** (`celestialEngine.js` skips the FPS guard while `mode !== "scroll"`). Accepted trade-off: weak phones may stutter — no auto-fallback for the envelope itself; the particle field keeps its FPS safety net only after hand-off. Recoloured **white-default + theme-aware** (`utils/themeToEnvelopePalette.js`) with **foil pinned to metallic gold on every theme**; the card bakes the couple names (so the DOM couple-names reveal was dropped) and the centre satin ribbon was removed. See [[Digital Invitations]], [[Visual Design System]].
