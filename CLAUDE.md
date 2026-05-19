# Dawa (دعوة) — Codebase Reference

## 1. What This Project Is

**Dawa** ("Invitation" in Arabic) is a wedding-invitation management and distribution platform for the Arab/Israeli market. Grooms manage a list of guests; physical invitations are delivered by drivers who photograph proof of delivery; an admin oversees all users and operations. The app also supports **digital invitations** (WhatsApp-based per-guest invite links with GPS location collection).

The app was originally a single 4,858-line `App.jsx` backed by `localStorage`. It has been rewritten as a production Firebase application with multi-role authentication, real-time data, Cloud Functions, and full security hardening.

There are three user roles:
- **Admin** — manages users, monitors confirmations, edits guest data, sends WhatsApp messages, controls settings.
- **Groom** — manages their own guest list, monitors delivery proofs and live driver locations, sends per-guest digital invite links.
- **Driver** — picks up a groom's delivery route, marks guests delivered, uploads proof photos, shares GPS location.

---

## 2. Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite |
| Routing | react-router-dom v6 |
| Styling | 100% inline styles (no CSS framework); design tokens in `src/styles/theme.js` |
| Language / i18n | Custom `makeT(lang)` factory — Arabic (default) + Hebrew |
| Firebase (client) | Auth, Realtime Database (RTDB), Firestore, Storage, Functions |
| Firebase (server) | Cloud Functions v2 (TypeScript, Node 20) |
| Map library | Leaflet 1.9.4 (injected lazily from CDN via `useLeaflet`) |
| Testing | Vitest + `@firebase/rules-unit-testing` against the Firebase Emulator (79 passing) |
| Build scripts | Windows-compatible `scripts/build-functions.cjs`, `scripts/build-vite.cjs` |
| Deployment | Firebase Hosting (also Netlify-ready via `netlify.toml`) |
| Auth pattern | Synthetic email `username@dawa.local` + password — no real email needed |
| Password reset | Phone SMS OTP via Firebase Phone Auth → `resetPassword` Cloud Function |

---

## 3. Project Structure

```
rawad/
├── src/
│   ├── main.jsx                      — Entry point; mounts React tree in BrowserRouter
│   ├── App.jsx                       — Top-level routes; owns language state
│   ├── firebase.js                   — Firebase SDK init + emulator wiring
│   ├── assets/
│   │   └── brandSvg.js               — SVG string for the Dawa brand logo
│   ├── components/
│   │   ├── AddressInput.jsx          — City + street + house fields with autocomplete
│   │   ├── BrandLogo.jsx             — Renders the SVG brand mark
│   │   ├── CityField.jsx             — Searchable city dropdown (Israeli cities)
│   │   ├── EditConfirmationModal.jsx — Admin modal: edit a confirmation record
│   │   ├── EditGuestModal.jsx        — Admin/groom modal: edit a guest record
│   │   ├── EditUserModal.jsx         — Admin modal: edit a portal user account
│   │   ├── GroomMultiSelect.jsx      — Multi-select picker for groom usernames
│   │   ├── GuestMapModal.jsx         — Full-screen map modal showing guest pin
│   │   ├── LangSwitcher.jsx          — AR / HE toggle button
│   │   ├── LiveMap.jsx               — Leaflet map component for live driver locations
│   │   ├── LogoutConfirm.jsx         — Confirm-before-logout dialog
│   │   ├── MapPickerInline.jsx       — Draggable Leaflet map for the invite form
│   │   ├── PasswordResetFlow.jsx     — Phone OTP reset flow (2-step component)
│   │   ├── PasswordRules.jsx         — Visual checklist of password strength rules
│   │   ├── PhoneInput.jsx            — Phone field with E.164 formatting
│   │   ├── PhotoViewer.jsx           — Lightbox for proof photos
│   │   ├── RoleGuard.jsx             — Client-side role gate (convenience only)
│   │   ├── StreetField.jsx           — Street name input with suggestions
│   │   └── Toast.jsx                 — Top-of-screen transient notification
│   ├── context/
│   │   └── PortalContext.jsx         — Runs usePortalState once; exposes it to all portal views
│   ├── data/
│   │   ├── cities.js                 — Static list of Israeli cities
│   │   ├── inviteContent.js          — WhatsApp message templates (premium/standard)
│   │   ├── sampleGuests.js           — Dev-only seed data
│   │   └── status.js                 — STATUS and REPLY_STATUS maps + replyStateOf()
│   ├── hooks/
│   │   ├── useGeolocation.js         — GPS watchPosition lifecycle + RTDB publish/subscribe
│   │   ├── useLeaflet.js             — Lazily injects Leaflet CSS + JS from CDN
│   │   └── usePortalState.js         — All portal state, handlers, Firebase subscriptions
│   ├── i18n/
│   │   ├── ar.js                     — Arabic string map
│   │   ├── he.js                     — Hebrew string map
│   │   └── index.js                  — makeT(lang) factory + STRINGS registry
│   ├── pages/
│   │   ├── ConfirmationForm.jsx      — Public guest confirmation form (/confirm/:groomUsername)
│   │   ├── InviteForm.jsx            — Per-guest invite form (/invite/:token)
│   │   ├── LandingPage.jsx           — Public marketing landing page (/)
│   │   └── portal/
│   │       ├── LoginScreen.jsx       — Login form (shown when not authed)
│   │       ├── LogoutPage.jsx        — Logs out then redirects to /
│   │       ├── Portal.jsx            — Auth guard + role routing entry
│   │       ├── admin/
│   │       │   ├── AdminPortal.jsx           — Admin shell: header + tab navigation
│   │       │   ├── AdminUserManager.jsx      — Full CRUD for portal accounts
│   │       │   ├── AdminSendTab.jsx          — WhatsApp bulk-send tab
│   │       │   ├── AdminConfirmationsTab.jsx — View + match + edit confirmations
│   │       │   └── AdminSettingsTab.jsx      — Edit WhatsApp template + form link
│   │       ├── driver/
│   │       │   ├── DriverPortal.jsx          — Driver shell: groom picker guard + tabs
│   │       │   ├── DriverPickGroom.jsx       — Groom-selection screen shown first
│   │       │   ├── DriverDeliveryList.jsx    — Delivery route with status + photo upload
│   │       │   ├── DriverMap.jsx             — Map of guests for the selected groom
│   │       │   ├── DriverShareLocation.jsx   — GPS sharing tab (pick grooms + toggle)
│   │       │   └── SharedCities.jsx          — City-grouped summary of shared guests
│   │       └── groom/
│   │           ├── GroomPortalView.jsx       — Routes to type-select / handwritten / digital
│   │           ├── GroomTypeSelect.jsx       — Choose handwritten or digital invite type
│   │           ├── GroomHandwrittenShell.jsx — Shell for the handwritten invite flow
│   │           ├── GroomDashboard.jsx        — Stats + recent activity for handwritten
│   │           ├── GroomGuests.jsx           — Guest list for handwritten flow
│   │           ├── GroomAddGuest.jsx         — Add-guest form (handwritten)
│   │           ├── GroomGuestsMap.jsx        — Map view of all guests with coords
│   │           ├── GroomLiveMap.jsx          — Live driver GPS map tab
│   │           ├── GroomProofs.jsx           — View delivery proof photos
│   │           └── digital/
│   │               ├── DigitalPortal.jsx     — Digital invite shell: 4 tabs
│   │               ├── DigitalDashboard.jsx  — Stats + background media upload
│   │               ├── DigitalGuests.jsx     — Digital guest list + status cycling
│   │               ├── DigitalAddGuest.jsx   — Add guest to digital list
│   │               └── DigitalPhotographer.jsx — Photographer file upload/gallery
│   ├── services/
│   │   ├── _helpers.js               — subscribeList() + callable() with auto-retry
│   │   ├── adminSettings.js          — subscribeSettings, saveSettings (/adminSettings)
│   │   ├── assignments.js            — assignDriverToGroom, subscribeAssignmentsFor
│   │   ├── auth.js                   — signIn, signOut, subscribeAuth, subscribeIdToken, forceRefreshToken
│   │   ├── confirmations.js          — subscribeConfirmations, submitConfirmation, updateConfirmation
│   │   ├── digitalInvitation.js      — Firestore-backed digital guests, media, photographer files
│   │   ├── guests.js                 — subscribeAllGuests, subscribeGuestsForGroom, addGuest, updateGuest, removeGuest
│   │   ├── invites.js                — createGuestInvite, submitGuestInvite, subscribeInviteToken
│   │   ├── liveLocations.js          — publishMyFix, clearMyLocation, subscribeDriversForGroom
│   │   ├── proofs.js                 — uploadProofBlob, proofDownloadUrl, dataUrlToBlob
│   │   └── users.js                  — subscribeUsers, subscribeGroomProfiles, createPortalUser, deletePortalUser, updatePortalUser, adminSetPassword
│   ├── styles/
│   │   ├── GlobalStyle.jsx           — Global CSS (keyframes, base reset, card + button classes)
│   │   └── theme.js                  — Design tokens: C (colors), ROLE (role accents), S (style fragments)
│   └── utils/
│       ├── geo.js                    — extractCoords, toEmbedUrl, wazeLink, getCurrentFix, extractCity
│       ├── logger.js                 — logErr, log, logWarn (tagged [dawa], silent in prod)
│       ├── matchUtils.js             — normalizePhoneForMatching, phonesEqual, classifyAll (fuzzy matching)
│       ├── password.js               — PASSWORD_RULES, evaluatePassword, isStrongPassword
│       ├── phone.js                  — toIntlPhone, telLink, validatePhone, isPlaceholderPhone
│       ├── storage.js                — load, save, removeKey (localStorage wrappers)
│       └── validation.js             — validateName
│
├── functions/src/
│   ├── index.ts                      — Admin SDK init + re-exports all Cloud Functions
│   ├── helpers.ts                    — assertAdmin, isUsername, isE164, isRole, isFiniteInRange, normalisePhone, DawaClaims
│   ├── users.ts                      — createPortalUser, deletePortalUser, setAdminClaim
│   ├── updateUser.ts                 — updatePortalUser (patches Auth + RTDB + claims atomically)
│   ├── adminSetPassword.ts           — adminSetPassword (admin resets another user's password)
│   ├── assignments.ts                — assignDriverToGroom (stamps assignedGrooms claim)
│   ├── confirmations.ts              — submitConfirmation (public, rate-limited)
│   ├── attachLocation.ts             — attachConfirmationLocationToGuest
│   ├── invite.ts                     — createGuestInvite, submitGuestInvite
│   ├── resetPassword.ts              — resetPassword (phone-OTP verified)
│   ├── audit.ts                      — writeAudit (internal helper for /audit log)
│   └── rateLimit.ts                  — allow() in-memory per-key rate limiter
│
├── functions/scripts/
│   ├── seedAdmin.js                  — Bootstrap first admin account (run once)
│   ├── inspectUser.js                — Dump Auth record + RTDB profile + claims
│   ├── resetUser.js                  — Reset password + optionally stamp admin claim
│   ├── fixAdminClaim.js              — One-off repair for missing role claim
│   └── migrateClaims.js              — Backfill {role, username} on all Auth users
│
├── database.rules.json               — RTDB default-deny security rules
├── storage.rules                     — Firebase Storage security rules
├── firebase.json                     — Firebase project config (hosting, functions, db, storage, CSP headers)
├── netlify.toml                      — Netlify build config + SPA fallback
└── .env.production                   — VITE_USE_EMULATORS=0 for production builds
```

---

## 4. Features in Detail

### Public-Facing

**Landing Page (`/`)**
Marketing page with hero, about, services, and pricing sections. Scroll-spy nav highlights the active section. Links to the portal and confirmation form.

**Guest Confirmation Form (`/confirm/:groomUsername`)**
Unauthenticated form guests fill in to confirm wedding attendance. Fields: name (full), phone, city, optional street + house number, optional GPS coordinates. Submits via the `submitConfirmation` Cloud Function which is rate-limited at 5 requests/hour per IP.

**Per-Guest Invite Form (`/invite/:token`)**
Opened from a personalized WhatsApp link generated by the groom. Pre-fills the guest's name and phone from the token. Includes a draggable Leaflet map picker alongside the GPS button. Adds a "note for driver" field. Token is one-time use (marked used after submit); re-opening shows an "already submitted" screen.

### Admin Portal (`/portal/admin/*`)

**User Manager (`AdminUserManager`)**
Full CRUD for portal accounts. Create groom, driver, or admin accounts with username, password, phone (optional), display name. Filter list by role. Edit any field via `EditUserModal`. Delete with inline confirmation. Backed by `createPortalUser`, `updatePortalUser`, `deletePortalUser`, `adminSetPassword` Cloud Functions.

**Send Tab (`AdminSendTab`)**
Bulk WhatsApp-link sender. Admin selects a groom, picks guests, and opens WhatsApp with the configured message template. Per-guest invite links (via `createGuestInvite`) are generated here with a "Send via WhatsApp" button.

**Confirmations Tab (`AdminConfirmationsTab`)**
Real-time feed of all confirmation submissions. Auto-classifies each submission as GREEN (phone + name + address matched), RED (phone matched but name/address differ), or Unknown (phone not in any guest list). Admin can edit any record with `EditConfirmationModal`. Saving patches both `/confirmations/{id}` and the matched guest in `/guestsByGroom`.

**Settings Tab (`AdminSettingsTab`)**
Editable WhatsApp message body template and confirmation form link. Persisted to `/adminSettings` in RTDB.

### Driver Portal (`/portal/driver/*`)

**Pick Groom (`DriverPickGroom`)**
Required first step. Driver selects which groom's delivery route to serve. Routes through the `assignDriverToGroom` Cloud Function which stamps `assignedGrooms` into the driver's JWT claim (required by Storage rules).

**Delivery List (`DriverDeliveryList`)**
Grouped by city, with status per guest (pending / en-route / delivered). Driver marks guests delivered and uploads a proof photo (camera capture on mobile). Photo stored to `proofs/{groomUid}/{guestId}/{ts}.jpg` in Firebase Storage.

**Map (`DriverMap`)**
Leaflet map of all guests with coordinates for the selected groom. Tap a pin to open navigation (Waze / Google Maps / Apple Maps).

**Share Location (`DriverShareLocation`)**
Driver selects which grooms to share their live GPS with, then starts broadcasting. Publishes a GPS fix every second to `/liveLocationsByGroom/{groomUid}/{driverUid}` in RTDB.

**Shared Cities (`SharedCities`)**
Read-only city-grouped list of all guests across the currently-shared groom(s).

### Groom Portal (`/portal/groom/*`)

**Type Select (`GroomTypeSelect`)**
Choose between "Handwritten invitation" (traditional) or "Digital invitation" (WhatsApp link). Selection persisted to `localStorage` and remembered on next login.

**Handwritten Flow**

- **Dashboard (`GroomDashboard`)** — delivery stats (total, delivered, remaining), recent activity.
- **Guests (`GroomGuests`)** — paginated guest list with status, phone, address, reply badge. Inline edit via `EditGuestModal`. Delete with confirmation.
- **Add Guest (`GroomAddGuest`)** — form: name, phone, city, optional street/house/area. Creates guest in `/guestsByGroom/{groomUid}`.
- **Guests Map (`GroomGuestsMap`)** — Leaflet map of all guests who have coordinates.
- **Live Map (`GroomLiveMap`)** — Real-time map of drivers currently sharing their location with this groom.
- **Proofs (`GroomProofs`)** — Gallery of all delivery proof photos, grouped by guest.

**Digital Flow (Firestore-backed)**

- **Dashboard (`DigitalDashboard`)** — total guest count, attended/absent breakdown, background media upload (image/GIF/video).
- **Guests (`DigitalGuests`)** — guest list with 3-state status cycling (pending → attending → absent). Inline edit/delete.
- **Add Guest (`DigitalAddGuest`)** — add a guest to the Firestore digital guest list.
- **Photographer (`DigitalPhotographer`)** — Upload and display photographer files (images/video) for the groom.

---

## 5. What Each File Does

### `src/main.jsx`
Application entry point. Mounts `<App>` wrapped in `<StrictMode>` and `<BrowserRouter>` into `#root`.

### `src/App.jsx`
Root component. Owns `lang` state and the `t(key)` translation function. Defines the four top-level routes: `/`, `/confirm/:groomUsername`, `/invite/:token`, `/portal/*`. Contains a back-compat effect that rewrites legacy `?form=GROOM` query strings to `/confirm/GROOM`.

**Used by:** `main.jsx` renders it. It renders `LandingPage`, `ConfirmationForm`, `InviteForm`, `Portal`.

### `src/firebase.js`
Initializes all Firebase SDK modules (`auth`, `db` RTDB, `firestore`, `functions`, `storage`) from `VITE_*` env vars. Sets browser-local auth persistence. When `VITE_USE_EMULATORS=1`, connects every SDK to the local emulator suite.

**Used by:** every service file imports the named exports (`auth`, `db`, `firestore`, `functions`, `storage`).

---

### Services

### `src/services/_helpers.js`
Two shared patterns extracted from every service file:

- `subscribeList(path, cb, mapItem?)` — wraps RTDB `onValue` into a flat array; degrades to `cb([])` on error.
- `callable(name)` — wraps `httpsCallable`; unwraps `.data`; retries once after `forceRefreshToken()` on `permission-denied`/`unauthenticated` (handles stale claims after promotion).

**Used by:** `guests.js`, `users.js`, `confirmations.js`, `invites.js`, `adminSettings.js`.

### `src/services/auth.js`
- `signIn(username, password)` — converts to `username@dawa.local` and calls Firebase `signInWithEmailAndPassword`.
- `signOutNow()` — Firebase `signOut`.
- `forceRefreshToken()` — calls `getIdToken(true)` on the current user.
- `fetchProfile(uid)` — reads `/users/{uid}` from RTDB with one retry on `PERMISSION_DENIED` (RTDB auth listener lag).
- `subscribeAuth(cb)` — listens to `onAuthStateChanged`; enriches each user with their RTDB profile + JWT claims.
- `subscribeIdToken(cb)` — listens to `onIdTokenChanged` for live claim refresh (role changes, new assignments).
- `sendPasswordResetCode(phoneE164, containerId)` — starts Phone Auth OTP flow.
- `confirmPasswordResetCode(result, code)` — confirms OTP code.

**Used by:** `_helpers.js` (forceRefreshToken), `usePortalState.js` (all functions).

### `src/services/guests.js`
- `subscribeAllGuests(cb)` — admin listener on `/guestsByGroom` (two-level snap).
- `subscribeGuestsForGroom(groomUid, cb)` — per-groom listener; used by both grooms and drivers.
- `addGuest(groomUid, guest)` — `push` to `/guestsByGroom/{groomUid}`.
- `updateGuest(groomUid, id, patch)` — `update` a guest node.
- `removeGuest(groomUid, id)` — `remove` a guest node.

**Used by:** `usePortalState.js` (subscribes and mutates), `AdminConfirmationsTab` (indirect via portal state).

### `src/services/users.js`
- `subscribeUsers(cb)` — admin-only list of all portal users from `/users`.
- `subscribeGroomProfiles(cb)` — public list of groom usernames from `/groomProfiles` (visible to drivers).
- `patchUserInRTDB(uid, patch)` — direct RTDB write for fields that don't need Auth sync (e.g. `displayName`).
- `upsertGroomProfile(uid, data)` / `removeGroomProfile(uid)` — maintain the `/groomProfiles` mirror.
- `createPortalUser`, `deletePortalUser`, `updatePortalUser`, `adminSetPassword`, `setAdminClaim`, `callResetPassword` — all call Cloud Functions via `callable()`.

**Used by:** `usePortalState.js`.

### `src/services/confirmations.js`
- `subscribeConfirmations(cb)` — live feed of `/confirmations`.
- `submitConfirmation` — Cloud Function callable (public, rate-limited).
- `attachConfirmationLocationToGuest` — Cloud Function callable (admin-only).
- `updateConfirmation(id, patch)` — direct RTDB `update` (admin writes only, enforced by rules).

**Used by:** `usePortalState.js` (subscribe + update), `ConfirmationForm.jsx` (submit), `AdminConfirmationsTab.jsx` (indirect).

### `src/services/liveLocations.js`
- `publishMyFix(driverUid, driverDisplayName, fix, shareWith)` — writes GPS fix to `/liveLocationsByGroom/{groomUid}/{driverUid}` for each groom in `shareWith`.
- `clearMyLocation(driverUid, formerShareWith)` — nulls out all those nodes.
- `subscribeDriversForGroom(groomUid, cb)` — listens to `/liveLocationsByGroom/{groomUid}`.

**Used by:** `useGeolocation.js` (all three functions).

### `src/services/proofs.js`
- `uploadProofBlob(groomUid, guestId, blob, contentType)` — uploads to `proofs/{groomUid}/{guestId}/{ts}.jpg`.
- `proofDownloadUrl(path)` — `getDownloadURL` for a storage path.
- `dataUrlToBlob(dataUrl)` — converts a `data:` URL from `<input type=file>` to a `Blob`.

**Used by:** `usePortalState.js` (upload proof on delivery), `GroomProofs.jsx` (display).

### `src/services/invites.js`
- `createGuestInvite` — Cloud Function callable (groom/admin); returns `{ token, expiresAt }`.
- `submitGuestInvite` — Cloud Function callable (unauthenticated guest).
- `subscribeInviteToken(token, cb)` — public RTDB listener for `/inviteTokens/{token}`.

**Used by:** `AdminSendTab.jsx` (create), `InviteForm.jsx` (subscribe + submit).

### `src/services/adminSettings.js`
- `subscribeSettings(cb)` — listens to `/adminSettings`.
- `saveSettings(patch)` — `update` on `/adminSettings` (admin-only by rules).

**Used by:** `usePortalState.js`.

### `src/services/assignments.js`
- `assignDriverToGroom(groomUsername)` — calls `assignDriverToGroom` Cloud Function.
- `subscribeAssignmentsFor(driverUid, cb)` — reads `/driverAssignments/{driverUid}`.

**Used by:** `DriverPickGroom.jsx` (assign), `usePortalState.js` (subscribe).

### `src/services/digitalInvitation.js`
All Firestore-backed (not RTDB) — chosen because RTDB had silent rollback issues on write after login.

- `subscribeDigitalGuests(groomUid, cb)` — Firestore `onSnapshot` on `digitalGuests/{uid}/guests`.
- `addDigitalGuest`, `updateDigitalGuest`, `removeDigitalGuest` — Firestore CRUD.
- `subscribeDigitalMedia(groomUid, cb)` — listens to `digitalMedia/{uid}`.
- `saveDigitalMediaFile(groomUid, file)` — uploads to Storage + writes Firestore doc.
- `removeDigitalMedia(groomUid)` — deletes Firestore doc.
- `subscribePhotographerFiles(groomUid, cb)` — listens to `photographerFiles/{uid}/files`.
- `uploadPhotographerFile(groomUid, file)` — uploads to Storage + adds Firestore doc.
- `removePhotographerFile(groomUid, fileId)` — deletes Firestore doc.

**Used by:** `DigitalDashboard.jsx`, `DigitalGuests.jsx`, `DigitalAddGuest.jsx`, `DigitalPhotographer.jsx`.

---

### Hooks

### `src/hooks/usePortalState.js`
The **single source of truth** for all portal state. Called once inside `PortalProvider`. Subscribes to Firebase Auth, RTDB users, guests, confirmations, settings, and driver assignments. Exposes every handler (login, logout, addGuest, deleteUser, uploadProof, assignDriver, etc.) to all role views via context.

Key outputs:
- `authed`, `authReady`, `userType`, `currentUid`, `currentUsername`
- `myGuests`, `allGuests`, `users`, `groomProfiles`, `confirmations`
- `driverServingGroom`, `driverServingGroomUid`
- All form state and handlers (add guest, delete user, mark delivered, etc.)

**Used by:** `PortalContext.jsx` wraps it; every portal page uses `usePortal()` to read from it.

### `src/hooks/useGeolocation.js`
Manages all GPS functionality for both drivers and grooms.

- Driver side: `watchPosition` → publishes to RTDB every second while `driverIsSharing`.
- Groom side: `watchPosition` for their own marker; subscribes to `subscribeDriversForGroom` to show drivers on the map.
- Stale-filters drivers older than 30 seconds.
- Returns `saveLiveLocation`, `stopLiveLocation`, `requestGroomLocation`, `driversSharingWithMe`, `groomMapMarkers`, etc.

**Used by:** `usePortalState.js` (composed in, result spread into portal state).

### `src/hooks/useLeaflet.js`
Lazily injects Leaflet 1.9.4 CSS + JS from CDN on first use. Returns a boolean `ready` that flips to `true` once `window.L` is available.

**Used by:** `LiveMap.jsx`, `GuestMapModal.jsx`, `MapPickerInline.jsx`.

---

### Context

### `src/context/PortalContext.jsx`
Thin context wrapper. `PortalProvider` runs `usePortalState(props)` once and puts the result in context. `usePortal()` is the consumer hook — throws if used outside the provider.

**Used by:** `Portal.jsx` wraps the whole portal subtree; every portal page/component calls `usePortal()`.

---

### Utils

### `src/utils/matchUtils.js`
Pure functions for admin confirmation matching.

- `normalizePhoneForMatching(raw)` — strips non-digits, drops `+972`/`00972`/`0` prefixes → bare national number.
- `phonesEqual(a, b)` — compare two phone strings after normalization.
- `classifyAll(confirmations, guestsByGroom)` — classifies each confirmation as GREEN / RED / unknown with reason badges.
- Uses Dice bigram coefficient + Jaccard word-set for name/address fuzzy matching.

**Used by:** `usePortalState.js` (via `classifyAll`), `AdminConfirmationsTab.jsx`.

### `src/utils/logger.js`
Tagged `[dawa]` console wrapper. Silent in production unless `VITE_DEBUG=1`.

- `log(...)`, `logWarn(...)`, `logErr(tag, e)`

**Used by:** every service file, every hook's catch block, several page components.

### `src/utils/phone.js`
- `toIntlPhone(raw)` — converts any phone to international digits (no `+`) for `wa.me` URLs.
- `telLink(phone)` — builds a `tel:` link.
- `validatePhone(raw, t)` — validates E.164 or 10-digit local format; returns localized error or `null`.
- `isPlaceholderPhone(p)` — detects auto-generated `+1202555xxxx` placeholder phones.

**Used by:** `usePortalState.js`, `ConfirmationForm.jsx`, `InviteForm.jsx`, `PhoneInput.jsx`.

### `src/utils/validation.js`
- `validateName(raw, t)` — requires at least two words (first + family name).

**Used by:** `usePortalState.js`, `ConfirmationForm.jsx`, `InviteForm.jsx`.

### `src/utils/password.js`
- `PASSWORD_RULES` — array of `{ id, check }` objects (min 8 chars, uppercase, lowercase, digit).
- `evaluatePassword(pwd)` — returns `{ id, passed }[]` for the `<PasswordRules>` component.
- `isStrongPassword(pwd)` — boolean shortcut. Mirror of `isStrongPassword` in `functions/src/helpers.ts`.

**Used by:** `usePortalState.js`, `EditUserModal.jsx`, `PasswordRules.jsx`.

### `src/utils/geo.js`
- `extractCoords(raw)` — parses lat/lng from any Google Maps URL or raw `lat,lng` string.
- `toEmbedUrl(url)` — converts a location URL (Telegram / Google Maps / coordinates) into an embeddable iframe URL.
- `wazeLink(area)` — Waze deep link for a text address.
- `wazeLinkCoords`, `googleMapsLinkCoords`, `appleMapsLinkCoords` — coordinate-based navigation deep links.
- `getCurrentFix(t)` — Promise wrapper around `navigator.geolocation.getCurrentPosition`.
- `extractCity(area, lang)` — extracts the city portion before the first `-` or comma.

**Used by:** `ConfirmationForm.jsx`, `InviteForm.jsx`, `GuestMapModal.jsx`, `GroomGuestsMap.jsx`, `AdminConfirmationsTab.jsx`, `usePortalState.js`.

### `src/utils/storage.js`
- `load(key, fallback)` — `JSON.parse(localStorage.getItem(key))` with silent fallback.
- `save(key, val)` — `localStorage.setItem(key, JSON.stringify(val))` with silent no-op.
- `removeKey(key)` — `localStorage.removeItem(key)` with silent no-op.

**Used by:** `usePortalState.js` (language, UI prefs), `App.jsx` (language), `GroomPortalView.jsx` (groom type).

---

### Styles / Data

### `src/styles/theme.js`
Design token exports:
- `C` — color palette (`bg`, `gold`, `goldLight`, `goldDim`, `dim`, `blue`, `red`, glow variants).
- `ROLE` — per-role `{ color, glow, icon }` map for admin/driver/groom.
- `S` — repeated inline-style fragments (`fieldLabel`, `sectionTitle`, `sectionSub`).

**Used by:** virtually every component file. These are the only allowed palette definitions.

### `src/styles/GlobalStyle.jsx`
Injects a `<style>` tag with global CSS: keyframe animations (`fadeUp`, `slideDown`), base resets, `.gold-card`, `.input-field`, `.gold-btn` utility classes, custom scrollbar styling.

**Used by:** `App.jsx` renders it once at the root.

### `src/data/status.js`
- `STATUS` — delivery status map `{ pending, enroute, delivered }` with label, color, bg, icon.
- `REPLY_STATUS` — invite reply status map `{ notSent, pending, confirmed }`.
- `replyStateOf(guest)` — derives reply state from `guest.confirmedAt` / `guest.inviteLinkSentAt`.

**Used by:** `DriverDeliveryList.jsx`, `GroomGuests.jsx`, `AdminSendTab.jsx`.

### `src/data/cities.js`
Static array of Israeli city names used by `CityField.jsx` for dropdown autocomplete.

### `src/data/inviteContent.js`
WhatsApp message templates (premium and standard tiers). Used by `AdminSendTab.jsx`.

---

### Components

### `src/components/RoleGuard.jsx`
Renders `children` only when `usePortal().userType` is in the `roles` prop array. Renders `fallback` (default `null`) otherwise. Used in `Portal.jsx` route definitions to prevent wrong-role UI rendering. Not the authoritative security gate (server enforces).

### `src/components/Toast.jsx`
Fixed-position top notification. Props: `message` (string | null), `variant` ("gold" | "green"). Renders nothing when `message` is falsy.

**Used by:** `AdminPortal.jsx`, `DriverPortal.jsx`, `DigitalPortal.jsx`, `GroomHandwrittenShell.jsx`.

### `src/components/BrandLogo.jsx`
Renders the SVG brand mark from `src/assets/brandSvg.js`. Props: `size`.

### `src/components/LangSwitcher.jsx`
Toggle button between Arabic and Hebrew. Props: `lang`, `setLang`.

### `src/components/LogoutConfirm.jsx`
Two-button confirm dialog (confirm/cancel logout). Props: `asking`, `onConfirm`, `onCancel`, `t`.

### `src/components/PhoneInput.jsx`
Phone input that formats to E.164 on blur. Shows validation error inline.

### `src/components/CityField.jsx`
Autocomplete dropdown backed by `src/data/cities.js`.

### `src/components/AddressInput.jsx`
Composite: `CityField` + street + house number in one block.

### `src/components/StreetField.jsx`
Street name input with simple suggestion filtering.

### `src/components/LiveMap.jsx`
Leaflet map that renders an array of `markers` (`{ key, lat, lng, kind, label }`). Depends on `useLeaflet()` being ready. Used on the groom live-driver map.

### `src/components/MapPickerInline.jsx`
Draggable Leaflet map for the invite form. Emits `{ lat, lng }` on marker drag. Also shows a GPS fix button.

### `src/components/GuestMapModal.jsx`
Full-screen modal with a Leaflet map centered on a guest's coordinates. Shows navigation links (Waze / Google Maps / Apple Maps).

### `src/components/PhotoViewer.jsx`
Lightbox overlay for viewing a proof photo at full resolution.

### `src/components/GroomMultiSelect.jsx`
Multi-select checkbox list of groom usernames. Used by the driver share-location tab.

### `src/components/EditGuestModal.jsx`
Modal form to edit name, phone, address, and status of an existing guest. Calls `updateGuest`.

### `src/components/EditUserModal.jsx`
Admin modal to edit username, display name, phone, role, and optional new password. Calls `updatePortalUser` and/or `adminSetPassword`.

### `src/components/EditConfirmationModal.jsx`
Admin modal to patch a confirmation record's name, phone, city, street, house. Calls `updateConfirmation`.

### `src/components/PasswordResetFlow.jsx`
Two-step component: enter phone → receive SMS → enter code → new password. Calls `sendPasswordResetCode` and then `callResetPassword`.

### `src/components/PasswordRules.jsx`
Visual checklist (green ✓ / grey ✗) of password rules. Driven by `evaluatePassword(pwd)` from `utils/password.js`.

---

### Cloud Functions (`functions/src/`)

### `index.ts`
Calls `initializeApp()` once and re-exports all Cloud Function handlers. Nothing else.

### `helpers.ts`
Shared validation and authorization utilities:
- `assertAdmin(req)` — throws `permission-denied` if `auth.token.role !== "admin"`. Called first by every admin-only function.
- `getClaims(req)` — typed accessor for `DawaClaims` (`role`, `username`, `assignedGrooms`).
- `isUsername`, `isE164`, `isRole`, `isFiniteInRange` — input validators.
- `normalisePhone`, `normalisePhoneForMatching`, `phoneIndexKey`, `syntheticEmail` — phone/email utilities.
- `isStrongPassword` — password policy check (mirror of `src/utils/password.js`).

**Used by:** every Cloud Function file.

### `users.ts`
- `createPortalUser` — validates input, checks username/phone uniqueness, creates Auth user, stamps `{ role, username }` custom claim, writes `/users/{uid}` + index nodes, writes `/groomProfiles/{uid}` for grooms, audit-logs. Rate: 30/hr per admin.
- `deletePortalUser` — cascade-deletes Auth user + RTDB profile + indices + guest data + groom profile. Rate: 30/hr per admin.
- `setAdminClaim` — promotes/demotes admin ↔ groom without recreating user.

### `updateUser.ts`
- `updatePortalUser` — patches any combination of username, displayName, phoneE164, role. Updates Auth email, phone, RTDB profile, index nodes, and custom claim atomically.

### `adminSetPassword.ts`
- `adminSetPassword` — admin sets another user's password and revokes their refresh tokens.

### `assignments.ts`
- `assignDriverToGroom` — looks up the groom's UID by username, stamps `assignedGrooms[groomUid]: true` into the driver's custom claim (required by Storage rules for proof-photo access).

### `confirmations.ts`
- `submitConfirmation` — public (unauthenticated) callable. Rate-limited 5/hr per IP. Validates all fields including full name (2+ words) and phone. Optionally stores GPS coordinates. Writes to `/confirmations`.

### `attachLocation.ts`
- `attachConfirmationLocationToGuest` — admin-only. Copies a confirmation's lat/lng onto a specific guest record in `/guestsByGroom`.

### `invite.ts`
- `createGuestInvite` — groom/admin callable. Generates a 32-char random token, writes `/inviteTokens/{token}` with 90-day TTL, stamps `inviteLinkToken + inviteLinkSentAt` on the guest record.
- `submitGuestInvite` — unauthenticated callable. Looks up token, checks expiry, patches the guest record with area/lat/lng/deliveryNote, marks token used.

### `resetPassword.ts`
- `resetPassword` — called after phone-OTP verification. Uses the phone-auth ID token to authorize the password change on the real portal user account.

### `audit.ts`
- `writeAudit(eventType, actor, payload)` — internal helper. Writes a timestamped entry to `/audit/{pushId}`.

### `rateLimit.ts`
- `allow(key, limit, windowMs)` — in-memory sliding-window rate limiter. Returns `false` when the limit is exceeded. Keyed by e.g. `confirm:{ip}` or `createUser:{adminUid}`.

---

## 6. Security Model

Three enforced layers — all three must pass for any privileged action:

| Layer | Where | Mechanism |
|---|---|---|
| Server: Cloud Functions | `functions/src/helpers.ts` | `assertAdmin()` throws `permission-denied` before any logic |
| Server: RTDB | `database.rules.json` | `auth.token.role === 'admin'`, ownership, schema `.validate` |
| Server: Storage | `storage.rules` | `assignedGrooms[groomUid] === true` in custom claim |
| Client: UI | `src/components/RoleGuard.jsx` | Prevents rendering wrong-role views (convenience only) |

JWT custom claims on every user: `{ role: "admin"|"driver"|"groom", username }`. Drivers additionally carry `assignedGrooms: { [groomUid]: true }`.

Live claim refresh: `usePortalState` subscribes to both `subscribeAuth` AND `subscribeIdToken`; the `callable()` wrapper retries once after `forceRefreshToken()` on `permission-denied`.

---

## 7. RTDB Data Layout

```
/users/{uid}                           — portal user profile (role, username, phoneE164, …)
/usernameIndex/{username}              — uid (uniqueness guard)
/phoneIndex/{normalizedPhone}          — uid (uniqueness guard)
/groomProfiles/{uid}                   — { username, displayName } (public to all authed users)
/guestsByGroom/{groomUid}/{guestId}    — guest records (sharded so groom/driver can listen)
/confirmations/{confId}                — guest confirmation submissions
/inviteTokens/{token}                  — per-guest invite token records
/liveLocationsByGroom/{groomUid}/{driverUid} — live GPS fixes (sharded by groom)
/driverAssignments/{driverUid}         — { [groomUid]: true } for driver assignment lookup
/adminSettings                         — { messageBody, formLink }
/audit/{eventId}                       — admin action audit log
```

---

## 8. Key Environment Variables

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_DATABASE_URL
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_USE_EMULATORS=1   (dev only — set to 0 or absent in production)
VITE_DEBUG=1           (optional — enables [dawa] console logs in production)
```

---

## 9. Running the Project

```bash
# Frontend dev server (emulators must be running)
npm run dev

# Build frontend
npm run build

# Build Cloud Functions
cd functions && npm run build

# Run RTDB rule tests (requires Java 21)
npm test

# Deploy everything
firebase deploy --project dawa-aa793

# Seed first admin (run once)
node functions/scripts/seedAdmin.js

# Inspect a user
node functions/scripts/inspectUser.js <uid-or-username>

# Backfill claims after migration
node functions/scripts/migrateClaims.js
```
