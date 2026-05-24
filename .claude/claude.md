# Dawa (دعوة) — Project Progress

> **Single source of truth lives in [/CLAUDE.md](../CLAUDE.md).** This file
> tracks *progress* (what changed, what's open, what's recently shipped).
> Read both: the root file describes the codebase as it stands now; this
> file describes the history that got it there.

---

## What This App Is

Wedding-invitation distribution app for the Arab/Israeli market.
Three roles: **admin** (manages users + settings), **groom** (manages
guests + invitations), **driver** (delivers handwritten invitations,
uploads proof photos, shares GPS). Supports both handwritten and digital
(WhatsApp link + RSVP form) invitations.

---

## Architecture Today

- **Frontend:** React 18 + Vite + react-router-dom v7. 100% inline styles. Single central state hook ([usePortalState.js](../src/hooks/usePortalState.js)) exposed via [PortalContext](../src/context/PortalContext.jsx).
- **Frontend → backend:** REST over `fetch`. No Firebase client SDK. All requests go through [apiClient.js](../src/utils/apiClient.js) + [tokenManager.js](../src/utils/tokenManager.js); list subscriptions use [poller.js](../src/utils/poller.js).
- **Backend:** Express app mounted as the `api` Cloud Function ([functions/src/api/](../functions/src/api/)). Routers under `/auth`, `/users`, `/guests`, `/confirmations`, `/digital`, `/invites`, `/assignments`, `/proofs`, `/live-locations`, `/settings`.
- **Storage:** RTDB for users/guests/confirmations/locations, Firestore for digital invitations, Firebase Storage for proof photos + media. The backend uses `firebase-admin` to talk to all three.
- **Auth:** Synthetic email `username@dawa.local` + password. `/api/auth/login` proxies to Firebase Identity Toolkit REST and returns `{idToken, refreshToken, uid, role, username}`. Custom claims (`role`, `username`, `assignedGrooms`) drive every authorization check.

---

## Status — 2026-05-22

### Recently shipped

| Commit | What |
|---|---|
| `6ad2ae5` | Logout flow + unauthed-routes catch-all; no more "stuck on auth loading" on logout. |
| `fdf992f` | Login loading state + post-login `navigate()`. Fixed "spinner doesn't redirect" bug. |
| `7d2db1e` | Centralized constants (`config/index.js`, `constants/roles.js` etc.). |
| `e9a81a1` | `.gitignore` for `postman/`. |
| `d06159f` | `stripApiPrefix` middleware + tests (handles `/api` prefix from Hosting rewrite vs direct function URL). |
| `a5acd21` | firebase-admin → v13.10.0. |
| `e168b16` | Unit tests for `apiClient`, `poller`, `tokenManager`. |
| `dbeb4e3`, `8d51364` | Refactors for readability. |
| `fed9d38` | **REST migration**: implemented `apiClient`, `tokenManager`, `poller`. This is the cut-over commit — the Firebase client SDK stopped being used here. |
| Today's audit | Added `fetchWithTimeout` to `apiClient` (30s default, 2 min uploads), AbortController on digital uploads, `currentUid` guard on `DigitalAddGuest` submit, request_timeout / abort-aware toast messages. Wrote `docs/AUDIT-2026-05-22.md` + `docs/USER-FLOWS.md`. Rewrote both `CLAUDE.md` files. |

### Currently open

- **Audit deliverables (just shipped)** — see [docs/AUDIT-2026-05-22.md](../docs/AUDIT-2026-05-22.md) for the per-bug findings + verification.
- **`role: null` from `/auth/login`** — when the RTDB profile is missing the `role` field, the backend returns `role: null` and the frontend lands the user on `/portal/groom` where `RoleGuard` rejects (because `userType !== "groom"`). Not breaking but ugly. Long-term fix: server should refuse to issue a session for an unprovisioned account.
- **`firebase.js` empty shell** — kept so any lingering imports don't crash module load. Safe to delete once a grep confirms zero imports.
- **`re.js` at project root** — Google reCAPTCHA Enterprise sample, not imported. Can be deleted.
- **Vite bundle ~775 KB** — consider route-based code splitting if it grows further.

### Earlier history

- **Removed App Check / reCAPTCHA Enterprise** (project-wide) because it conflicted with non-Firebase auth flows. Rate limiting + Phone Auth's invisible reCAPTCHA remain the abuse gates.
- **JWT schema migration** — replaced binary `admin: true` claim with single `role: "admin"|"driver"|"groom"` + `username`. Rules + Functions + client all migrated.
- **Service consolidation** — `_helpers.js` exposes `subscribeList()` (poll + cb) so every service file uses the same pattern.
- **Design tokens** — palette pulled into [src/styles/theme.js](../src/styles/theme.js); ~254 hex literals replaced.
- **Centralized logger** — [src/utils/logger.js](../src/utils/logger.js); 13 catch blocks now route through it.
- **Guest invite lifecycle** — `not-sent → pending → confirmed`. `submitGuestInvite` / `submitConfirmation` stamp `confirmedAt` and write `/confirmations` row. AdminSendTab filters out confirmed guests; AdminConfirmationsTab shows them.
- **Storage 403 fix** — `storage.rules` for `digitalMedia/{groomUid}` + `photographerFiles/{groomUid}` were correct in source for several commits but never deployed. Deployed manually.
- **tsc incremental cache fix** — [scripts/build-functions.cjs](../scripts/build-functions.cjs) wipes `functions/lib/` + `functions/tsconfig.tsbuildinfo` before every tsc invocation so `firebase deploy` doesn't prompt for stale export deletion.

---

## Security Model

Three rings, all server-side:

| Layer | Where | Check |
|---|---|---|
| Express middleware | [functions/src/api/middleware/auth.ts](../functions/src/api/middleware/auth.ts) | `requireAuth` verifies Bearer token; `requireAdmin` checks `claims.role === "admin"`. |
| RTDB rules | [database.rules.json](../database.rules.json) | `auth.token.role === 'admin'`, ownership, schema validators. |
| Storage rules | [storage.rules](../storage.rules) | Proof photos require `assignedGrooms[groomUid] === true`. |

JWT custom claims (set by `/api/users` Create/Update endpoints + `/api/assignments/*`): `{ role, username, assignedGrooms?: { [groomUid]: true } }`.

`RoleGuard` ([src/components/RoleGuard.jsx](../src/components/RoleGuard.jsx)) is client-side only — never authoritative.

---

## Where stuff lives

| Subsystem | Frontend service | Backend route |
|---|---|---|
| Auth | [src/services/auth.js](../src/services/auth.js) | [functions/src/api/routes/auth.ts](../functions/src/api/routes/auth.ts) |
| Users (admin) | [src/services/users.js](../src/services/users.js) | [functions/src/api/routes/users.ts](../functions/src/api/routes/users.ts) |
| Guests | [src/services/guests.js](../src/services/guests.js) | [functions/src/api/routes/guests.ts](../functions/src/api/routes/guests.ts) |
| Confirmations | [src/services/confirmations.js](../src/services/confirmations.js) | [functions/src/api/routes/confirmations.ts](../functions/src/api/routes/confirmations.ts) |
| Settings | [src/services/adminSettings.js](../src/services/adminSettings.js) | [functions/src/api/routes/settings.ts](../functions/src/api/routes/settings.ts) |
| Invites | [src/services/invites.js](../src/services/invites.js) | [functions/src/api/routes/invites.ts](../functions/src/api/routes/invites.ts) |
| Assignments | [src/services/assignments.js](../src/services/assignments.js) | [functions/src/api/routes/assignments.ts](../functions/src/api/routes/assignments.ts) |
| Proofs | [src/services/proofs.js](../src/services/proofs.js) | [functions/src/api/routes/proofs.ts](../functions/src/api/routes/proofs.ts) |
| Live locations | [src/services/liveLocations.js](../src/services/liveLocations.js) | [functions/src/api/routes/liveLocations.ts](../functions/src/api/routes/liveLocations.ts) |
| Digital invitation | [src/services/digitalInvitation.js](../src/services/digitalInvitation.js) | [functions/src/api/routes/digital.ts](../functions/src/api/routes/digital.ts) |
| Design requests | [src/services/designRequests.js](../src/services/designRequests.js) | (same router — `digital.ts`) |

---

## Verifying a deploy

```powershell
# Probe deployed API health
curl -sS https://dawa-aa793.web.app/api/health
# Expect: { "ok": true, "uptimeSeconds": N }

# Probe login validation (no creds)
curl -sS -X POST https://dawa-aa793.web.app/api/auth/login `
  -H "Content-Type: application/json" -d "{}"
# Expect: { "error": "missing_fields" } HTTP 400

# Probe login (bad creds)
curl -sS -X POST https://dawa-aa793.web.app/api/auth/login `
  -H "Content-Type: application/json" -d '{\"username\":\"x\",\"password\":\"x\"}'
# Expect: { "error": "invalid_credentials" } HTTP 401
```

If those three pass, the backend is healthy. Frontend bugs are then in the
React tree, not at the API layer.

---

## Tests

- `npm run test:unit` — 404 passing as of 2026-05-22. No emulator needed.
- `npm test` — Integration tests against the Firebase Database emulator. Requires Java 21.

The integration suite is the legacy `@firebase/rules-unit-testing` setup
and is left in place to prove the RTDB rules still pass.

---

## Decisions log (still applicable)

| Topic | Decision | Reason |
|---|---|---|
| Build tool | Vite + React 18 | Fast HMR, already in use. |
| Routing | react-router-dom v7 | URL-driven tabs across admin/driver/groom. |
| Styling | Inline styles + theme tokens | No CSS framework dependency; cheap to maintain. |
| Auth | Synthetic email `username@dawa.local` + password | Users don't have real emails. |
| Password reset | Phone OTP via Firebase Phone Auth REST | Users have phone numbers. |
| Data layout | Sharded by groomUid (`/guestsByGroom/{uid}`, `/liveLocationsByGroom/{uid}`) | RTDB rules require `.read` at subscription path. |
| Frontend ↔ backend | REST over `fetch` (no Firebase client SDK) | Simpler dependency surface; tighter authorization (server-side only); avoids App Check pain. |
| Subscriptions | Polling via `createPoller` | Cheap, predictable, no long-lived connections. Live driver GPS uses SSE because it needs sub-second updates. |
| TypeScript (functions) | `module: Node16` + `moduleResolution: node16` | Matches Node 20 runtime. |
