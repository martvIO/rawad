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

echo "[session-end] 3/3 Deploy to Firebase ($PROJECT)..."
npx firebase deploy --project "$PROJECT" --non-interactive || { echo "[session-end] ABORT: firebase deploy failed."; exit 1; }

echo "[session-end] Done — deployed to $PROJECT. Smoke-test the hosted URL."
