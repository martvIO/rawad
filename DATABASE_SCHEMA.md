# Database Schema — Dawa

---

## Firebase Realtime Database (RTDB)

Default-deny. All rules in `database.rules.json`.

### `/users/{uid}`
Portal user profile. Readable by the owning user + admin. Writable by Cloud Functions only.

```json
{
  "uid": "string",
  "username": "string",
  "displayName": "string",
  "role": "admin | driver | groom",
  "phoneE164": "+972501234567",
  "createdAt": 1716000000000
}
```

---

### `/usernameIndex/{username}`
Value: `uid` string. Uniqueness guard — used by `createPortalUser` + `updatePortalUser` to prevent duplicate usernames.

---

### `/phoneIndex/{normalizedPhone}`
Value: `uid` string. `normalizedPhone` is produced by `phoneIndexKey()` in `helpers.ts`. Uniqueness guard + lookup key for password reset.

---

### `/groomProfiles/{uid}`
Public (readable by all authenticated users). Used by drivers to pick a groom.

```json
{
  "username": "string",
  "displayName": "string"
}
```

---

### `/guestsByGroom/{groomUid}/{guestId}`
Guest records. Readable by the owning groom + any driver with `assignedGrooms[groomUid] === true` + admin.

```json
{
  "name": "string",
  "phone": "+972501234567",
  "city": "string",
  "street": "string",
  "houseNumber": "string",
  "area": "string",
  "status": "pending | enroute | delivered",
  "confirmedAt": 1716000000000,
  "inviteLinkToken": "string",
  "inviteLinkSentAt": 1716000000000,
  "lat": 31.7683,
  "lng": 35.2137,
  "deliveryNote": "string",
  "proofUrl": "string"
}
```

**Field notes:**
- `confirmedAt` — set when guest submits invite form or confirmation form. Presence indicates confirmed.
- `inviteLinkToken` — the 32-char token stored in `/inviteTokens`. Set by `createGuestInvite`.
- `inviteLinkSentAt` — timestamp when the invite was sent. Drives the "pending" reply state.
- `lat`/`lng` — coordinates from the invite form map picker or GPS button.

---

### `/confirmations/{confId}`
Guest attendance confirmation submissions. Readable + editable by admin.

```json
{
  "groomUsername": "string",
  "name": "string",
  "phone": "+972501234567",
  "city": "string",
  "street": "string",
  "houseNumber": "string",
  "lat": 31.7683,
  "lng": 35.2137,
  "submittedAt": 1716000000000,
  "source": "form | invite"
}
```

---

### `/inviteTokens/{token}`
Per-guest invite tokens. Publicly readable (the public invite form reads the token on load). Writable by Cloud Functions only.

```json
{
  "groomUid": "string",
  "guestId": "string",
  "guestName": "string",
  "guestPhone": "string",
  "groomUsername": "string",
  "createdAt": 1716000000000,
  "expiresAt": 1723776000000,
  "usedAt": 1716100000000
}
```

**Token format:** 32 random hex characters.
**TTL:** 90 days from creation.

---

### `/liveLocationsByGroom/{groomUid}/{driverUid}`
Live driver GPS. Readable by the groom. Writable by the driver. Stale entries (>30s) are ignored by the client.

```json
{
  "displayName": "string",
  "lat": 31.7683,
  "lng": 35.2137,
  "timestamp": 1716000000000
}
```

**Update cadence:** every 1 second while driver is sharing.

---

### `/driverAssignments/{driverUid}`
Driver-to-groom assignment lookup. Readable by the driver. Written by `assignDriverToGroom` Cloud Function.

```json
{
  "[groomUid]": true
}
```

---

### `/adminSettings`
Admin-editable global settings. Readable by all authenticated users. Writable by admin only.

```json
{
  "messageBody": "string",
  "formLink": "string"
}
```

---

### `/audit/{eventId}`
Audit log. Written by Cloud Functions. Readable by admin only.

```json
{
  "eventType": "string",
  "actorUid": "string",
  "payload": {},
  "timestamp": 1716000000000
}
```

---

## Firestore

Rules in `firestore.rules`.

### `digitalGuests/{groomUid}/guests/{guestId}`
Digital invite guest list. Owned by `groomUid`. Readable/writable by the owning groom and admin.

```json
{
  "name": "string",
  "phone": "+972501234567",
  "status": "pending | attending | absent",
  "createdAt": "Timestamp"
}
```

---

### `digitalMedia/{groomUid}`
Single document per groom — their wedding background media (image / GIF / video). Writable only by the owning groom.

```json
{
  "url": "string",
  "storagePath": "string",
  "type": "image | video",
  "uploadedAt": "Timestamp"
}
```

---

### `photographerFiles/{groomUid}/files/{fileId}`
Photographer uploads for a groom. Writable by any authenticated user (photographer uploads without an account in the current design).

```json
{
  "url": "string",
  "storagePath": "string",
  "type": "image | video",
  "uploadedAt": "Timestamp"
}
```

---

## Firebase Storage

Rules in `storage.rules`.

| Path | Who can write | Who can read |
|---|---|---|
| `proofs/{groomUid}/{guestId}/{timestamp}.jpg` | Drivers with `assignedGrooms[groomUid] === true` in claim | Groom (`groomUid`) + admin |
| `digitalMedia/{groomUid}/{filename}` | Owning groom | Public (invitation page) |
| `photographerFiles/{groomUid}/{filename}` | Any authenticated user | Owning groom + admin |

---

## JWT Custom Claims

Set by Cloud Functions. Verified by RTDB rules, Storage rules, and `requireAuth` middleware.

```json
{
  "role": "admin | driver | groom",
  "username": "string",
  "assignedGrooms": { "[groomUid]": true }
}
```

`assignedGrooms` is only present on driver accounts, and only after `assignDriverToGroom` has been called.
