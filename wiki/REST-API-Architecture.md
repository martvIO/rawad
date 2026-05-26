---
date: 2026-05-26
sources:
  - DECISIONS.md
  - PROJECT_CONTEXT.md
  - API_CONTRACTS.md
tags: [architecture, rest, firebase, concept]
---

# REST API Architecture

The [[Dawa]] frontend talks to an **Express app on Cloud Functions v2** (`functions/src/api/`, TypeScript, Node 20) via REST — **not** directly to RTDB/Firestore SDKs.

## The core decision: no Firebase SDK on the frontend
The React app does not import `firebase/auth` or the database SDKs. Instead the client uses a custom layer:
- `utils/tokenManager.js` — token lifecycle (localStorage-backed). See [[Authentication]].
- `utils/apiClient.js` — `fetch()` wrapper with Bearer auth + 401-retry
- `utils/poller.js` — polling helper replacing RTDB `onValue`. See [[Polling and Realtime]].

**Why:** removes the ~300 KB Firebase SDK from the client bundle, keeps the API backend-agnostic, and keeps `WEB_API_KEY` server-side only. **Trade-off:** the client owns the token lifecycle (more code) and uses polling instead of realtime for most data.

## Why REST instead of direct SDK access
Moves all data-access authorization to the server. RTDB rules are complex to maintain for non-admin access patterns; REST routes are easy to test, mock, and version.

## API surface
Base URL: `https://us-central1-dawa-aa793.cloudfunctions.net/api` (prod uses same-origin `/api/**` Firebase Hosting rewrite). 10 resource routers: `/auth`, `/users`, `/guests`, `/confirmations`, `/invites`, `/assignments`, `/live-locations`, `/proofs`, `/digital`, `/settings`. Full detail in [[API Contracts]].

Authorization is enforced server-side via `assertAdmin()` and `requireAuth` middleware — see [[Security Model]].
