# Firebase Structure — Dawa

---

## Project

**Project ID:** `dawa-aa793`
**Plan:** Blaze (pay-as-you-go) — required for Cloud Functions

---

## Firebase Products in Use

| Product | Used for |
|---|---|
| Firebase Auth | Identity provider. All authentication proxied via REST API. |
| Realtime Database | Primary data store: guests, users, confirmations, tokens, live GPS, settings, audit |
| Firestore | Digital invitation data: guests, media, photographer files |
| Storage | Proof photos, digital media, photographer files |
| Cloud Functions v2 | REST API (`api`) + digital invitation preview (`digitalInvitePreview`) + legacy callables |
| Hosting | Serves React SPA with `/api/**` and `/d/**` rewrites |

---

## Authentication

- **Provider:** Email/Password (must be enabled in Firebase Console → Authentication → Sign-in method)
- **Email format:** `{username}@dawa.local` (synthetic — users never see this)
- **Phone Auth:** Used only for password reset OTP flow. Requires an invisible reCAPTCHA v2 site key.
- **Custom claims:** `{ role, username, assignedGrooms? }` — set by Cloud Functions, read by rules and middleware

---

## Realtime Database

**URL:** `https://dawa-aa793-default-rtdb.firebaseio.com`

### Data tree

```
/users/{uid}                             — user profiles
/usernameIndex/{username}                — uid (uniqueness)
/phoneIndex/{normalizedPhone}            — uid (uniqueness + reset lookup)
/groomProfiles/{uid}                     — public groom list
/guestsByGroom/{groomUid}/{guestId}      — guest records
/confirmations/{confId}                  — attendance submissions
/inviteTokens/{token}                    — per-guest invite tokens
/liveLocationsByGroom/{groomUid}/{driverUid} — driver GPS fixes
/driverAssignments/{driverUid}           — assignment map
/adminSettings                           — WhatsApp template + form link
/audit/{eventId}                         — admin action log
```

### Rules
`database.rules.json` — default-deny. See `docs/security.md` for rule rationale.

---

## Firestore

**Collections:**

```
digitalGuests/{groomUid}/guests/{guestId}
digitalMedia/{groomUid}
photographerFiles/{groomUid}/files/{fileId}
```

**Rules:** `firestore.rules`
**Indexes:** `firestore.indexes.json` (currently empty — no composite indexes needed)

---

## Storage

**Bucket:** `dawa-aa793.appspot.com`

### Path structure

```
proofs/{groomUid}/{guestId}/{timestamp}.jpg   — delivery proof photos
digitalMedia/{groomUid}/{filename}             — wedding background media
photographerFiles/{groomUid}/{filename}        — photographer uploads
```

**Rules:** `storage.rules` — see `docs/security.md` for access control.

---

## Cloud Functions

**Runtime:** Node.js 20
**Region:** `us-central1`

### Active functions

| Name | Type | Trigger |
|---|---|---|
| `api` | HTTP | Firebase Hosting rewrite `/api/**` |
| `digitalInvitePreview` | HTTP | Firebase Hosting rewrite `/d/**` |

### Legacy callable functions (may still be active)

| Name | Purpose |
|---|---|
| `createPortalUser` | Create portal account |
| `deletePortalUser` | Delete portal account + cascade |
| `updatePortalUser` | Patch account fields + claims |
| `adminSetPassword` | Admin resets another user's password |
| `setAdminClaim` | Promote/demote admin ↔ groom |
| `assignDriverToGroom` | Stamp `assignedGrooms` claim |
| `submitConfirmation` | Public confirmation submit (rate-limited) |
| `attachConfirmationLocationToGuest` | Copy confirmation GPS to guest |
| `createGuestInvite` | Mint invite token |
| `submitGuestInvite` | Validate + consume invite token |
| `resetPassword` | Phone-OTP verified password reset |

---

## Hosting

**Site:** `dawa-aa793.web.app` / custom domain if configured

### Rewrites

| Source | Destination |
|---|---|
| `/api/**` | `api` Cloud Function (us-central1) |
| `/d/**` | `digitalInvitePreview` Cloud Function (us-central1) |
| `**` | `/index.html` (SPA fallback) |

### Security headers
Applied to all responses — see `docs/security.md`.

---

## Emulators (local development)

Configured in `firebase.json`:

| Emulator | Port |
|---|---|
| Auth | 9099 |
| Realtime Database | 9000 |
| Firestore | 8080 |
| Storage | 9199 |
| Functions | 5001 |
| Hosting | 5000 |
| UI (dashboard) | 4000 |

Start with: `npm run emulators:build` (builds functions first) or `npm run dev:full` (full stack in one command).
