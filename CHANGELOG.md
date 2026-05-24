# Changelog — Dawa

_Append-only. Most recent changes at the top. Format: date, category, description._

---

## 2026-05-24

**docs:** Created full project documentation scaffold from codebase inspection
- Added: PROJECT_CONTEXT.md, AI_RULES.md, FILE_INDEX.md, DECISIONS.md, KNOWN_BUGS.md, TASKS.md, CHANGELOG.md, API_CONTRACTS.md, DATABASE_SCHEMA.md, TESTING.md
- Added: docs/architecture.md, docs/security.md, docs/deployment.md, docs/auth_flow.md, docs/testing_strategy.md, docs/firebase_structure.md
- Added: examples/good_patterns.md, examples/bad_patterns.md
- Added: memory/current_state.md, memory/completed.md, memory/future_ideas.md, memory/session_logs.md
- Updated: README.md (was stale — now reflects REST API, correct run commands, current routes)

---

## 2026-05-22

**feat:** REST API migration — Express app on Cloud Functions
- Added `functions/src/api/` — Express app with 10 resource routers: auth, users, guests, confirmations, live-locations, invites, assignments, proofs, digital, settings
- Added `src/utils/tokenManager.js` — localStorage-backed token lifecycle
- Added `src/utils/apiClient.js` — fetch() wrapper with Bearer auth + 401-retry
- Added `src/utils/poller.js` — polling replacement for RTDB onValue subscriptions
- Added `src/config/index.js` — centralized env vars and constants
- Added `src/constants/` — roles.js, storageKeys.js, matchStatuses.js
- Removed Firebase Auth SDK and RTDB/Firestore SDKs from frontend bundle

**feat:** Digital invitation public pages
- Added `/d/:groomUsername/:token/*` → DigitalInvitationPage (via `digitalInvitePreview` Cloud Function)
- Added `/invite/digital/:token` → DigitalInviteForm
- Added `DigitalYourPhotos.jsx` — public photographer gallery

**feat:** Design requests feature
- Added `src/services/designRequests.js`
- Added `src/pages/portal/groom/digital/DigitalDesignRequest.jsx`
- Added `src/pages/portal/admin/AdminDesignRequests.jsx`

**feat:** Skeleton component for loading states
- Added `src/components/Skeleton.jsx`

**chore:** Upgraded react-router-dom to v7

---

## 2026-05-21

**fix:** firebase.json — added `/d/**` hosting rewrite to `digitalInvitePreview` Cloud Function

---

## 2026-05-20

**feat:** Digital invitation feature (partial)
- Grooms can add digital guests (Firestore `digitalGuests/{uid}/guests`)
- Grooms can upload background media files
- Photographer can upload files
- Storage rules deployed for `digitalMedia/{groomUid}` and `photographerFiles/{groomUid}`

**fix:** tsc incremental cache causing stale exports
- `scripts/build-functions.cjs` now wipes `functions/lib/` + `functions/tsconfig.tsbuildinfo` before every tsc run

---

## 2026-05-19

**refactor:** Centralize constants and improve code readability
- Added `src/styles/theme.js` design tokens (C, ROLE, S)
- Replaced 254 hardcoded hex literals across 32 files with token references

**feat:** Guest invite lifecycle (not-sent → pending → confirmed)
- `REPLY_STATUS` map + `replyStateOf()` in `src/data/status.js`
- `submitGuestInvite` writes `confirmedAt` + `/confirmations` row
- `submitConfirmation` runs phone-match unconditionally and patches `confirmedAt`
- AdminSendTab: confirmed guests hidden, amber pending pill for sent-but-not-confirmed
- GroomGuests: 3-state reply pill per guest
- i18n keys: `reply_notSent`, `reply_pending`, `reply_confirmed` in ar.js + he.js

---

## 2026-05-16

**feat:** Admin User Manager full CRUD
- `AdminUserManager.jsx` replaces `AdminUsersTab.jsx`
- Create, edit, delete all three role types
- Cloud Functions: `createPortalUser`, `updatePortalUser`, `deletePortalUser`, `adminSetPassword`

**feat:** Confirmation matching — fuzzy GREEN/RED/Unknown classification
- `src/utils/matchUtils.js` — phone normalization, Dice/Jaccard fuzzy matching
- `AdminConfirmationsTab.jsx` — real-time feed with colored match badges
- `EditConfirmationModal.jsx` — admin edit + propagate to guest record

---

## 2026-05-15

**security:** JWT claim migration
- Replaced `admin: true` binary claim with `{ role: "admin"|"driver"|"groom", username }`
- Updated RTDB rules at 14 sites
- Updated Storage rules
- `createPortalUser`, `setAdminClaim`, `updatePortalUser` all write new shape
- Client reads `claims?.role === "admin"` (not `claims?.admin`)
- `migrateClaims.js` script to backfill all existing users

**feat:** Route URL migration
- `/confirm/:groomUsername` replaces `?form=GROOM`
- `/invite/:token` — per-guest handwritten invite link
- `/portal/*` — role-based portal routing
- Back-compat rewrite in `App.jsx` for old `?form=` links

**feat:** Password reset via phone OTP
- `PasswordResetFlow.jsx` — 2-step component
- `resetPassword` Cloud Function — phone-OTP verified

---

## 2026-04 — Initial Firebase Rewrite

**feat:** Complete rewrite of 4,858-line `App.jsx` into multi-file React project
- Firebase Auth (synthetic email), RTDB, Firestore, Storage, Cloud Functions v2
- Default-deny RTDB rules, rate limiting, audit log, HSTS/CSP headers
- Multi-role portal: admin, groom, driver
- Live driver GPS (RTDB), Leaflet maps
- Proof photo upload (Firebase Storage)
