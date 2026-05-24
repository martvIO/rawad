# Architecture Decisions — Dawa

_Why the project is shaped the way it is. Each decision records the reasoning so future engineers don't re-litigate closed questions._

---

## No Firebase Auth SDK on the frontend

**Decision:** The React app does not import `firebase/auth`. All auth is done via REST calls to `/api/auth/login`, `/api/auth/refresh`, etc. Tokens are stored in `localStorage` via `tokenManager.js`.

**Why:** Removes the ~300 KB Firebase Auth SDK from the client bundle. Keeps the API backend-agnostic — the frontend doesn't know or care what identity provider the backend uses. The `WEB_API_KEY` (which Firebase SDK would also need) stays server-side only.

**Trade-off:** We own the token lifecycle (refresh scheduling, expiry, storage), which is more code. The `tokenManager.js` + `apiClient.js` combination is that code.

---

## REST API layer instead of direct RTDB/Firestore SDK

**Decision:** The frontend talks to an Express app on Cloud Functions (`functions/src/api/`) via REST, not directly to RTDB or Firestore.

**Why:** Moves all data-access authorization to the server. RTDB rules are complex to maintain for non-admin access patterns. REST routes are easy to test, mock, and version. The Firebase SDKs added significant bundle weight.

**Trade-off:** Polling (15–30s) replaces real-time RTDB `onValue`. For most data (guest lists, confirmations) this latency is acceptable. Live driver GPS uses SSE to preserve real-time feel.

---

## Polling instead of real-time subscriptions (for most data)

**Decision:** `poller.js` polls REST endpoints on an interval rather than maintaining persistent WebSocket/SSE connections for everything.

**Why:** Each open SSE or WebSocket connection counts against Cloud Functions concurrency. A groom's portal might have 5–6 tabs subscribed simultaneously. Polling is cheaper and simpler for data that doesn't need sub-second freshness.

**Exception:** Live driver GPS locations are SSE (handled in `services/liveLocations.js`) because drivers' positions must update every second.

---

## RTDB sharded by groomUid

**Decision:** Guest data lives at `/guestsByGroom/{groomUid}/{guestId}` rather than a flat `/guests/{guestId}`.

**Why:** Firebase RTDB `.read` rules apply to the path you subscribe to — you can't subscribe to `/guests` and then filter by a field in the rules. Sharding by groomUid means a groom can `.read` their own subtree and a driver can `.read` the same subtree once assigned.

---

## Synthetic email authentication

**Decision:** Firebase Auth uses `username@dawa.local` as the email address. Users log in with just `username + password`.

**Why:** The target users (grooms, drivers) don't have email addresses in the system and don't need them. Phone-based OTP is used for password reset instead.

---

## JWT custom claims for role + assignment

**Decision:** Every Firebase Auth user carries `{ role: "admin"|"driver"|"groom", username }` as custom claims. Drivers additionally carry `{ assignedGrooms: { [groomUid]: true } }`.

**Why:** Custom claims are the only place RTDB rules and Storage rules can read per-user authorization data without a database round-trip. The `assignedGrooms` claim is what gates proof photo uploads in `storage.rules`.

**Single claim shape:** The legacy `admin: true` boolean was retired in favor of the unified `role` string. All checks use `auth.token.role === 'admin'`.

---

## Firestore for digital invitations (not RTDB)

**Decision:** Digital guest lists, media, and photographer files use Firestore, not RTDB.

**Why:** RTDB had silent write rollback issues on first write after login (likely a race with the new-claim propagation). Firestore proved more reliable for the write-after-login pattern the digital flow requires.

---

## Inline styles only

**Decision:** No CSS framework (Tailwind, Bootstrap), no CSS modules, no styled-components. Every component uses inline `style={}` props. Palette tokens are in `src/styles/theme.js`.

**Why:** The original 4,858-line `App.jsx` used inline styles exclusively. Migrating to a CSS framework would have introduced regressions without adding value. The design tokens in `theme.js` prevent inconsistency without requiring a build-time CSS step.

---

## No App Check

**Decision:** Firebase App Check was removed from the project.

**Why:** App Check caused false rejections in certain browser environments and on mobile WebViews that users commonly use. The public `submitConfirmation` endpoint is rate-limited (5/hr per IP) as the abuse gate instead.

---

## Rate limiting: in-memory, per-function-instance

**Decision:** `rateLimit.ts` uses an in-memory sliding window. There is no shared Redis or Firestore rate-limit store.

**Why:** Simple, zero-latency, zero-cost. The trade-off is that limits reset on each cold start and aren't shared across Cloud Function instances.

**Acceptable for:** Low-volume endpoints where per-instance limits are sufficient (confirmation form: 5/hr/IP, login: 10/hr/IP).

---

## Phone OTP password reset

**Decision:** Password reset uses Firebase Phone Auth OTP (not email reset links).

**Why:** Users don't have real emails. Every user has a phone number. The flow: enter phone → receive SMS → enter code → new password. The `POST /auth/reset-password` route verifies the phone-auth ID token's `phone_number` claim matches a portal user's `phoneE164` field before resetting.
