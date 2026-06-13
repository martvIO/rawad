# Dawa load-testing suite

A Python load test that measures how **https://dawa.to** holds up under heavy,
realistic traffic — ramping concurrent users 10 → 100 → 500 → 1000, tracking
per-endpoint latency / error rate / throughput, and ending with on-screen charts
and a plain-language verdict.

> ⚠️ **This targets PRODUCTION** (Firebase project `dawa-aa793`). A run bills real
> Cloud Function invocations + RTDB/Firestore reads, and (with writes on) creates
> real `LOADTEST`-tagged records. `run.py` asks for confirmation before starting.
> It does **not** test localhost.

## Why Locust (not asyncio + aiohttp)

Locust gives us, out of the box, exactly what the brief needs and aiohttp would
make us hand-build:

| Requirement | Locust feature |
|---|---|
| 1000 concurrent users on one box | gevent greenlets |
| per-endpoint latency p50/p90/p95/p99, RPS, failures | built-in stats engine |
| human think time (1–5 s) | `wait_time = between(1, 5)` |
| weighted personas (non-uniform mix) | `HttpUser.weight` + `@task(n)` |
| gradual ramp 10→1000 | `LoadTestShape` |
| live terminal report | headless stats table + summary |
| metrics-over-time for charts | `--csv-full-history` |

`analyze.py` then turns the CSV history into the required matplotlib charts and verdict.

## Password encryption

The bootstrap login (and the cleanup login) RSA-encrypt the password before sending,
matching the browser client: `passwordcrypto.py` fetches the server's public key from
`GET /api/auth/pubkey` and wraps the password as an `enc:v1:<base64>` envelope (the
backend decrypts it transparently). If the target serves no key, it transparently
falls back to plaintext, so the suite works against any deploy. This adds the
`cryptography` dependency (in `requirements.txt`). Round-trip tested by
`python test_passwordcrypto.py`.

## Install

```powershell
cd loadtest
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
```

## Run

Works the same in PowerShell or Command Prompt (cmd.exe). Do a smoke test first,
then the full ramp. **Paste the bare command — do not include a trailing `# comment`:**
in cmd.exe `#` is an argument, not a comment, so argparse will reject it.

```
.venv\Scripts\python run.py --smoke
.venv\Scripts\python run.py
```

Flags:

- `--smoke` — tiny 5-user / 15s shake-out (run this first)
- `--no-writes` — reads only (no POSTs to the public submit endpoints)
- `--yes` — skip the production confirmation prompt
- `--no-show` — save the charts without opening windows
- `--host URL` — override the target base URL
- `--cleanup` — delete the LOADTEST guest + its pending wishes, then exit

`run.py` runs Locust headless (the live stats table streams to your terminal),
then runs `analyze.py`, which saves four PNGs to `out/` **and** opens them on screen,
then prints the verdict.

Re-chart an existing run without re-testing:

```
.venv\Scripts\python analyze.py
.venv\Scripts\python analyze.py --no-show
```

## Configuration

Everything you'd tweak lives in the **CONFIG block at the top of `locustfile.py`**:
target URL, credentials (used only to mint a real test token), the endpoint list,
the persona mix, the ramp schedule (`RAMP_STAGES`), think time, and the health
thresholds (`P95_MS`, `ERROR_RATE_MAX`). Change them there — no logic to edit.

## What it does

- **Bootstrap (once):** logs in as `admin` + `groom`, ensures a `LOADTEST` digital
  guest with an approved design exists, and **mints a real digital invite token**
  via the API so reads hit the real-payload path. If any step fails it degrades to
  a fallback token (reads then exercise the 404 path) and keeps running.
- **Personas:** `GuestBrowser` (opens & reads an invite — the dominant traffic),
  `InvitePoller` (the 3 s token poller behind every open invite tab),
  `RsvpBuyer` (submits RSVP + guestbook wish), `LandingConfirmer` (homepage +
  health probe + public confirm form).
- **Endpoints measured:** `GET /api/health`, `GET /api/invites/token/:token`,
  `GET /api/digital/:uid/public`, `GET /api/invites/digital/wishes/:token`,
  page loads of `/` and `/d/:groom/:token`, and (writes) `POST /api/invites/digital/submit`,
  `POST /api/invites/digital/wish`, `POST /api/confirmations`.

## Reading the results (`out/`)

- `1_latency_vs_users.png` — p50/p90/p95/p99 vs concurrent users (the breaking point)
- `2_throughput_over_time.png` — requests/s over time, with the user-count overlay
- `3_errors.png` — genuine error rate over time **+** error-type breakdown (4xx / 429 / 5xx / timeout)
- `4_endpoint_latency.png` — per-endpoint median vs p95
- `report.html` — Locust's own HTML report
- `dawa_stats.csv`, `dawa_stats_history.csv`, `status_breakdown.csv`, `page_ttfb.csv` — raw data

## Important: rate limits make writes mostly 429 — on purpose

The public write endpoints are per-IP rate limited (confirmations 5/hr, invite/digital
submit 5–10/hr, login 50/hr). From one test machine you are one IP, so writes 429
almost immediately. The suite treats `429` as an **expected** outcome (not a failure)
and charts it separately, so the health verdict reflects genuine errors only. This is
correct production behaviour — a flood of submissions *should* be throttled — and means
you cannot drive thousands of *successful* writes from a single origin. The **read**
endpoints (token lookup, public design, wishes, page loads) are what carry the load
curve and reveal the real breaking point.

## Cleanup

```powershell
.venv\Scripts\python run.py --cleanup
```

Deletes the `LOADTEST` digital guest and its pending guestbook wishes. Successful
`LOADTEST` RSVPs/confirmations are mirrored into `/confirmations`; remove those from
the **admin → Confirmations** tab if you don't want them.

> `--cleanup` runs from the same `.venv` and reuses `locustfile.py`'s login/API helpers,
> so it needs the full requirements installed (including `locust`) — it isn't a
> `requests`-only standalone script.

This suite is standalone — it touches no app code and is **not** wired into the
SessionEnd deploy hook.
