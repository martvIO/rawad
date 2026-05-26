---
date: 2026-05-26
sources:
  - PROJECT_CONTEXT.md
  - README.md
tags: [roles, admin, groom, driver, concept]
---

# User Roles

[[Dawa]] has three portal roles, enforced by JWT custom claims (`role: "admin"|"driver"|"groom"`) and the [[Security Model]]. Routes are gated under `/portal/{role}/*`.

## Admin
- Creates and manages all portal accounts (groom, driver, admin)
- Views all confirmations with fuzzy phone/name/address matching (GREEN/RED/Unknown)
- Edits guest data across all grooms, sends WhatsApp bulk messages
- Controls the WhatsApp message template + confirmation form link (`/adminSettings`)
- Reviews design requests from grooms

## Groom
- Two invite types: **Handwritten** (physical delivery) or **Digital** (WhatsApp link only — see [[Digital Invitations]])
- Handwritten: manages guest list, views delivery stats + proof photos, watches live driver map
- Digital: manages digital guest list, uploads wedding background media, views photographer files, submits custom design requests

## Driver
- Picks which groom's delivery route to serve (assignment grants `assignedGrooms[groomUid]` claim)
- Views city-grouped delivery list, marks guests delivered, uploads proof photos
- Shares live GPS with selected grooms (SSE — see [[Polling and Realtime]])

The `assignedGrooms` claim is what gates a driver's read access to a groom's guest subtree and their proof-photo uploads. See [[Data Storage Model]] and [[Security Model]].
