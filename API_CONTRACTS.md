# API Contracts — Dawa REST API

Base URL: `https://us-central1-dawa-aa793.cloudfunctions.net/api`
Local (emulator): `http://127.0.0.1:5001/dawa-aa793/us-central1/api`
Via Firebase Hosting: same-origin `/api/**` rewrite

All requests: JSON body (`Content-Type: application/json`).
All authenticated requests: `Authorization: Bearer <idToken>` header.
All error responses: `{ "error": "<code>" }`.

---

## Auth — `/auth`

### POST /auth/login
Public. Rate: 10/hr/IP.

**Request:** `{ username: string, password: string }`
**Response 200:** `{ idToken, refreshToken, expiresIn, uid, role, username, displayName, phoneE164 }`
**Response 401:** `{ error: "invalid_credentials" }`

---

### POST /auth/logout
Authenticated. Stateless — frontend clears tokens locally.

**Response 200:** `{ ok: true }`

---

### POST /auth/refresh
Public. Rate: 60/hr/IP.

**Request:** `{ refreshToken: string }`
**Response 200:** `{ idToken, refreshToken, expiresIn }`
**Response 401:** `{ error: "refresh_failed" }`

---

### GET /auth/me
Authenticated. Returns caller's profile + custom claims.

**Response 200:** `{ uid, role, username, displayName, phoneE164, claims }`

---

### POST /auth/send-otp
Public. Rate: 5/hr/IP. Requires reCAPTCHA v2 token.

**Request:** `{ phoneE164: string, recaptchaToken: string }`
**Response 200:** `{ sessionInfo: string }`
**Response 400:** `{ error: "<firebase_error_code>" }`

---

### POST /auth/verify-otp
Public. Rate: 5/hr/IP.

**Request:** `{ sessionInfo: string, code: string }`
**Response 200:** `{ idToken, refreshToken, expiresIn }`
**Response 400:** `{ error: "verify_failed" }`

---

### POST /auth/reset-password
Requires phone-auth session (ID token from verify-otp, must have `phone_number` claim).

**Request:** `{ newPassword: string }` (must pass strength check)
**Response 200:** `{ ok: true }`
**Response 403:** `{ error: "phone_verified_session_required" }` or `{ error: "phone_does_not_match_account" }`
**Response 429:** `{ error: "too_many_requests", scope: "phone" }`

---

## Users — `/users`

_All routes: Admin only._

### GET /users
Returns all portal user accounts.

**Response 200:** `{ users: [{ uid, username, displayName, role, phoneE164, ... }] }`

---

### POST /users
Create a portal user account.

**Request:** `{ username, password, role, displayName?, phoneE164? }`
**Response 201:** `{ uid, username, role }`
**Response 400:** `{ error: "username_taken" | "phone_taken" | "weak_password" | "missing_fields" }`

---

### PATCH /users/:uid
Update a portal user account (any combination of fields).

**Request:** `{ username?, displayName?, phoneE164?, role?, newPassword? }`
**Response 200:** `{ ok: true }`

---

### DELETE /users/:uid
Delete a portal user and cascade-delete all associated data.

**Response 200:** `{ ok: true }`

---

## Guests — `/guests`

### GET /guests
Admin: returns all guests across all grooms.
Groom: returns their own guests.
Driver: returns guests for their assigned groom.

**Response 200:** `{ guests: [{ id, groomUid, name, phone, city, street, houseNumber, status, confirmedAt, inviteLinkSentAt, ... }] }`

---

### POST /guests
Groom or Admin. Add a guest.

**Request:** `{ groomUid, name, phone, city, street?, houseNumber?, area? }`
**Response 201:** `{ id, ...guest }`

---

### PATCH /guests/:groomUid/:guestId
Groom or Admin. Update a guest record.

**Request:** `{ name?, phone?, city?, street?, houseNumber?, status?, ... }`
**Response 200:** `{ ok: true }`

---

### DELETE /guests/:groomUid/:guestId
Groom or Admin.

**Response 200:** `{ ok: true }`

---

## Confirmations — `/confirmations`

### POST /confirmations
Public. Rate: 5/hr/IP.

**Request:** `{ groomUsername, name, phone, city, street?, houseNumber?, lat?, lng? }`
**Response 200:** `{ ok: true }`
**Response 429:** `{ error: "too_many_requests" }`

---

### GET /confirmations
Admin only. Returns all confirmations.

**Response 200:** `{ confirmations: [{ id, groomUsername, name, phone, city, ... }] }`

---

### PATCH /confirmations/:id
Admin only. Update a confirmation record.

**Request:** `{ name?, phone?, city?, street?, houseNumber? }`
**Response 200:** `{ ok: true }`

---

## Invites — `/invites`

### POST /invites
Groom or Admin. Create a per-guest invite token.

**Request:** `{ groomUid, guestId }`
**Response 200:** `{ token, expiresAt }`

---

### POST /invites/:token/submit
Public. Submit a guest's invite form.

**Request:** `{ area?, lat?, lng?, deliveryNote? }`
**Response 200:** `{ ok: true }`
**Response 404:** `{ error: "token_not_found" }`
**Response 410:** `{ error: "token_used" | "token_expired" }`

---

### GET /invites/:token
Public. Read invite token info.

**Response 200:** `{ token, guestName, guestPhone, groomUsername, used, expiresAt }`

---

## Assignments — `/assignments`

### POST /assignments
Driver only. Assign self to a groom.

**Request:** `{ groomUsername: string }`
**Response 200:** `{ ok: true }`

---

### GET /assignments
Driver only. Return currently assigned grooms.

**Response 200:** `{ assignedGrooms: { [groomUid]: true } }`

---

## Live Locations — `/live-locations`

### GET /live-locations/:groomUid (SSE)
Groom or Admin. Server-Sent Events stream of driver GPS fixes for the given groom.

**Response:** `text/event-stream`, each event: `{ driverUid, displayName, lat, lng, timestamp }`

---

### POST /live-locations
Driver only. Publish a GPS fix.

**Request:** `{ lat, lng, shareWithGroomUids: string[] }`
**Response 200:** `{ ok: true }`

---

### DELETE /live-locations
Driver only. Clear driver's live location from all shared grooms.

**Response 200:** `{ ok: true }`

---

## Proofs — `/proofs`

### POST /proofs/:groomUid/:guestId
Driver only. Upload a proof photo. Multipart form with `file` field.

**Response 200:** `{ url: string }`

---

### GET /proofs/:groomUid
Groom or Admin. List proof photos for a groom.

**Response 200:** `{ proofs: [{ guestId, url, uploadedAt }] }`

---

## Digital — `/digital`

### GET /digital/guests/:groomUid
Groom or Admin.

**Response 200:** `{ guests: [{ id, name, phone, status, ... }] }`

---

### POST /digital/guests/:groomUid
Groom or Admin.

**Request:** `{ name, phone }`
**Response 201:** `{ id, name, phone }`

---

### PATCH /digital/guests/:groomUid/:guestId
**Request:** `{ name?, phone?, status? }` (status: `"pending"` | `"attending"` | `"absent"`)
**Response 200:** `{ ok: true }`

---

### DELETE /digital/guests/:groomUid/:guestId
**Response 200:** `{ ok: true }`

---

### POST /digital/media/:groomUid
Upload background media. Multipart `file` field.

**Response 200:** `{ url, type }`

---

### DELETE /digital/media/:groomUid
**Response 200:** `{ ok: true }`

---

### POST /digital/photographer/:groomUid
Upload photographer file. Multipart `file` field.

**Response 200:** `{ id, url }`

---

### DELETE /digital/photographer/:groomUid/:fileId
**Response 200:** `{ ok: true }`

---

## Settings — `/settings`

### GET /settings
Authenticated.

**Response 200:** `{ messageBody: string, formLink: string }`

---

### PATCH /settings
Admin only.

**Request:** `{ messageBody?, formLink? }`
**Response 200:** `{ ok: true }`

---

## Health

### GET /health
Public.

**Response 200:** `{ ok: true, uptimeSeconds: number }`

---

## Error Codes

| Code | Meaning |
|---|---|
| `invalid_credentials` | Wrong username or password |
| `refresh_failed` | Refresh token expired or revoked |
| `session_expired` | ID token expired and refresh failed |
| `missing_fields` | Required request body fields absent |
| `username_taken` | Username already exists |
| `phone_taken` | Phone number already registered |
| `weak_password` | Password doesn't meet strength requirements |
| `token_not_found` | Invite token doesn't exist |
| `token_used` | Invite token already submitted |
| `token_expired` | Invite token past 90-day TTL |
| `too_many_requests` | Rate limit exceeded |
| `not_found` | Route doesn't exist |
| `internal_error` | Unhandled server error |
| `server_misconfigured` | `WEB_API_KEY` env var not set |
| `phone_verified_session_required` | Reset-password requires phone-auth session |
| `phone_does_not_match_account` | Phone number not on file for any user |
| `no_account_for_phone` | No portal user with that phone |
