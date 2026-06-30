# Comprehensive Test Harness

A multi-layer automated test + feedback harness that exercises the whole app —
every screen, form, button, and the multi-feature flows that span roles — and
emits one consolidated report plus auto-filed GitHub issues. Built on top of the
existing Playwright + vitest setup. See [[Architecture-Decisions]], [[REST-API-Architecture]],
[[QA Analytics and Ops Hardening 2026-06-20]].

## What it does

One command — `npm run test:full` — drives all layers against the local emulator
suite (assumes `npm run dev:full` is already running), then renders a report and
(in CI) files issues. `npm run test:full:prod` runs a read-only smoke against the
live site; `npm run test:full:update` refreshes visual baselines.

| Layer | What | Where |
|---|---|---|
| Unit | existing FE + BE pure-logic | `npm run test:unit` |
| Security rules | RTDB/Firestore/Storage | `npm test` |
| **API routes** (TASK-006) | supertest-style over the Functions emulator; status codes, role-guards (401/403), validation, token states | `backend/tests/api/*` + `npm run test:api` |
| Feature specs | per-screen render + interactions (admin, auth, public, **groom digital** = live track) | `frontend/e2e/features/`, `frontend/e2e/*.spec.ts` |
| **Cross-role journeys** | 7 end-to-end stories chaining roles | `frontend/e2e/journeys/` |
| **Crawler** | logs in per role, sweeps every screen, flags console/page errors, broken images, leaked i18n keys, 4xx/5xx | `frontend/e2e/crawler/crawl.spec.ts` |
| **Visual regression** | pixel-diff deterministic public screens (stabilized) | `frontend/e2e/visual/` |
| a11y | axe on public (gate) + authed (report-only) | `frontend/e2e/a11y-axe.spec.ts`, `a11y/a11y-authed.spec.ts` |
| i18n sweep | AR+HE render + RTL + no leaked keys | `frontend/e2e/i18n/` |
| Prod smoke | `@prodsafe` read-only render checks | `frontend/e2e/smoke/prod-smoke.spec.ts` |

**Feedback**: a custom Playwright reporter (`frontend/e2e/reporters/consolidated.ts`)
writes `test-report/results.json`; `scripts/build-report.cjs` renders
`test-report/index.html` + `SUMMARY.md` (overview, by-area pass rates, crawler
findings, visual diffs, failures); `scripts/file-issues.cjs` opens **deduped**
GitHub issues per failure/error-finding (stable signature in the issue body).

The 7 journeys: physical delivery, digital lifecycle, paid signup, public confirm,
event lifecycle, admin bulk send, driver live GPS. UI for human-facing flows
(public invite/confirm pages); API for admin-only or non-stably-selectable steps;
external boundaries (WhatsApp, Lemon Squeezy, GPS, camera, face-match) stubbed
(`frontend/e2e/helpers/stubs.ts`).

## Key constraints discovered

- **`FEATURES.physical = false`** (`frontend/src/config/index.js`) — the entire
  handwritten / driver / proof-photo / GPS track is gated OFF (beta, compile-time,
  no runtime toggle). The **digital** track is the live product. Physical UI specs
  (groom handwritten, driver portal) **skip** via `frontend/e2e/helpers/features.ts`
  unless `TEST_PHYSICAL=1`; the physical BACKEND pipeline is still covered by the
  API tests + the physical-delivery journey (which creates guests via the un-gated
  API). See [[Architecture-Decisions]].
- **Emulator RTDB namespace mismatch (fixed)** — the seed wrote `dawa-aa793-default-rtdb`
  but the emulator Functions read the legacy `dawa-aa793` (per `FIREBASE_CONFIG.databaseURL`),
  so seeded reads returned empty (guest list empty, confirmations `unknown_groom`).
  Fixed `backend/scripts/seed-emulator.cjs` to seed the namespace the functions
  read. The app only touches RTDB through the Admin SDK (rules bypassed), so the
  namespace is purely about where data lives. This also fixed the existing e2e
  seeded-data reads. See [[Data-Storage-Model]].
- **Minting a digital invite requires an approved design** — the digital-lifecycle
  journey approves the default design (`POST /digital/:uid/designs/:id/design/set-status`)
  before minting. The digital RSVP requires `submittedPhone`. See [[Digital-Invitations]].
- **Visual regression is scoped to deterministic screens** — the marketing landing
  (huge, animated) and the 3D `/d/` invitation never stabilize, and admin lists are
  data-varying, so they're render-checked elsewhere, not pixel-diffed.

## Run model / CI

`.github/workflows/ci.yml`: `unit` + `build` + `integration` + `api` + `full-suite`
(sharded ×2, Chromium+WebKit, `@visual` excluded) gate every PR; `visual` is
advisory (`continue-on-error`) until linux baselines are committed (snapshots are
platform-specific and the dev machine is Windows); nightly `prod-smoke` runs the
read-only `@prodsafe` set against the live site. The crawler is **report-only by
default** (findings → report + issues); set `CRAWLER_STRICT=1` to make it gate.

## Caveats

- Running the full suite locally is heavy; back-to-back full runs on one machine
  can exhaust the Vite dev server's connections (`ERR_INSUFFICIENT_RESOURCES` →
  cascading `page.goto` timeouts). Mitigated by SSE-stream aborts + third-party
  blocking in the crawler; CI runs sharded/fresh/retried. Validated green: API
  38/38, visual 3/3, journeys 6 pass + 1 graceful skip, run-1 broad suite 76 pass.
- Visual baselines committed are `*-win32.png` (local). CI (linux) needs its own —
  run the `visual` job with `--update-snapshots` once and commit `*-linux.png`.
