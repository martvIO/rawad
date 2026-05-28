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
- **Self-serve design editor** — groom picks one of 5 curated themes (gold/rose/blue/emerald/white) + one of 3 Arabic fonts (Amiri/Noto Naskh/Cairo), fills bride/groom names, wedding date, venue, custom message, and uploads media. Live preview rendered via shared `DigitalInvitationView`.
- **Design approval state machine** — `designStatus: draft → pending_approval → approved | rejected` on `digitalInvitations/{uid}`. Admin approves via `/digital/:uid/design/approve` or rejects with note via `/digital/:uid/design/reject`. Digital invite minting is gated on `designStatus === "approved"` (403 `design_not_approved` otherwise). Editing a design field while approved auto-demotes to draft.
- **Design snapshot version-locking** — every minted digital invite token embeds the approved design as a `designSnapshot` in its RTDB record. Already-sent links keep their original design even after the groom edits and re-approves a new version.
- **Public invitation page** — `/d/:groomUsername/:token/*` (`DigitalInvitationPage.jsx`). Reads `designSnapshot` from the token when present, falls back to the live `/digital/:uid/public` doc for legacy tokens.
- **Custom domain** — both physical and digital invite links use `https://invite.dawa.to` by default (overridable via `VITE_INVITE_BASE_URL`).

## API
Routes under `/digital/*`: guests CRUD, `media` upload/delete + design-field PATCH whitelist (venue, venueAddress, customMessage, themeColor, fontFamily), `photographer` upload/delete, design state-machine endpoints (`/design/submit`, `/cancel`, `/approve`, `/reject`), and the admin-only `/design-list` grid feed. See [[API Contracts]].

## A persistent source of bugs
The digital dashboard's upload + gallery flows generated most of the project's bugs because the UI reads from a 15s poller and multiple uploads race on a shared `media[]` array. See [[Optimistic UI Pattern]] and [[Known Bugs]] (BUG-O002, BUG-O003, BUG-R011, BUG-R012). Fixes: Firestore transactions for read-modify-write, optimistic local updates, pending-paths merge against poll results, resumable GCS uploads, and `getDownloadURL` instead of signed URLs.
