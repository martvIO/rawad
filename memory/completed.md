# Completed Work — Dawa Platform

_Append-only. Most recent entries at the top._

---

## 2026-05-24 — Documentation Scaffold

Created all project documentation files from codebase inspection:
- `memory/` — current_state, completed, future_ideas, session_logs
- Root docs — PROJECT_CONTEXT, AI_RULES, FILE_INDEX, DECISIONS, KNOWN_BUGS, TASKS, CHANGELOG
- Technical docs — API_CONTRACTS, DATABASE_SCHEMA, TESTING
- `docs/` — architecture, security, deployment, auth_flow, testing_strategy, firebase_structure
- `examples/` — good_patterns, bad_patterns
- Updated `README.md`

---

## 2026-05 — REST API Migration

Replaced all Firebase SDK direct calls with a REST API layer:
- `functions/src/api/` — Express app with 10 resource routers
- `src/utils/tokenManager.js` — localStorage-backed token lifecycle
- `src/utils/apiClient.js` — fetch wrapper with 401-retry
- `src/utils/poller.js` — polling-based subscription replacement
- `src/config/index.js` — centralized env config

---

## 2026-05 — Digital Invitation Features

- `/d/:groomUsername/:token/*` — public digital invitation page
- `/invite/digital/:token` — digital invite form
- `DigitalYourPhotos.jsx` — public photographer gallery
- `DigitalDesignRequest.jsx` — groom requests custom design
- `AdminDesignRequests.jsx` — admin views/manages design requests
- `src/services/designRequests.js` — design request service layer

---

## 2026-05 — Route URL Migration

Rewrote from `?form=GROOM` query-param routing to clean URL routing:
- `/confirm/:groomUsername`
- `/invite/:token`
- `/portal/*`
- Back-compat effect in App.jsx rewrites old `?form=` links

---

## 2026-05 — JWT Claim Migration

Replaced `admin: true` binary claim with `{ role, username }` on every user.
Migrated RTDB rules, Storage rules, all Cloud Functions, client hooks.
Migration script: `functions/scripts/migrateClaims.js`.

---

## 2026-05 — Guest Invite Lifecycle

Added not-sent → pending → confirmed state to guest records.
`submitGuestInvite` writes `confirmedAt` + a `/confirmations` row.
`submitConfirmation` runs phone-match unconditionally and patches `confirmedAt`.
REPLY_STATUS map + `replyStateOf()` in `src/data/status.js`.

---

## 2026-05 — Storage Rules Deployment

Deployed `storage.rules` for `digitalMedia/{groomUid}` and `photographerFiles/{groomUid}`.

---

## 2026-05 — Admin User Manager

Full CRUD for all portal account types (admin/groom/driver).
Cloud Functions: `createPortalUser`, `updatePortalUser`, `deletePortalUser`, `adminSetPassword`.

---

## 2026-05 — Confirmation Matching

Fuzzy phone/name/address matching in `src/utils/matchUtils.js`.
GREEN / RED / Unknown classification with reason badges.
Admin edit via `EditConfirmationModal`.

---

## 2026-04 — Initial Firebase Rewrite

Rewrote 4,858-line `App.jsx` (localStorage) into multi-file React project with Firebase backend.
Firebase Auth, RTDB, Firestore, Storage, Cloud Functions v2.
Default-deny RTDB rules, role-based access, rate limiting, audit log, CSP headers.
