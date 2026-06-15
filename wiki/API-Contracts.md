---
date: 2026-05-26
sources:
  - API_CONTRACTS.md
tags: [api, rest, reference]
---

# API Contracts

Reference summary of the [[Dawa]] [[REST API Architecture|REST API]]. Full request/response shapes live in `API_CONTRACTS.md`.

Base URL: `https://us-central1-dawa-aa793.cloudfunctions.net/api` · prod via same-origin `/api/**` rewrite. All bodies JSON; authed requests send `Authorization: Bearer <idToken>`; errors return `{ "error": "<code>" }`.

## Resource routers
| Router | Notable routes | Access |
|---|---|---|
| `/auth` | login, logout, refresh, me, send-otp, verify-otp, reset-password | public + authed; see [[Authentication]] |
| `/users` | GET/POST/PATCH/DELETE | admin only |
| `/guests` | GET/POST/PATCH/DELETE `:groomUid/:guestId` | role-scoped |
| `/confirmations` | POST (public, 5/hr/IP), GET/PATCH (admin) | mixed |
| `/invites` | POST create token, `:token/submit` (public), GET `:token` | mixed |
| `/assignments` | POST/GET — driver self-assigns to groom | driver |
| `/live-locations` | GET SSE stream, POST/DELETE fix | see [[Polling and Realtime]] |
| `/proofs` | POST upload (multipart), GET list | driver / groom+admin |
| `/digital` | guests, media, photographer CRUD; `:uid/photographer/reindex` (face backfill) | see [[Digital Invitations]] |
| `/digital/photos` | GET `matches`, POST/DELETE `enroll` — public token-credential face matching | see [[Face Matching]] |
| `/settings` | GET (authed), PATCH (admin) | `messageBody`, `formLink` |
| `/health` | GET uptime | public |

**Face-matching endpoints** ([[Face Matching]], mounted at `/digital/photos` BEFORE `/digital` so `:uid` can't capture `photos`):
- `GET /digital/photos/matches?token=` → status-shaped `200 {published, enrolled, expiresAt, matches:[{fileId,name,url,distance}]}`; token errors are 400/404/410
- `POST /digital/photos/enroll {token, descriptor[128]}` → stores the guest descriptor (after consent) + returns first matches; `400 invalid_descriptor`, `409 not_published`
- `DELETE /digital/photos/enroll {token}` → erase the guest's face data (idempotent)

## Error codes
`invalid_credentials`, `refresh_failed`, `session_expired`, `missing_fields`, `username_taken`, `phone_taken`, `weak_password`, `token_not_found`, `token_used`, `token_expired`, `too_many_requests`, `not_found`, `internal_error`, `server_misconfigured` (WEB_API_KEY unset), `phone_verified_session_required`, `phone_does_not_match_account`, `no_account_for_phone`.

Authorization for these routes is enforced per the [[Security Model]].
