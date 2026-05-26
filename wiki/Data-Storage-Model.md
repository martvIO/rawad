---
date: 2026-05-26
sources:
  - DATABASE_SCHEMA.md
  - DECISIONS.md
tags: [database, rtdb, firestore, storage, schema, reference]
---

# Data Storage Model

[[Dawa]] uses **two databases** plus Firebase Storage, all default-deny and governed by the [[Security Model]].

## RTDB (primary) — sharded by groomUid
Guest data lives at `/guestsByGroom/{groomUid}/{guestId}`, **not** a flat `/guests/{guestId}`.

**Why sharded:** RTDB `.read` rules apply to the path you subscribe to — you can't subscribe to `/guests` and filter by a field in the rules. Sharding by groomUid lets a groom read their own subtree and an assigned driver read the same subtree.

Key RTDB paths:
- `/users/{uid}` — portal profile (Cloud-Functions-writable only)
- `/usernameIndex`, `/phoneIndex` — uniqueness guards + reset lookup
- `/groomProfiles/{uid}` — public; drivers pick a groom from here
- `/guestsByGroom/{groomUid}/{guestId}` — guest records (status, invite token, lat/lng, proofUrl)
- `/confirmations/{confId}` — attendance submissions (admin only)
- `/inviteTokens/{token}` — 32-char hex tokens, 90-day TTL, publicly readable
- `/liveLocationsByGroom/{groomUid}/{driverUid}` — live GPS (see [[Polling and Realtime]])
- `/driverAssignments/{driverUid}`, `/adminSettings`, `/audit/{eventId}`

## Firestore (digital invites only)
Digital guest lists, media, and photographer files use Firestore — see [[Digital Invitations]]. RTDB had silent write-rollback issues on the first write after login (claim-propagation race, [[Known Bugs]] BUG-R003); Firestore proved reliable for the write-after-login pattern.
- `digitalGuests/{groomUid}/guests/{guestId}`, `digitalMedia/{groomUid}`, `photographerFiles/{groomUid}/files/{fileId}`

## Firebase Storage
- `proofs/{groomUid}/{guestId}/{ts}.jpg` — write: drivers with `assignedGrooms[groomUid]`; read: groom + admin
- `digitalMedia/{groomUid}/...` — write: owning groom; read: public
- `photographerFiles/{groomUid}/...` — write: any authed user; read: groom + admin

Full field-level schema is in `DATABASE_SCHEMA.md`. JWT claims that gate these paths: see [[Authentication]].
