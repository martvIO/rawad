---
date: 2026-05-26
sources:
  - PROJECT_CONTEXT.md
  - README.md
  - CLAUDE.md
tags: [project, hub, dawa, wedding-invitations]
---

# Dawa (دعوة)

**Dawa** ("Invitation" in Arabic) is a wedding-invitation management and distribution platform for the Arab/Israeli market. It digitizes the traditional hand-delivery workflow: a groom invites hundreds of guests, drivers physically deliver printed invitations and upload photo proof, and guests confirm attendance — all tracked end-to-end.

**Origin:** rewritten from a single 4,858-line `App.jsx` backed by `localStorage` into a production Firebase application.

## The workflow
1. Guests get personalized WhatsApp invite links.
2. Drivers physically deliver invitations and upload photo proof per address.
3. Drivers share live GPS so the groom tracks the route in real time.
4. Guests confirm via a public form that fuzzy-matches to their guest record.
5. Admins manage all users and oversee operations.

## Tech stack
- **Frontend:** React 18 + Vite, react-router-dom v7, [[Inline Styling Convention]], custom Arabic/Hebrew i18n
- **Backend:** Express on Cloud Functions v2 (TypeScript, Node 20) — see [[REST API Architecture]]
- **Data:** Firebase RTDB (primary) + Firestore (digital invites) — see [[Data Storage Model]]
- **Maps:** Leaflet 1.9.4 (lazy CDN injection)

## Start here
- **People:** [[User Roles]] (Admin · Groom · Driver)
- **Architecture:** [[REST API Architecture]] · [[Authentication]] · [[Polling and Realtime]] · [[Security Model]] · [[Digital Invitations]]
- **Reference:** [[API Contracts]] · [[Data Storage Model]] · [[Architecture Decisions]]
- **Operations:** [[Admin Analytics]] · [[Known Bugs]] · [[Tasks Backlog]] · [[AI Engineering Rules]]

## Key facts
- Firebase project ID: `dawa-aa793` · hosted at `dawa-aa793.web.app`
- Two invite types: **Handwritten** (physical delivery) and **Digital** (WhatsApp link only)
- No Firebase SDK on the client — all data flows through a [[REST API Architecture|REST API]]
