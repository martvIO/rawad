# Current State — Dawa Platform

_Last updated: 2026-05-24_

---

## Active Features

### Public
- `/` — Landing page (marketing)
- `/confirm/:groomUsername` — Guest attendance confirmation form (unauthenticated, rate-limited 5/hr/IP)
- `/invite/:token` — Per-guest handwritten-invite link (one-time, 90-day TTL)
- `/invite/digital/:token` — Per-guest digital invite form
- `/d/:groomUsername/:token/*` — Digital invitation public page (SSR'd via `digitalInvitePreview` Cloud Function)

### Portal (authenticated)
- **Admin**: user CRUD, confirmation matching, WhatsApp bulk send, settings, design requests tab
- **Groom**: handwritten flow (guests, delivery stats, proofs, live driver map) + digital flow (Firestore guests, media upload, photographer gallery, design request submission)
- **Driver**: groom picker, delivery list with proof photo upload, map, GPS sharing

---

## Architecture (current)

### Frontend → Backend communication
The frontend has **no Firebase Auth SDK**. All communication is REST:
- `tokenManager.js` — localStorage-backed token lifecycle (stores idToken + refreshToken)
- `apiClient.js` — fetch() wrapper with auto 401-retry, Bearer auth
- `poller.js` — polls REST endpoints on intervals (replaces RTDB `onValue`)
- `src/config/index.js` — centralized env vars, poll intervals, timing constants

### REST API layer (`functions/src/api/`)
Express app mounted as the `api` Cloud Function. 10 resource routers:
- `/auth` — login, logout, refresh, me, send-otp, verify-otp, reset-password
- `/users` — admin CRUD for portal accounts
- `/guests` — guest CRUD (sharded by groomUid)
- `/confirmations` — submit (public), list (admin), patch (admin)
- `/live-locations` — driver GPS (SSE stream)
- `/invites` — create token, submit token
- `/assignments` — driver → groom assignment
- `/proofs` — proof photo upload (multipart)
- `/digital` — digital guest/media/photographer management
- `/settings` — admin settings read/write

### Firebase resources still in use
- **RTDB** — persistent guest data, user profiles, confirmations, invite tokens, live locations, admin settings
- **Firestore** — digital guests, digital media, photographer files
- **Storage** — proof photos, digital media, photographer files
- **Auth** — still the identity provider; the REST API proxies its REST API with `WEB_API_KEY`
- **Cloud Functions v2** — host the Express API + legacy callable functions (some still active)

---

## Changed Files Since Original Rewrite
All files in `src/utils/apiClient.js`, `src/utils/tokenManager.js`, `src/utils/poller.js` are new.
`src/config/index.js` is new.
`src/constants/` directory is new.
`functions/src/api/` directory is new.
`src/pages/DigitalInvitationPage.jsx`, `DigitalInviteForm.jsx`, `DigitalYourPhotos.jsx` are new.
`src/pages/portal/admin/AdminDesignRequests.jsx` is new.
`src/pages/portal/groom/digital/DigitalDesignRequest.jsx` is new.
`src/services/designRequests.js` is new.
`src/components/Skeleton.jsx` is new.
`face-api.js` dependency added (facial recognition).
React Router upgraded to v7 (`react-router-dom@^7.15.1`).

---

## Technical Debt

1. **README.md is stale** — still references localStorage and old credentials. Does not mention the REST API, new routes, or correct run commands.
2. **`re.js` at project root** — Google Cloud reCAPTCHA Enterprise sample, not imported. Safe to delete.
3. **`dawa-aa793-firebase-adminsdk-fbsvc-e42554a05c.json`** — service-account key in root. Should be stored securely and removed from disk.
4. **`face-api.js` dependency** — added but unclear where it's used. Adds ~7 MB to bundle. Needs audit.
5. **Digital invitation known bugs** — see KNOWN_BUGS.md.
6. **Old CLAUDE.md** — has outdated "Current State" section describing the pre-REST architecture.
7. **Vite bundle size** — ~775 KB minified before face-api; could be much larger now.
8. **Legacy callable Cloud Functions** — `functions/src/index.ts` may still export both the new `api` function and the old HTTPS callables. Redundant once all traffic migrated to REST.

---

## Blockers

None currently blocking development. Firebase emulators run cleanly.
`WEB_API_KEY` env var must be set in Cloud Functions environment for auth routes to work in production.

---

## Pending Tasks

See TASKS.md for the full list.

Top priorities:
1. Audit `face-api.js` usage and remove if unused
2. Fix DigitalAddGuest submit hang
3. Update README.md ✓ (done in this session)
4. Delete `re.js`
5. Implement missing test coverage for REST API routes
