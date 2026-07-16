# Admin Analytics

The admin portal's **operator command center** — a cross-platform analytics dashboard
that answers, at a glance: *is the business healthy* (revenue/conversion), *are
operations running* (delivery/drivers/RSVP), and *where must the admin intervene today*
(triage). Built 2026-06-19. It is distinct from the per-groom dashboards
([[Dawa]] groom views), which are single-wedding and customer-facing — this is the
all-grooms, business-level view nobody had before.

Closes the top gap from [[Product Audit 2026-06-13]] ("no payments/analytics"), built on
the roadmap from [[Audit Remediation 2026]].

## Where it lives

| Piece | Path |
|---|---|
| Nav tab + route (`📊 التحليلات / אנליטיקה`) | `frontend/src/pages/portal/admin/AdminPortal.jsx` (`/portal/admin/analytics`, lazy-loaded) |
| Page (recharts) | `frontend/src/pages/portal/admin/AdminAnalytics.jsx` |
| Service | `frontend/src/services/analytics.js` → `getAnalytics(window)` |
| Endpoint | `GET /admin/analytics` in `backend/functions/src/api/routes/admin.ts` |
| Pure aggregator | `backend/functions/src/api/analytics/aggregate.ts` |
| Unit tests | `backend/tests/functions/analyticsAggregate.test.ts` (12 tests) |

## Architecture

All numbers are aggregated **server-side** — the browser never crunches all-grooms data.
The endpoint reads every relevant node ONCE via the Admin SDK (mirrors the sharded
all-guests read in `guests.ts` and the `collectionGroup` design read in
`workflow.routes.ts`), hands raw records to the pure aggregator, and returns one payload.
See [[REST API Architecture]].

- **Guard chain** mirrors `GET /admin/audit`: `requireAuth + requireAdmin + uidRateLimit("analyticsRead",60,HOUR_MS)`, plus a **45 s in-memory cache** keyed by window (the reads are heavy: all users/guests/confirmations/tokens/assignments + 2 Firestore collection-group scans).
- **`?window=30d|90d|all`** controls the trend span only (30d/90d daily buckets, all = weekly over a year).
- **aggregate.ts is pure / I-O-free** → unit-testable without the emulator. The endpoint just reads + calls `buildAnalytics()`.

### Response sections
`composition` (user counts by role) · `revenue` (paid total ILS, plan mix, none→pending→paid
funnel, ARPU, avg time-to-pay) · `operations` (delivery %, 6-status outcome breakdown,
proof-photo rate, driver leaderboard) · `rsvp` (invites sent vs confirmed, expected
headcount, digital attending/absent/pending) · `designs` (status mix, approvals/rejections,
avg pending→approved — see [[Digital Invitations]] design state machine) · `triage` (the
needs-attention queue) · `trends` (signups/payments/confirmations/invites time-series).

### Triage queue (the actionable part)
Each item deep-links to the relevant admin tab: `design_pending`→designs,
`payment_pending`→users, `no_driver`→users, `low_delivery`→confirmations,
`wedding_soon`→confirmations.

## Honesty constraints (load-bearing data truths)

The page deliberately does **not** fabricate metrics the data model can't support:
- **No delivery time-series** — `guest.deliveredAt` is a localized **HH:MM string**
  (`usePortalState.js`), not a timestamp. Delivery is a current-state count only.
- ~~**No invite-"open" rate**~~ — **RESOLVED.** Opens are first-party tracked
  (`viewedAt`, stamped by `/invites/digital/opened`); the aggregator has returned
  `digitalOpened`/`digitalOpenRatePct` since 2026-06-19, and the page finally
  *renders* them as of 2026-07-16. Full load/open/RSVP funnel:
  [[Guest Experience Metrics]].
- **No payment "failed" state** — Stripe only records `pending|paid` ([[Payments]]), so
  `failedCount` is surfaced as 0, never invented.
- Expected headcount comes from `/confirmations` only (it already mirrors digital submits as
  `dg_*` ids) to avoid double-counting digital RSVPs.

## Frontend conventions

recharts (`^2.15`, lazy-loaded so its ~116 KB gz chunk stays out of the main bundle).
recharts is LTR-only, so **every chart sits in a `dir="ltr"` wrapper** while the RTL
Arabic/Hebrew chrome surrounds it. Reuses `Num` (digit bidi — [[Digit Normalization]]),
`ProgressBar`, `SkeletonList`, `.card`/`.gold-card`, `C.*` tokens
([[Inline Styling Convention]]), and the AdminAuditTab loading/error/empty pattern.
Bilingual labels via an inline `tt(lang, ar, he)` helper (matching AdminDesigns) — no new
i18n keys. Dates formatted with `numberingSystem:"latn"`.

## Verified (2026-06-19)

445 FE + 185 BE unit tests green (the +12 are the aggregator tests); functions `tsc`
clean; frontend build clean (AdminAnalytics code-split into its own chunk). Playwright MCP
against the emulator (enriched data): all 7 sections render, 20 recharts surfaces / 8 pie
slices / 4 bars / 4 trend lines mount, revenue/headcount/triage values correct, and the
AR↔HE toggle switches every label. Console errors during the test were unrelated (a fake
`proofPhotoPath` test value hitting `/proofs/url`).

## Status — SHIPPED (2026-06-19)

Committed `4ae4ac8` (`feat(admin): analytics command center …`), fast-forwarded onto
`main` (alongside the parallel session's `7f70c40` digital improvements), pushed, and
**deployed to production** (`dawa-aa793`) — functions + hosting + Firestore rules, deploy
clean. Prod smoke-test: landing `200`, `/api/health` ok, `/api/admin/analytics` →
`401 unauthenticated` (route deployed + admin-gated). Live for any logged-in admin at
https://dawa-aa793.web.app/portal/admin/analytics — the tab sits first in the admin nav.

## Follow-ups

- ~~Instrument invite-open tracking to complete the RSVP funnel~~ — **DONE**
  (open ping + full load/open/RSVP funnel, [[Guest Experience Metrics]], 2026-07-16).
- The endpoint now also reads `metricsDaily` with a bounded `day >= …` range query
  (never a raw event scan — that is why the rollups exist) and attaches the digital
  guest doc `id` so a guest can be joined to the template their token was minted with.
