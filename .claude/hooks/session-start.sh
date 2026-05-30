#!/usr/bin/env bash
# SessionStart hook — fast-forward the working tree to origin/main.
# Non-destructive: --ff-only never auto-merges or discards local work.
# If it can't fast-forward (diverged or uncommitted changes), it reports and
# the session continues on the current state.
echo "[session-start] Pulling latest from origin/main (ff-only)..."
git pull --ff-only 2>&1 || echo "[session-start] Skipped: could not fast-forward (diverged history or uncommitted changes). Continuing on current state."

# Best-effort check that the Playwright MCP server is launchable.
# (True MCP connection status is harness-managed; this only verifies the package
# resolves/launches, so it can warn early if the browser-test tooling is missing.)
echo "[session-start] Checking Playwright MCP availability..."
if npx --yes @playwright/mcp@latest --version >/dev/null 2>&1; then
  echo "[session-start] Playwright MCP package available."
else
  echo "[session-start] WARNING: Playwright MCP not reachable — check .claude/settings.local.json or run 'npx @playwright/mcp@latest'."
fi

# Reminder: actively engage the wiki-brain before substantive work (see CLAUDE.md
# "Start of session — read the wiki-brain"). Claude must act on this; a hook can
# only surface the directive, not invoke the skill itself.
echo "[session-start] ACTION REQUIRED — read the wiki-brain before any work: (1) read wiki/index.md, (2) run /recall, (3) invoke /wiki-brain."
