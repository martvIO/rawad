# Co-maintainer Onboarding — first week

For a new maintainer taking shared ownership of Dawa (dawa-aa793). The goal:
by end of week one you can run the app locally, find your way around, and ship a
small change to prod safely — with someone watching the first time.

Read order: this file → [../CLAUDE.md](../CLAUDE.md) (working agreement + git/deploy
rules) → [architecture.md](architecture.md) → [USER-FLOWS.md](USER-FLOWS.md) →
[RUNBOOK.md](RUNBOOK.md). Browse the wiki hub at `wiki/index.md` for the "why".

## Day 1 — get it running locally
- [ ] Install prerequisites: **Node 20+**, **Java 21** (emulators need it),
      `npm i -g firebase-tools`.
- [ ] `npm install && npm install --prefix frontend && (cd backend/functions && npm install)`
- [ ] `npm run test:unit` — should pass fast, no emulator. If red, stop and ask.
- [ ] `npm run dev:full` — boots emulators + Vite together.
- [ ] `npm run emulators:seed` (second terminal) — creates admin/groom/driver.
- [ ] Log in at `http://localhost:5173/portal/login` as each role.

## Day 2 — learn the shape
- [ ] Read `architecture.md` + `docs/CODEBASE_ORGANIZATION.md` (where code goes).
- [ ] Skim `USER-FLOWS.md` — the REST call map for every flow.
- [ ] Read the [Security Model](security.md): assertAdmin → RTDB rules → Storage
      rules → (non-authoritative) UI guard. JWT claims carry role + username.
- [ ] Run the full e2e suite once: `npm run test:e2e --prefix frontend` (or one
      project: `npx playwright test --project=chromium`).

## Day 3 — run the verification tools
- [ ] Walk `SMOKE_TEST.md` §D against the emulator.
- [ ] Do the §G real-device pass on your own phone (mobile-first app).
- [ ] Read `RUNBOOK.md` end to end — especially restores (§3) and rollback (§5).

## Day 4 — ship something small (shadowed)
- [ ] Pick a tiny fix (copy, a test). Branch, commit (conventional message),
      open a PR. Confirm CI runs.
- [ ] Pair with the primary operator for the first **deploy** — do NOT deploy
      solo in week one. Watch `firebase functions:log` after.
- [ ] Smoke-test the hosted URL after deploy.

## Day 5 — operational literacy
- [ ] Find where prod data lives (RTDB shards, Firestore digital invites,
      Storage proofs) via `firebase_structure.md`.
- [ ] Confirm you can read `/api/health` and the admin analytics dashboard.
- [ ] Review the open items in `product-audit-2026-06-13.md` + `wiki/` audits.

## Access checklist (least privilege first)
Grant in this order; promote only after the shadowed deploy:
- [ ] GitHub repo (write)
- [ ] Firebase/GCP project (start: Viewer → then Editor)
- [ ] Read-only prod (Firebase console) before any write access
- [ ] Secrets (Stripe, WhatsApp, AWS) — **last**, and never via chat/email
- [ ] ✅ Secrets are NOT in git history (verified): the admin-SDK key + `functions/.env`
      are gitignored and were never committed. Before relying on this, run `gitleaks`
      on a fresh clone of the remote to confirm across all branches/PRs (RUNBOOK §7).
      The on-disk key is the real risk — keep it out of shared/synced folders.

## Hard rules (from CLAUDE.md)
- **Ask before** any website feature change or any DB/rules change.
- **Never `git add -A`** — the admin-SDK key lives in the repo root. Stage
  specific files.
- Test changes via Playwright before closing a task.
- Commit early/often with conventional messages; never push secrets.
