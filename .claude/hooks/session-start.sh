#!/usr/bin/env bash
# SessionStart hook — fast-forward the working tree to origin/main.
# Non-destructive: --ff-only never auto-merges or discards local work.
# If it can't fast-forward (diverged or uncommitted changes), it reports and
# the session continues on the current state.
echo "[session-start] Pulling latest from origin/main (ff-only)..."
git pull --ff-only 2>&1 || echo "[session-start] Skipped: could not fast-forward (diverged history or uncommitted changes). Continuing on current state."
