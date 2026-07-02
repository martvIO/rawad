---
date: 2026-05-26
sources:
  - TASKS.md
tags: [tasks, backlog, reference]
---

# Tasks Backlog

Prioritized work for [[Dawa]] (full list in `TASKS.md`).

> Note: TASK-001/002 reference BUG-001/002 which appear resolved in [[Known Bugs]] (BUG-O002/O003, R012) — verify before actioning.

## High
- **TASK-001/002** — DigitalAddGuest submit hang + photo upload stuck state (likely resolved; confirm against [[Known Bugs]]).

## Post-deploy (owner action) — [[Face Matching]]
- **TASK-FACE-1** — enable the Firestore TTL policy that auto-deletes enrolled guest descriptors at token expiry (one-time, NOT in firebase.json):
  `gcloud firestore fields ttls update expireAt --collection-group=guestFaces --enable-ttl --project dawa-aa793`
- **TASK-FACE-2** — backfill existing published photos after deploy: `POST /api/digital/{groomUid}/photographer/reindex` (admin) for each groom with already-published photographer files.
- **TASK-FACE-3** — manual phone smoke of the camera/liveness scan (can't be tested headlessly — needs a real face).

## Medium (tech debt)
- ~~**TASK-003** — audit/remove `face-api.js`~~ **OBSOLETE**: `face-api.js` is now load-bearing for [[Face Matching]] (browser descriptor extraction); the server uses `@vladmandic/face-api`. Keep both pinned — version bumps break descriptor compatibility.
- **TASK-004** — delete unused `re.js` from root
- **TASK-005** — remove stale legacy callable Cloud Functions, clean `index.ts` exports
- ~~**TASK-006** — write REST API route tests (`auth`, `users`, `guests`, `confirmations`)~~ **DONE** (2026-06-29): `backend/tests/api/*` (38 tests, role-guards + validation + token states), `npm run test:api`. See [[Comprehensive-Test-Harness]].
- **TASK-007** — document `seed-emulator.cjs`
- **TASK-008** — rotate/remove service-account JSON key from repo root (security — see [[Security Model]])

## UX opportunity backlog (2026-07-02 — from [[UX Research Discovery 2026-07-02]], each item needs its own go-ahead)
Owner funded **all four clusters** in the interview; sequence by impact. Baseline usability test
([[Usability Test Plan 2026-07]]) runs BEFORE these land, re-test after.
- **TASK-UX-1 (S, highest impact)** — guest first-load: skeleton/hero placeholder + skip-intro path + fix `.dawa-inv-cue` hardcoded `left:50%` → logical properties (`InviteStyles.jsx`)
- **TASK-UX-2 (M)** — confidence layer: per-guest sent/delivered/read via [[WhatsApp Messaging]] states, last-synced chip, design-review notification, "why admin sends" explainer, filtered-count fixes
- **TASK-UX-3 (M)** — safe actions: undo-toast guest delete (replace instant swipe-delete), themed bulk-send confirm modal, driver upload progress + retry queue
- **TASK-UX-4 (M, compounding)** — design-system adoption sweep: hand-rolled modals → `ui/Modal`, 133+ hardcoded colors → tokens, `left/right` → logical properties, ≥44px touch targets
- **TASK-UX-5 (M, decided feature)** — editable RSVP + change log (see [[Digital Invitations]] "DECIDED, not built")
- **TASK-UX-6** — guest funnel metrics (link-open → envelope-open → RSVP) — needs a DB-writing endpoint (ask-first rule)
- **TASK-UX-7 (owner polish targets)** — landing page + portal look & feel passes; landing scroll-reveal no-JS/reduced-motion fallback; GPS-accuracy ≥500m warning
- ~~**TASK-UX-8** — phone input dial-code-only (remove flag emoji)~~ **DONE 2026-07-02** (`PhoneInput.jsx`)

## Low
- **TASK-009** — code-split portal by route (`React.lazy`); bundle ~775 KB
- **TASK-010** — GitHub Actions CI (lint + tests, block merge on failure)
- ~~**TASK-011** — automate `SMOKE_TEST.md` as Playwright script~~ **DONE** (2026-06-29): `npm run test:full` (crawler + journeys + visual + i18n/a11y) + `npm run test:full:prod` read-only prod smoke (`@prodsafe`). See [[Comprehensive-Test-Harness]].
- **TASK-012** — update outdated "Current State" in root `CLAUDE.md` to reflect REST migration
