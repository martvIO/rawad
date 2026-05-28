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
- **Luxury editorial microsite (2026-05-28 redesign)** — the public page (`DigitalInvitationView`) is a multi-section cinematic scroll: envelope intro → ambient petals/sparkles → hero (monogram ring + stacked couple names + date/venue chip + guest greeting) → **story timeline** (alternating cards) → **photo gallery + lightbox** (with per-photo captions) → **details cards** → **venue + animated faux-map + nearby hotels** → countdown → **enhanced RSVP** (attending/absent + companions stepper + meal chips + song request + note, confetti/hearts on submit) → **guestbook** → footer → floating dock (music/share/calendar). All colors flow from the shared `digitalThemes` tokens so theme/font switching still works. Styles are scoped under `.dawa-inv` so no other surface is affected. Design source: the `dawa-design-system` handoff bundle (`ui_kits/digital-invite`).
- **Self-serve design editor** — groom customizes *every* field: names, monogram, eyebrow, wedding date, venue/city/address/access note, dress code, story timeline (add/remove), gallery photos + captions, detail cards (add/remove), nearby hotels (add/remove), RSVP options (meal options + companions/meal/song toggles), guestbook wishes, gift, music, theme (5 palettes), font (3). A **"fill with sample content"** button seeds empty sections from the design template. Every section has an ON/OFF toggle (default ON) — nothing is cut unless the groom unchecks it. Live preview rendered via shared `DigitalInvitationView`. Sample defaults live in `src/data/digitalInviteDefaults.js`.
- **Design approval state machine** — `designStatus: draft → pending_approval → approved | rejected` on `digitalInvitations/{uid}`. Admin approves via `/digital/:uid/design/approve` or rejects with note via `/digital/:uid/design/reject`. Digital invite minting is gated on `designStatus === "approved"` (403 `design_not_approved` otherwise). Editing a design field while approved auto-demotes to draft.
- **Design snapshot version-locking** — every minted digital invite token embeds the approved design as a `designSnapshot` in its RTDB record. Already-sent links keep their original design even after the groom edits and re-approves a new version.
- **Public invitation page** — `/d/:groomUsername/:token/*` (`DigitalInvitationPage.jsx`). Reads `designSnapshot` from the token when present, falls back to the live `/digital/:uid/public` doc for legacy tokens.
- **Custom domain** — both physical and digital invite links use `https://invite.dawa.to` by default (overridable via `VITE_INVITE_BASE_URL`).

## API
Routes under `/digital/*`: guests CRUD, `media` upload/delete + design-field PATCH whitelist (now also: eyebrow, monogram, venueCity, accessNote, dressCode, storyTimeline[], details[], hotels[], wishes[], mealOptions[], mediaCaptions{}, and the section toggles detailsEnabled/venueEnabled/guestbookEnabled/envelopeEnabled/rsvpCompanionsEnabled/rsvpMealEnabled/rsvpSongEnabled — all in `DESIGN_FIELDS` so editing them demotes an approved design to draft), `photographer` upload/delete, design state-machine endpoints (`/design/submit`, `/cancel`, `/approve`, `/reject`), and the admin-only `/design-list` grid feed. The public RSVP submit (`/invites/digital/submit`) now also accepts `companions`/`mealPreference`/`songRequest`, stored on the guest doc. **`companions`** (people attending besides the invited guest, 0–20, default 0) is the unified attendee field across both invite types — the physical confirmation forms (`/confirmations`, `/invites/submit`) collect it too, and the groom sees per-guest `+N` badges plus an "expected attendees" dashboard total (`confirmed/attending + Σ companions`). RTDB `companions` validation lives in `database.rules.json` (`guestsByGroom`, `confirmations`). The `designSnapshot` embedded at mint time now spreads the **full** design doc (so distributed links render every new section). See [[API Contracts]].

## A persistent source of bugs
The digital dashboard's upload + gallery flows generated most of the project's bugs because the UI reads from a 15s poller and multiple uploads race on a shared `media[]` array. See [[Optimistic UI Pattern]] and [[Known Bugs]] (BUG-O002, BUG-O003, BUG-R011, BUG-R012). Fixes: Firestore transactions for read-modify-write, optimistic local updates, pending-paths merge against poll results, resumable GCS uploads, and `getDownloadURL` instead of signed URLs.
