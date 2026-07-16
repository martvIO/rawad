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
- **TASK-WA-1 (owner, blocks real-number cutover)** — pass Meta **business verification** for portfolio dawa.invitation (error 141010 hard-blocks registering +972 52-581-5460; see [[WhatsApp Messaging]] "Cutover execution 2026-07-06"). Fastest route: resume Security Centre → Business verification wizard with **legal business name = owner's personal legal name** (trade name "Dawa") + upload a personal **bank statement / tax document** bearing that name (address שדרות הציונות 36 א, חיפה). Alternative: register an עוסק פטור and use its certificate. Until then prod stays on the test number (allow-listed recipients only).

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
- **TASK-DEPLOY-1** — fix the predeploy ordering (build [[Digital Invitations|deploy gotcha]], found 2026-07-03): `firebase deploy` runs the **functions** predeploy before **hosting**, so `build-functions.cjs` bundles a possibly-stale `frontend/dist/index.html` into `digitalInvitePreview`/`digitalOgImage`, and they serve a one-build-old SPA shell (wrong JS bundle) on `/d/**`+`/invite/**`. Fix: make `build-functions.cjs` build the frontend first (or have hosting predeploy run first / share one build step). Current workaround: `npm run build` before `firebase deploy`.
- **TASK-DEPLOY-2** — grant the deploy service account `cloudscheduler.jobs.update` (or Cloud Scheduler Admin) so a **full** `firebase deploy` stops 403-ing on the 6 scheduled functions (`backupRtdb`, `sendRsvpReminders`, `purgeExpiredFaces`, `finalizeWeddingCancellations`, `purgeOldAuditLogs`, `reclusterDirtyGalleries`). Until then, deploy invite changes with `--only hosting,functions:digitalInvitePreview,functions:digitalOgImage`.

## Templates (2026-07-14 — from the reel-templates grilling in [[Digital Invitations]], needs its own go-ahead)
- **TASK-TPL-1** — design + build the **reel-template port pipeline**: take a Claude Design HTML mockup + spec (produced via `docs/REEL-TO-TEMPLATE-PROMPT.md`) and land it as a selectable template — template registry, groom editor picker, native-theme token registration, per-template `envelopeEnabled:false` default, sealed-tap intro component, and how a template interacts with the design approval state machine + mint-time `designSnapshot`. Blocked on: owner producing the first mockup+spec from a reel.
- **TASK-TPL-2 (IN PROGRESS — scope widened 4 → 9 on 2026-07-16)** — build the **full template
  catalogue**. `classic` + `destination-love` are LIVE. **7 to build**, reviewed one at a time:
  `dolce-vita` → `sacred-garden` → `blossom-oud` → `template2` → `template3` → `template5` →
  `gilded-orchard`. Preceded by **Phase 0: multi-day `events` everywhere**.
  - **Scope reversal (owner, 2026-07-16):** the earlier "top-4 flagships only" decision is superseded —
    ALL 8 webgency designs are in (the 3 previously skipped = `template2`/`template3`/`template5`,
    marketing names Vibrant Vows / Royal Gold / Minimalist, confirmed at scout), plus the revived
    `gilded-orchard`. **Still excluded: "Eternal Romance" (`jathuandthanu`)** — a real couple's
    personalized page, not a generic template.
  - **Wave 1 usability gate DOWNGRADED to non-blocking** (owner, 2026-07-16): build now, gate later.
    Rationale: the sealed-tap behaviour lives in ONE shared file (`useIntroPhase`), so a Wave 1 finding
    changes it once and all 9 templates inherit it — that is exactly what the seam was built for. The
    gate itself ([[Usability Templates Test Plan]]) is still worth running; it just no longer blocks.
  - Plan: `~/.claude/plans/search-and-think-and-delegated-allen.md`. See [[Digital Invitations]].
- **Parked:** the **gilded-orchard scaffold** is stashed (`git stash` on main, 2026-07-15) — events-schedule revival + bg decorations (string lights / vine borders / fountain) + `gildedOrchard` palette. Recover if it becomes a 5th template; cherry-pick the `events` schema if a webgency template needs a multi-day schedule.

## UX opportunity backlog (2026-07-02 — from [[UX Research Discovery 2026-07-02]], each item needs its own go-ahead)
Owner funded **all four clusters** in the interview; sequence by impact. Baseline usability test
([[Usability Test Plan 2026-07]]) runs BEFORE these land, re-test after.
- **TASK-UX-1 (S, highest impact)** — guest first-load: skeleton/hero placeholder + skip-intro path + fix `.dawa-inv-cue` hardcoded `left:50%` → logical properties (`InviteStyles.jsx`)
- **TASK-UX-2 (M)** — confidence layer: per-guest sent/delivered/read via [[WhatsApp Messaging]] states, last-synced chip, design-review notification, "why admin sends" explainer, filtered-count fixes
  - *Partly addressed 2026-07-16*: the guest-side half is now measured (open/load/RSVP funnel — [[Guest Experience Metrics]]); the per-guest sent/delivered/read chips + last-synced indicator remain.
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
