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
