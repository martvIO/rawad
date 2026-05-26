---
date: 2026-05-26
sources:
  - DECISIONS.md
  - PROJECT_CONTEXT.md
  - API_CONTRACTS.md
tags: [polling, sse, realtime, concept]
---

# Polling and Realtime

[[Dawa]] replaces realtime RTDB `onValue` subscriptions with **REST polling** for most data, via `utils/poller.js` (15–30s intervals). Part of the [[REST API Architecture]].

**Why:** each open SSE/WebSocket counts against Cloud Functions concurrency, and a groom's portal may have several tabs subscribed at once. Polling is cheaper and simpler for data that doesn't need sub-second freshness (guest lists, confirmations).

## Exception: live driver GPS uses SSE
Driver positions must update every second, so `services/liveLocations.js` uses Server-Sent Events:
- `GET /live-locations/:groomUid` (SSE stream) — groom/admin
- `POST /live-locations` — driver publishes a fix (`/liveLocationsByGroom/{groomUid}/{driverUid}` in RTDB, updated every 1s)
- Client ignores stale entries (>30s old).

## The polling tax: optimistic UI
Because the UI reads from a 15s poller, mutations don't show until the next tick unless the handler also updates local state. This caused a recurring class of bugs — see [[Optimistic UI Pattern]]. `createPoller` also needs an `onError` callback, or a network failure can hang the app silently (see [[Known Bugs]] BUG-R006).
