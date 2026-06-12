export const meta = {
  name: 'build-loadtest-dashboard',
  description: 'Build local FastAPI+React load-test control dashboard with always-on full cleanup',
  phases: [
    { title: 'Foundation', detail: 'Python loadtest core, backend admin cleanup endpoint + Node script, React UI scaffold' },
    { title: 'Dashboard backend', detail: 'FastAPI dashboard: run lifecycle, live SSE, cleanup orchestration, history' },
  ],
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['stream', 'files', 'summary', 'verification'],
  properties: {
    stream: { type: 'string' },
    files: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'action', 'note'],
        properties: {
          path: { type: 'string' },
          action: { type: 'string', enum: ['create', 'edit'] },
          note: { type: 'string' },
        },
      },
    },
    interfaces: { type: 'array', items: { type: 'string' }, description: 'Exact function signatures / route shapes / env vars this stream exposes or consumes' },
    assumptions: { type: 'array', items: { type: 'string' } },
    deviations: { type: 'array', items: { type: 'string' }, description: 'Anything that differs from the spec given' },
    verification: { type: 'string', description: 'What compile/syntax/build check was run and its result' },
    summary: { type: 'string' },
  },
}

const SHARED = `
You are building part of a LOCAL-ONLY load-test control dashboard for the "Dawa" wedding-invitation platform.
Repo root: c:/Users/martv/OneDrive/Documents/github/rawad  (Windows 11, PowerShell is primary shell; a Bash tool also exists.)
The existing load-test suite is Python/Locust under loadtest/. The dashboard is FastAPI (Python) + React (Vite), runs on localhost only, never deployed.

HARD RULES (all agents):
- Do NOT run any git command. Do NOT commit. The orchestrator commits afterward.
- Do NOT start Firebase emulators, do NOT start any long-running server, do NOT run the actual locust load test.
- ONLY create/edit the files explicitly assigned to your stream. Do not touch any other stream's files.
- Do NOT touch anything under frontend/ — it has unrelated uncommitted changes.
- Match existing code conventions in files you edit. UI text is English. No dashboard auth (loopback-only justifies it).
- Windows paths: the venv python is loadtest/.venv/Scripts/python.exe. Use forward slashes in code; the Bash tool works for POSIX commands.
- Your FINAL message must be ONLY the structured object (the schema is enforced). Do the work with tools first, then return the manifest.

=== CONFIG CONTRACT (shared across all streams — follow EXACTLY) ===
A per-run JSON file "run_config.json" is the single source of run parameters. Its schema (also the preset schema; presets may be full or partial, NEVER contain credentials):
{
  "base_url": "https://dawa.to",
  "ramp_stages": [[10,60,10],[50,60,25],[100,60,50],[250,60,50],[500,90,75],[1000,120,100]],   // each = [users, hold_seconds, spawn_rate_per_sec]
  "persona_weights": { "GuestBrowser":60, "InvitePoller":20, "RsvpBuyer":15, "LandingConfirmer":5 },
  "think_min": 1.0, "think_max": 5.0,
  "enable_writes": true, "allow_approve_design": true,
  "fallback_token": "00000000000000000000000000000000", "fallback_groom_username": "groom",
  "p95_ms": 1000, "error_rate_max": 0.01
}
Locust reads this file from env var LOADTEST_CONFIG_FILE. Env var precedence in locustfile: explicit env var (e.g. LOADTEST_BASE_URL) > value in the JSON (_CFG) > hardcoded literal default. "Smoke mode" is NOT a flag from the dashboard — it is simply ramp_stages = [[5,15,5]].
Credentials NEVER go in run_config.json or presets. They are passed as env vars: LOADTEST_ADMIN_USER, LOADTEST_ADMIN_PASS, LOADTEST_GROOM_USER, LOADTEST_GROOM_PASS, read from a gitignored file loadtest/.env.

=== SHARED INTERFACE: cleanup_core.py (Python, in loadtest/) ===
Framework-free module (imports only the 'requests' lib, NEVER imports locustfile/locust/gevent). Public functions, exact signatures:
- login(base_url, username, password) -> dict | None    # returns the JSON from POST {base_url}/api/auth/login (must include idToken and uid); None on failure
- cleanup_guests_and_wishes(base_url, admin, groom) -> dict   # admin/groom are the login() dicts; returns {"guests": int, "wishes": int, "errors": [str,...]}
- purge_server_data(base_url, admin_token, groom_uid) -> dict  # calls DELETE {base_url}/api/admin/loadtest-data; returns {"ok": bool, "deleted": {...}, "error": str|None, "status": int}

=== SHARED INTERFACE: backend endpoint ===
DELETE {base_url}/api/admin/loadtest-data  (admin Bearer token; JSON body {"groomUid": "<uid>"} optional)
Success 200: { "ok": true, "deleted": { "confirmations": n, "inviteTokens": n, "guests": n, "wishes": n } }
Partial failure 500: { "error": "purge_failed", "failedStep": "...", "detail": "...", "deleted": { ...partial... } }

=== SHARED INTERFACE: analyze.py JSON output (verdict.json) ===
{ "slo": {"p95_ms": <num>, "error_rate_max": <num>}, "slo_pass": <bool>,
  "stages": [ {"users":int,"rps":num,"p95":num,"error_rate":num,"healthy":bool}, ... ],
  "healthy_max_users": int|null, "degrade_at": int|null,
  "slowest_endpoints": [ ["<name>", <p95_ms_num>], ... ],
  "genuine_failures": [ ... ], "rate_limited_429": {"count": int, "pct": num} }

=== SHARED INTERFACE: FastAPI dashboard routes (served on http://127.0.0.1:8765) ===
GET/PUT  /api/config              -> RunConfig (defaults merged with loadtest/.lastconfig.json)
GET/PUT  /api/credentials         -> {admin_user, admin_pass, groom_user, groom_pass}  (reads/writes loadtest/.env)
GET      /api/presets             -> [{name, config}]
PUT/DELETE /api/presets/{name}
POST     /api/run                 body {config, confirm_production?} ; 409 if running ; non-localhost host w/o confirm -> 428 {"error":"production_confirmation_required"}
POST     /api/run/stop            -> graceful abort
GET      /api/run/status          -> {state, run_id, started_at, aborted, config, locust:{user_count,state}, error, cleanup_report}
GET      /api/run/stream          -> SSE; events: "state", "stats" (every ~2s), "cleanup", "done"
POST     /api/cleanup/retry       -> re-run only failed cleanup steps
GET      /api/results/latest      -> {verdict, artifacts:[urls], archived:bool}
POST     /api/archive             -> {id}   (copies out/* to out/runs/<YYYYMMDD-HHMMSS>/ + meta.json)
GET      /api/history             -> [meta,...] newest first
GET/DELETE /api/history/{id}
GET      /api/history/{id}/timeseries -> [{t, users, rps, fail_rate, p50, p95, p99}, ...] + endpoint aggregates
GET      /api/compare?a={id}&b={id}   -> {a:{meta,timeseries}, b:{meta,timeseries}}
GET /   (SPA) ; GET /artifacts/latest/* ; GET /artifacts/runs/{id}/*
Stats SSE snapshot shape: { ts, user_count, total_rps, fail_ratio, p50, p95, endpoints:[{name, method, rps, p95, failures}] }
`

const PY_CORE = `
YOUR STREAM: "python-core". Modify the existing Python/Locust suite so run parameters come from a JSON config file, extract shared cleanup logic, and emit machine-readable verdict JSON. CLI usage must keep working unchanged.

FIRST read these files fully so you preserve exact behavior and field names:
- loadtest/locustfile.py  (note: line 39-40 do gevent.monkey.patch_all(); the CONFIG block is roughly lines 64-145; PERSONA_WEIGHTS ~114, RAMP_STAGES ~125, SMOKE_STAGES ~134, StagedRamp class ~504 reads SMOKE_STAGES if env LOADTEST_SMOKE=="1" else RAMP_STAGES)
- loadtest/run.py        (has _login(role) and cleanup(lf) around lines 101-137; note exact endpoints + response fields it already uses — e.g. idToken, uid, the /api/auth/login call, GET/DELETE /api/digital/{uid}/guests and /wishes)
- loadtest/analyze.py    (verdict() prints to stdout; SLO constants hardcoded ~lines 40-41; it reads the Locust CSVs in out/)
- loadtest/requirements.txt and loadtest/.gitignore

FILES YOU OWN (create/edit ONLY these):
1. EDIT loadtest/locustfile.py:
   - Add 'import json' near the other imports.
   - Immediately ABOVE the CONFIG block, load the optional config file:
       _CFG = {}
       _cfg_path = os.environ.get("LOADTEST_CONFIG_FILE")
       if _cfg_path:
           with open(_cfg_path, encoding="utf-8") as _f:
               _CFG = json.load(_f)   # fail loudly on a bad/missing file — do NOT swallow
   - Give each CONFIG constant a _CFG fallback while KEEPING existing env-var precedence (env var wins, then _CFG, then current literal). Apply to: BASE_URL, ENABLE_WRITES, ALLOW_APPROVE_DESIGN, FALLBACK_TOKEN, FALLBACK_GROOM_USERNAME, THINK_MIN, THINK_MAX, PERSONA_WEIGHTS (merge: {**current_defaults, **_CFG.get("persona_weights", {})}), RAMP_STAGES (= [tuple(s) for s in _CFG.get("ramp_stages", <current list>)]), P95_MS, ERROR_RATE_MAX.
   - Do NOT change SMOKE_STAGES or the LOADTEST_SMOKE branch in StagedRamp (CLI smoke path stays).
   - Keep the existing env var names already supported (LOADTEST_BASE_URL, LOADTEST_NO_WRITES, LOADTEST_NO_APPROVE, LOADTEST_ADMIN_USER/PASS, LOADTEST_GROOM_USER/PASS, LOADTEST_FALLBACK_TOKEN, LOADTEST_FALLBACK_GROOM, LOADTEST_OUT_DIR) working exactly as before.
2. CREATE loadtest/cleanup_core.py: framework-free (only 'requests'; never import locust/gevent/locustfile). Implement the three functions from the SHARED cleanup_core interface. Move the real deletion logic currently inside run.py's cleanup(lf) here:
   - login(base_url, username, password): POST {base_url}/api/auth/login with the SAME payload shape run.py already uses; return parsed JSON (must surface idToken + uid) or None.
   - cleanup_guests_and_wishes(base_url, admin, groom): use groom idToken to GET /api/digital/{groom_uid}/guests and delete each guest whose name starts with "LOADTEST" via DELETE /api/digital/{groom_uid}/guests/{id}; same for /wishes (who or what starts with "LOADTEST"). Return {"guests":n,"wishes":n,"errors":[...]}. Never raise on a single failed delete — collect into errors.
   - purge_server_data(base_url, admin_token, groom_uid): DELETE {base_url}/api/admin/loadtest-data with Authorization: Bearer {admin_token} and JSON {"groomUid": groom_uid}. Return {"ok":bool,"deleted":dict,"error":str|None,"status":int}. A 404 means the endpoint is not deployed on that host -> ok False, error mentions "deploy functions or run backend/scripts/cleanup-loadtest.cjs".
3. EDIT loadtest/run.py:
   - Add a --config <path> CLI arg that sets os.environ["LOADTEST_CONFIG_FILE"] BEFORE the locustfile/config is imported, so the pre-flight confirmation shows the overridden values and the subprocess inherits it.
   - Refactor cleanup(lf) to delegate to cleanup_core (login + cleanup_guests_and_wishes + purge_server_data) and print a structured report. Keep "run.py --cleanup" CLI behavior (now also purges server data).
   - In the production-confirmation prompt, SKIP the prompt when the target host parses to localhost/127.0.0.1/[::1]/0.0.0.0.
   - Keep every other CLI flag and the headless locust invocation working as today.
4. EDIT loadtest/analyze.py:
   - Add CLI flags --json <path>, --p95-ms <float>, --error-rate-max <float>. Default SLOs to the current literals when flags absent.
   - Refactor verdict() to BUILD a dict first then print the same human text; when --json is given, also write that dict to the path in exactly the verdict.json shape from the SHARED interface. This removes the duplicated hardcoded SLOs.
5. EDIT loadtest/requirements.txt: append fastapi>=0.115, uvicorn>=0.30, python-dotenv>=1.0 (with brief comments matching the file's style).
6. EDIT loadtest/.gitignore: add a line for .lastconfig.json (and out/ is already ignored — leave it).

VERIFY before returning: run loadtest/.venv/Scripts/python.exe -m py_compile on locustfile.py, run.py, analyze.py, cleanup_core.py and report the result. (py_compile does NOT execute gevent patching, so it is safe.) Do NOT run locust. Do NOT run git.
`

const BACKEND = `
YOUR STREAM: "backend-cleanup". Add an admin-only Cloud Functions endpoint and an Admin-SDK Node script, both of which delete ONLY load-test data (records whose marker fields start with the literal "LOADTEST"). They must NEVER wipe whole nodes/collections.

FIRST read to learn the exact patterns + field names + data paths:
- backend/functions/src/api/index.ts  (how routers are mounted; find the app.use(...) list and the prefix handling)
- backend/functions/src/api/middleware/auth.ts  (requireAuth / requireAdmin middleware; how req.user / uid is attached)
- backend/functions/src/api/routes/digital/constants.ts  (COLL_ROOT, e.g. "digitalInvitations")
- backend/functions/src/api/routes/confirmations*.ts or whichever route reads RTDB /confirmations  (copy the admin DB access pattern: admin.database(), ref, once('value'), multi-path update with nulls)
- backend/functions/src/api/routes/invites.ts  (around the digital-submit confirmation mirror ~lines 500-540 and the token mint ~line 400-420 — confirm field names: submittedName, submittedCity, source, and inviteTokens guestName/guestType)
- any existing per-uid rate-limit helper used by other routes (reuse it; do not invent a new limiter)
- backend/scripts/seed-emulator.cjs and backend/scripts/backfill-digital-confirmations.cjs (Admin-SDK init pattern; emulator env hosts; prod databaseURL https://dawa-aa793-default-rtdb.firebaseio.com)

FILES YOU OWN:
1. CREATE backend/functions/src/api/routes/admin.ts — an Express Router exporting a default/adminRouter with:
   DELETE /loadtest-data  guarded by requireAuth + requireAdmin (+ the existing per-uid rate-limit helper if one exists). Optional JSON body {groomUid?}. Deletes ONLY LOADTEST-marked records:
   a) RTDB /confirmations/{id} where String(submittedName).startsWith("LOADTEST") OR submittedCity === "LOADTEST" (covers public LandingConfirmer posts AND the digital-submit mirror). Read once, build a multi-path update of {"confirmations/<id>": null, ...}.
   b) RTDB /inviteTokens/{token} where guestName startsWith "LOADTEST".
   c) if groomUid provided: Firestore {COLL_ROOT}/{groomUid}/guests where name in range ["LOADTEST", "LOADTEST\\uf8ff") — delete those docs (removes their RSVP fields too). Use batched writes.
   d) if groomUid provided: Firestore {COLL_ROOT}/{groomUid}/wishes — delete docs where who or what startsWith "LOADTEST".
   Respond 200 { ok:true, deleted:{confirmations,inviteTokens,guests,wishes} }. On a step throwing, respond 500 { error:"purge_failed", failedStep, detail, deleted:<partial counts> }. Use TypeScript matching the codebase style/types.
2. EDIT backend/functions/src/api/index.ts — import the new router and mount it (e.g. app.use("/admin", adminRouter)) in the same place/style as the other app.use(...) mounts, so it resolves as /api/admin/loadtest-data through the existing prefix handling.
3. CREATE backend/scripts/cleanup-loadtest.cjs — Admin-SDK script mirroring seed-emulator.cjs init style. Usage:
   node backend/scripts/cleanup-loadtest.cjs --emulator [--groom-username groom] [--dry-run]
   node backend/scripts/cleanup-loadtest.cjs --groom-uid <uid> --yes        (production; requires GOOGLE_APPLICATION_CREDENTIALS pointing at the repo-root service-account key — document this in a header comment, do NOT hardcode or stage the key)
   --emulator sets FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099, FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000, FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 and initializes with projectId dawa-aa793 + the emulator RTDB url. Production (no --emulator) uses databaseURL https://dawa-aa793-default-rtdb.firebaseio.com and REFUSES to delete without --yes (prints a dry-run table instead). --groom-username resolves the uid via RTDB usernameIndex/{name}. Delete exactly the same four sets as the endpoint; print per-store counts. Support --dry-run (list matches, delete nothing).

VERIFY before returning: run "npm run build --prefix backend/functions" (tsc) and report whether it compiles cleanly; fix any type errors you introduced. Do NOT run the emulator, do NOT run the script against anything, do NOT run git.
`

const UI = `
YOUR STREAM: "react-ui". Build the standalone React (Vite) front-end for the dashboard under loadtest/ui/. It talks to the FastAPI backend via the SHARED route contract. Use inline styles (project convention — no CSS framework). English UI. React 18.

FILES YOU OWN — create the whole loadtest/ui/ tree:
- loadtest/ui/package.json — name "loadtest-dashboard-ui", private. deps: react, react-dom, recharts. devDeps: vite, @vitejs/plugin-react. scripts: "dev": "vite", "build": "vite build", "preview": "vite preview".
- loadtest/ui/vite.config.js — @vitejs/plugin-react; build.outDir "dist"; server.proxy so dev mode forwards "/api" and "/artifacts" to http://127.0.0.1:8765.
- loadtest/ui/index.html — root div + module script to src/main.jsx; English title.
- loadtest/ui/src/main.jsx — mount App.
- loadtest/ui/src/theme.js — small palette/spacing tokens (you may borrow colors from frontend/src/styles/theme.js by READING it, but keep this file self-contained; do not import from frontend/).
- loadtest/ui/src/api.js — fetch helpers for every route in the SHARED contract + a useEventSource(path) React hook for the SSE stream (EventSource, parse "state"/"stats"/"cleanup"/"done" events, auto-reconnect, cleanup on unmount).
- loadtest/ui/src/App.jsx — top-level tabs: Configure | Run | History. A global status badge subscribes to /api/run/stream and shows current run state.
- Components under loadtest/ui/src/components/:
  - ConfigForm.jsx — every run parameter: target host (with a localhost-vs-production indicator), RampStageEditor, PersonaWeights, think min/max, enable_writes + allow_approve_design toggles, SLO inputs (p95_ms, error_rate_max), fallback token + groom. Save via PUT /api/config. CredentialsPanel + PresetBar mounted here.
  - RampStageEditor.jsx — editable rows [users, hold_s, spawn_rate]; add/remove/reorder; show computed total duration; a "Load smoke stage" button that sets a single [5,15,5] row.
  - PersonaWeights.jsx — four numeric inputs; show normalized %; validate at least one weight > 0.
  - CredentialsPanel.jsx — admin/groom user+pass via GET/PUT /api/credentials; password inputs with reveal toggle; a banner "stored in loadtest/.env (gitignored)".
  - PresetBar.jsx — list presets (GET /api/presets), load, "Save as..." (PUT), delete; note presets never store credentials.
  - ProdConfirmModal.jsx — shown when POST /api/run returns 428; user must type the target hostname to enable a Confirm button; Confirm resubmits with confirm_production true; Cancel aborts.
  - RunControls.jsx — Start (POST /api/run; handle 409 already-running and 428 -> show ProdConfirmModal; localhost starts immediately), Stop (POST /api/run/stop, with a note "cleanup will still run"). Show the run-state timeline.
  - LiveCharts.jsx — recharts fed by useEventSource('/api/run/stream') accumulating "stats" snapshots: (1) RPS + user_count dual-axis line chart, (2) p50/p95 lines with a ReferenceLine at the configured p95 SLO, (3) error-rate %.
  - EndpointTable.jsx — live per-endpoint rows (name, method, rps, p95, failures) from the latest stats snapshot.
  - VerdictPanel.jsx — from GET /api/results/latest: SLO pass/fail chips, per-stage table, healthy_max_users / degrade_at, slowest endpoints, 429 stats. Also render the four PNGs via <img src="/artifacts/latest/1_latency_vs_users.png"> etc. (names: 1_latency_vs_users.png, 2_throughput_over_time.png, 3_errors.png, 4_endpoint_latency.png) and a link to /artifacts/latest/report.html. An "Archive this run" button (POST /api/archive).
  - CleanupReportPanel.jsx — render cleanup_report rows [{step, ok, deleted, error, hint}]; green when ok, red with error+hint when not; a "Retry cleanup" button (POST /api/cleanup/retry).
  - HistoryList.jsx — cards from GET /api/history (timestamp, target, max users, SLO pass/fail chip, aborted chip); selecting opens RunDetail; a compare picker to choose exactly two runs.
  - RunDetail.jsx — GET /api/history/{id}: meta + verdict + the archived PNGs (/artifacts/runs/{id}/...) + report link.
  - CompareView.jsx — GET /api/compare?a=&b=: recharts OVERLAYS re-rendered from timeseries (PNGs cannot overlay): p95-vs-time, p95-vs-users, rps-vs-time, error-rate-vs-time (run A solid, run B dashed) + a side-by-side meta/verdict table.

Single-run charts use the PNG <img> (parity with CLI output, no duplicated charting). Comparison re-renders from /timeseries data.

VERIFY before returning: run "npm install" then "npm run build" inside loadtest/ui and report whether dist/ builds cleanly; fix JSX/import errors. Do NOT run git. (dist/ is gitignored via the root 'dist' rule — fine.)
`

const DASH = `
YOUR STREAM: "fastapi-dashboard". Build the FastAPI backend that drives the whole pipeline. It runs in loadtest/.venv on http://127.0.0.1:8765, serves the built React app from loadtest/ui/dist, and exposes the SHARED route contract.

FIRST read (they now EXIST — the python-core stream just wrote/updated them) to lock exact integration details:
- loadtest/cleanup_core.py  (call its login / cleanup_guests_and_wishes / purge_server_data — do not reimplement)
- loadtest/locustfile.py    (confirm which env vars it reads, esp. LOADTEST_CONFIG_FILE, LOADTEST_OUT_DIR, LOADTEST_BASE_URL, the LOADTEST_*_USER/PASS, and that StagedRamp + personas read module-level config)
- loadtest/analyze.py       (confirm the --json/--p95-ms/--error-rate-max flags and the verdict.json shape)
- loadtest/run.py           (reference only; the dashboard spawns locust directly, not run.py)

CRITICAL: NEVER import locustfile.py or locust into this FastAPI process (it monkey-patches gevent and would break uvicorn's asyncio loop). Spawn locust as a SUBPROCESS.

FILES YOU OWN (create under loadtest/dashboard/ plus the listed extras):
- loadtest/dashboard/__init__.py
- loadtest/dashboard/schemas.py — pydantic models: RampStage, RunConfig (matches the CONFIG CONTRACT, with field defaults), Credentials, RunStatus, CleanupStep, RunMeta, Preset.
- loadtest/dashboard/configstore.py — DEFAULT_CONFIG (a deliberate COPY of locustfile's CONFIG defaults, with a "keep in sync with locustfile.py" comment), read/write loadtest/.lastconfig.json, read/write loadtest/.env via python-dotenv (set_key/get_key), presets CRUD over loadtest/presets/*.json (reject any preset key matching user/pass/token credential patterns; slug-safe names).
- loadtest/dashboard/runner.py — singleton RunManager implementing the state machine: idle -> starting -> running -> (stopping) -> analyzing -> cleaning -> done | done_with_warnings | failed.
    * starting: wipe out/ latest artifacts EXCEPT out/runs/; write out/run_config.json from the posted config; spawn locust subprocess (cwd loadtest/) with:
        <venv python> -m locust -f locustfile.py --web-host 127.0.0.1 --web-port <port, default 8089, overridable via LOADTEST_LOCUST_WEB_PORT> --autostart --autoquit 5 --csv out/dawa --csv-full-history --html out/report.html
      env adds LOADTEST_CONFIG_FILE=<abs out/run_config.json>, LOADTEST_OUT_DIR=<abs out>, LOADTEST_BASE_URL=<target>, and the four LOADTEST_*_USER/PASS from loadtest/.env. Use CREATE_NEW_PROCESS_GROUP on Windows. Capture stdout/stderr to out/locust.log.
    * running: a background thread polls GET http://127.0.0.1:<port>/stats/requests every ~2s (tolerate connection-refused for ~20s while locust boots). Read defensively with .get() (locust JSON keys vary by version: total_rps, fail_ratio, state, user_count or .get('user_count'); per-endpoint list under 'stats' with name/method/num_requests/num_failures/current_rps/median_response_time and a 95th-percentile-ish field; current 50/95 percentiles may be under keys like 'current_response_time_percentile_50'/'..._95' — fall back gracefully). Push snapshots {ts,user_count,total_rps,fail_ratio,p50,p95,endpoints:[...]} into a ring buffer the SSE generator drains.
    * stopping (abort): GET http://127.0.0.1:<port>/stop (graceful so locust's test_stop listeners still write status_breakdown.csv/page_ttfb.csv), wait up to ~15s for process exit; fallbacks: send CTRL_BREAK_EVENT to the group, then terminate().
    * analyzing: run <venv python> analyze.py --no-show --json out/verdict.json --p95-ms <cfg> --error-rate-max <cfg> as a subprocess (best-effort after abort).
    * cleaning: ALWAYS (after normal end, abort, or locust crash) — delegate to cleanup.py.
    * Detect locust process exit (autoquit) to advance from running -> analyzing.
- loadtest/dashboard/cleanup.py — orchestration that ALWAYS runs, producing cleanup_report list [{step, ok, deleted, error, hint}]; each step independently try/except, nothing swallowed:
    1. step "guests_wishes": cleanup_core.login(admin)+login(groom) against the run target, then cleanup_core.cleanup_guests_and_wishes(...).
    2. step "server_purge": cleanup_core.purge_server_data(target, admin idToken, groom uid). A 404 -> failed step with hint to deploy functions or run backend/scripts/cleanup-loadtest.cjs.
    3. step "artifacts": record the out/ inventory + whether verdict.json was produced (no deletion; out/ rotates at next run start).
   Any failed step -> overall state done_with_warnings. Expose a retry that re-runs only failed steps using retained run context.
- loadtest/dashboard/history.py — POST archive: copy out/* (except runs/) into out/runs/<YYYYMMDD-HHMMSS>/ and write meta.json {id, started_at, ended_at, aborted, target, config, slo, verdict, cleanup_report} (NO credentials). list/get/delete history by scanning out/runs/*/meta.json. timeseries: parse out/runs/<id>/dawa_stats_history.csv (Aggregated rows) downsampled to <=500 points into [{t,users,rps,fail_rate,p50,p95,p99}] plus per-endpoint aggregates from dawa_stats.csv. compare: return both runs' meta+timeseries. NOTE: you cannot use Date.now in JS but THIS IS PYTHON — use datetime.now() for the timestamp id; that is fine here.
- loadtest/dashboard/api.py — the FastAPI app + all routes in the SHARED contract. SSE via StreamingResponse(media_type="text/event-stream"). is_production(url): hostname not in {localhost,127.0.0.1,[::1],0.0.0.0} -> needs confirmation; POST /api/run returns 428 {"error":"production_confirmation_required"} when production and not confirmed. Mount StaticFiles for loadtest/ui/dist (SPA fallback to index.html) and for out/ as /artifacts/latest and out/runs as /artifacts/runs.
- loadtest/dashboard/main.py — uvicorn.run(api.app, host="127.0.0.1", port=8765); open the browser to the URL on startup (webbrowser, best-effort).
- loadtest/presets/smoke-local.json, smoke-prod.json, full-prod.json — committed presets (NO credentials). smoke-local: base_url http://localhost:5000, ramp_stages [[5,15,5]]. smoke-prod: base_url https://dawa.to, ramp_stages [[5,15,5]]. full-prod: base_url https://dawa.to with the full default ramp.
- loadtest/.env.example — committed template with placeholder LOADTEST_ADMIN_USER/PASS, LOADTEST_GROOM_USER/PASS and a comment that the real loadtest/.env is gitignored.
- loadtest/start-dashboard.ps1 — single entry point: verify loadtest/.venv exists; pip install -r requirements.txt if fastapi missing; if loadtest/ui/dist/index.html missing then npm install + npm run build in loadtest/ui; then run <venv python> -m loadtest.dashboard.main (or python loadtest/dashboard/main.py) and let it open the browser.

VERIFY before returning: install deps into the venv (loadtest/.venv/Scripts/python.exe -m pip install fastapi uvicorn python-dotenv), then run loadtest/.venv/Scripts/python.exe -m py_compile on every dashboard/*.py, and do an import smoke test (python -c "import importlib; importlib.import_module('dashboard.api')" from loadtest/, or py_compile only if import has side effects). Report results. Do NOT actually start uvicorn long-running, do NOT spawn locust, do NOT run git.
`

phase('Foundation')
const [pyCore, backend, ui] = await parallel([
  () => agent(SHARED + PY_CORE, { label: 'python-core', phase: 'Foundation', schema: SCHEMA }),
  () => agent(SHARED + BACKEND, { label: 'backend-cleanup', phase: 'Foundation', schema: SCHEMA }),
  () => agent(SHARED + UI, { label: 'react-ui', phase: 'Foundation', schema: SCHEMA }),
])

phase('Dashboard backend')
const dash = await agent(SHARED + DASH, { label: 'fastapi-dashboard', phase: 'Dashboard backend', schema: SCHEMA })

return { pyCore, backend, ui, dash }
