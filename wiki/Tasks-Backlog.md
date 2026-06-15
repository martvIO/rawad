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
- **TASK-006** — write REST API route tests (`auth`, `users`, `guests`, `confirmations`) — see [[API Contracts]]
- **TASK-007** — document `seed-emulator.cjs`
- **TASK-008** — rotate/remove service-account JSON key from repo root (security — see [[Security Model]])

## Low
- **TASK-009** — code-split portal by route (`React.lazy`); bundle ~775 KB
- **TASK-010** — GitHub Actions CI (lint + tests, block merge on failure)
- **TASK-011** — automate `SMOKE_TEST.md` as Playwright script
- **TASK-012** — update outdated "Current State" in root `CLAUDE.md` to reflect REST migration
