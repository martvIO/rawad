# Project Context — Dawa (دعوة)

## What This Is

Dawa ("Invitation" in Arabic) is a wedding-invitation management and distribution platform for the Arab/Israeli market.

**Origin**: Rewritten from a single 4,858-line `App.jsx` backed by `localStorage` into a production Firebase application.

## Business Problem

In the Arab/Israeli cultural context, wedding invitations are traditionally delivered by hand. The process is:
1. A groom has hundreds of guests to invite.
2. Drivers physically deliver printed invitations to each address.
3. Guests confirm attendance via phone or in-person.
4. The groom (and an admin) need to know who received their invitation and who confirmed.

Dawa digitizes this workflow end-to-end:
- Guests get personalized WhatsApp links.
- Drivers upload photo proof of delivery at each address.
- Drivers share live GPS so the groom can track the route in real-time.
- Guests can confirm via a public form that auto-matches to their guest record.
- Admins manage all users and oversee operations.

## Three User Roles

**Admin**
- Creates and manages all portal accounts (groom, driver, admin)
- Views all confirmations with fuzzy phone/name/address matching (GREEN/RED/Unknown)
- Edits guest data across all grooms
- Sends WhatsApp bulk messages to guests
- Controls the WhatsApp message template and confirmation form link
- Reviews and manages design requests from grooms

**Groom**
- Two invite types: *Handwritten* (physical delivery) or *Digital* (WhatsApp link only)
- Handwritten: manages guest list, views delivery stats, sees proof photos, watches live driver map
- Digital: manages digital guest list, uploads wedding background media, views photographer files, submits custom design requests

**Driver**
- Picks which groom's delivery route to serve
- Views city-grouped delivery list, marks guests delivered, uploads proof photos
- Shares live GPS with selected grooms
- Sees map of all guest locations for navigation

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Routing | react-router-dom v7 |
| Styling | 100% inline styles + design tokens in `src/styles/theme.js` |
| i18n | Custom `makeT(lang)` factory — Arabic (default) + Hebrew |
| Maps | Leaflet 1.9.4 (lazy CDN injection) |
| Auth | Firebase Auth (proxied via REST API — no Auth SDK on frontend) |
| REST API | Express app on Cloud Functions v2 (TypeScript, Node 20) |
| Primary DB | Firebase RTDB |
| Secondary DB | Firestore (digital invites) |
| Storage | Firebase Storage (proof photos, digital media) |
| Testing | Vitest + @firebase/rules-unit-testing |
| Deploy | Firebase Hosting + Cloud Functions |

## Key Architectural Decisions

See `DECISIONS.md` for the full rationale behind each choice.

**No Firebase SDK on the frontend** — the client uses a custom `tokenManager.js` + `apiClient.js` + `poller.js` layer that talks to a REST API. This removes the 300 KB Firebase SDK from the client bundle and makes the API backend-agnostic.

**Polling instead of real-time** — REST polling (15–30s intervals via `poller.js`) replaces `onValue` RTDB subscriptions for most data. Live driver GPS still uses SSE.

**RTDB sharded by groomUid** — `/guestsByGroom/{uid}` means grooms and drivers only `.read` their own subtree. Flat paths with per-child rules don't work for non-admin RTDB listeners.

**Synthetic email auth** — Users don't have real emails. Firebase Auth uses `username@dawa.local` synthetic addresses; the REST API accepts just `{ username, password }`.
