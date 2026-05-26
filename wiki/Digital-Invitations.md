---
date: 2026-05-26
sources:
  - DATABASE_SCHEMA.md
  - API_CONTRACTS.md
  - KNOWN_BUGS.md
tags: [digital, firestore, media, concept]
---

# Digital Invitations

One of two invite types a [[User Roles|groom]] can run in [[Dawa]] (the other being Handwritten/physical delivery). Digital invites are WhatsApp-link-only and are the **one part of the app backed by Firestore**, not RTDB — see [[Data Storage Model]].

## What it includes
- **Digital guest list** — `digitalGuests/{groomUid}/guests/{guestId}` (status: pending | attending | absent)
- **Background media** — one wedding image/GIF/video per groom (`digitalMedia/{groomUid}`)
- **Photographer files** — uploads under `photographerFiles/{groomUid}` (photographers upload without an account in the current design)
- **Design requests** — grooms submit custom design requests; admin reviews + uploads mockups
- **Public invitation page** — `/d/:groomUsername/:token/*` (`DigitalInvitationPage.jsx`)

## API
Routes under `/digital/*`: guests CRUD, `media` upload/delete, `photographer` upload/delete. See [[API Contracts]].

## A persistent source of bugs
The digital dashboard's upload + gallery flows generated most of the project's bugs because the UI reads from a 15s poller and multiple uploads race on a shared `media[]` array. See [[Optimistic UI Pattern]] and [[Known Bugs]] (BUG-O002, BUG-O003, BUG-R011, BUG-R012). Fixes: Firestore transactions for read-modify-write, optimistic local updates, pending-paths merge against poll results, resumable GCS uploads, and `getDownloadURL` instead of signed URLs.
