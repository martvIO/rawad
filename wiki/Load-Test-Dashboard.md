# Load-Test Dashboard

A **local-only** web control panel for the [[Dawa]] Locust load-test suite (`loadtest/`).
Replaces the CLI-only workflow (`run.py` + flags + a hardcoded `CONFIG` block) with a
browser UI that configures everything, runs/aborts tests with live monitoring, **always
cleans up every LOADTEST record afterward**, and keeps an archived run history with
side-by-side comparison. Built 2026-06-13. Never deployed — binds `127.0.0.1` only.

## Architecture

- **Frontend** — React 18 + Vite (`loadtest/ui/`), inline styles ([[Inline Styling Convention]]),
  3 tabs: Configure / Run / History. Live charts via `recharts`.
- **Backend** — FastAPI (`loadtest/dashboard/`) on `127.0.0.1:8765`, serves the built SPA from
  `ui/dist`. Runs in the existing `loadtest/.venv`.
- **Single command** — `powershell -File loadtest/start-dashboard.ps1` (installs deps, builds the
  UI if missing, launches, opens a browser).

### Locust integration (the key constraint)
`locustfile.py` calls `gevent.monkey.patch_all()` at import, which would break uvicorn's asyncio
loop — so the FastAPI process **never imports it**. Instead `runner.py` spawns Locust as a
**subprocess in web mode** (`--autostart --autoquit 5 --web-port 8089`), polls its JSON
`/stats/requests` every 2 s, and relays snapshots to the browser over **SSE**. Abort = graceful
`GET /stop` (so the `@events.test_stop` listeners still flush `status_breakdown.csv` /
`page_ttfb.csv`) then terminate so the `LoadTestShape` can't restart it.

### Config flow
Run parameters travel as a JSON file: the dashboard writes `out/run_config.json`, sets
`LOADTEST_CONFIG_FILE`, and the locustfile reads it into `_CFG` with precedence **env var > _CFG >
literal default** (CLI use unchanged). "Smoke mode" is just `ramp_stages: [[5,15,5]]`. Credentials
NEVER go in the config/presets — they live in the gitignored `loadtest/.env`
(`LOADTEST_ADMIN_USER/PASS`, `LOADTEST_GROOM_USER/PASS`) and are injected as env vars.

## Always-on cleanup (no toggle)
After every run (normal end, abort, or crash) cleanup runs in 3 steps, reported per-step in the UI:
1. **guests_wishes** — delete LOADTEST-tagged digital guests + wishes via the groom API
   (`cleanup_core.cleanup_guests_and_wishes`).
2. **server_purge** — `DELETE /api/admin/loadtest-data` (new admin endpoint, see [[Security Model]]).
   Deletes ONLY LOADTEST-marked records: RTDB `/confirmations` (submittedName/submittedCity),
   `/inviteTokens` (guestName), Firestore guests (name prefix range) + wishes (who/what). Guarded by
   `requireAuth + requireAdmin` + a 30/hr uid rate-limit; never wipes whole nodes.
3. **artifacts** — inventory only; `out/` keeps the latest run, the Archive button copies it to
   `out/runs/<ts>/` with a `meta.json` (powers History + Compare).

Two deletion paths exist (user chose "Both"): the dashboard calls the **deployed endpoint**; the
**`backend/scripts/cleanup-loadtest.cjs`** Admin-SDK script is the manual fallback (emulator + prod,
`--dry-run`). The shared `loadtest/cleanup_core.py` is framework-free (requests-only) and is used by
both the dashboard and `run.py --cleanup`.

## Verification (2026-06-13, against the Firebase emulator)
Full Playwright E2E: config flow UI→server→Locust, live RPS/users/latency charts with a p95-SLO
reference line, live endpoint table, **create→delete cleanup roundtrip** (a run created 1 guest /
5 wishes / 1 confirmation / 1 invite-token; cleanup removed all), verdict + 4 PNG charts, archive,
history list, compare overlays, and the production-confirm modal (disabled until you type the
hostname; localhost starts immediately). Two Locust-2.44 fixes were found and applied: per-endpoint
p95 key is `response_time_percentile_0.95`; per-interval user count must be the max across rows
(the Aggregated row reports 0 under `LoadTestShape`).

## Going to production
To clean up real prod data, the `DELETE /api/admin/loadtest-data` Cloud Function must be deployed
(`firebase deploy --only functions`) and real admin/groom credentials placed in `loadtest/.env`.
The dashboard itself is never deployed.

Related: [[Dawa]] · [[Security Model]] · [[Digital Invitations]] · [[REST API Architecture]] · [[Inline Styling Convention]]
