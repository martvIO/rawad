#!/usr/bin/env bash
# Session-end finalize — the DETERMINISTIC tail of the end-of-session checklist
# in CLAUDE.md. Run this AFTER Claude has done the Playwright test+fix, the
# wiki-brain update, and the commit+push (those steps need reasoning / safe
# file-staging, so they are NOT in here).
#
# Steps: unit-test gate -> build frontend + functions -> deploy to Firebase.
set -uo pipefail

PROJECT="dawa-aa793"

echo "[session-end] 1/3 Unit tests (gate)..."
npm run test:unit || { echo "[session-end] ABORT: unit tests failed — fix before deploying."; exit 1; }

echo "[session-end] 2/3 Build (frontend + functions)..."
npm run build || { echo "[session-end] ABORT: frontend build failed."; exit 1; }
( cd backend/functions && npm run build ) || { echo "[session-end] ABORT: functions build failed."; exit 1; }

# ── Dirty-tree guard (added 2026-07-17) ────────────────────────────────────
# This script builds from the working tree ON DISK, not from a commit — so a
# dirty tree deploys whatever happens to be lying around. That bit us when two
# Claude sessions shared this checkout: ending one session would have shipped
# the other's 76 uncommitted files (new CSP, hosting rewrites, self-hosted
# fonts) to production mid-flight.
#
# Step 3 of the CLAUDE.md checklist commits + pushes before this hook runs, so
# on a normal session the tree is already clean here and this is a no-op. A
# dirty tree means something is unfinished — which is exactly when an automatic
# prod deploy is most dangerous. Skipping is safe: the tests and build above
# still ran, and nothing is lost but the deploy, which can be run by hand.
if [ -n "$(git status --porcelain 2>/dev/null)" ] && [ "${DAWA_ALLOW_DIRTY_DEPLOY:-}" != "1" ]; then
  echo "[session-end] 3/3 SKIPPED — the working tree has uncommitted changes:"
  git status --short | head -20
  echo "[session-end]"
  echo "[session-end] Refusing to auto-deploy: this script builds from DISK, so deploying"
  echo "[session-end] now would ship the above to production, reviewed or not."
  echo "[session-end] Commit/stash what belongs, then deploy by hand:"
  echo "[session-end]     npx firebase deploy --project $PROJECT"
  echo "[session-end] Or, having reviewed every file listed above:"
  echo "[session-end]     DAWA_ALLOW_DIRTY_DEPLOY=1 .claude/hooks/session-end.sh"
  exit 0
fi

echo "[session-end] 3/3 Deploy to Firebase ($PROJECT)..."
npx firebase deploy --project "$PROJECT" --non-interactive || { echo "[session-end] ABORT: firebase deploy failed."; exit 1; }

echo "[session-end] Done — deployed to $PROJECT. Smoke-test the hosted URL."
