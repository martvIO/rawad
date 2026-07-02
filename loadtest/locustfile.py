"""
Realistic load test for دعوة (Dawa) — https://dawa.to

Run via the orchestrator (recommended), which adds the production-safety prompt,
the CSV flags and the post-run charts:

    python run.py            # full 10 -> 1000 ramp
    python run.py --smoke    # tiny 5-user/15s shake-out
    python run.py --yes      # skip the confirmation prompt

Or drive Locust directly (no charts) — run this AND analyze.py from the loadtest/
directory, since the --csv prefix and analyze.py's defaults are relative to the cwd:

    cd loadtest
    python -m locust -f locustfile.py --headless --csv out/dawa --csv-full-history
    python analyze.py

WHY LOCUST (and not asyncio + aiohttp): Locust gives us, out of the box, the
exact things the brief asks for — greenlet concurrency that scales to 1000 users
on one machine, per-endpoint latency percentiles / RPS / failure stats, human
"think time" (`between`), weighted personas (`weight` + `@task(n)`), a declarative
staged ramp (`LoadTestShape`), a live terminal stats table, and `--csv-full-history`
time-series output we post-process into the charts. aiohttp would mean hand-building
all of that. See README.md.

EVERYTHING you would normally tweak lives in the CONFIG block immediately below —
URLs, credentials, the endpoint list, the ramp schedule, think time, persona mix
and the health thresholds — so the file can be re-pointed without touching logic.
"""

from __future__ import annotations

# Apply gevent's monkey-patching BEFORE importing requests/ssl. Locust does this
# itself when it loads the file via `locust -f ...`, but importing this module any
# OTHER way (run.py reads the CONFIG block for its prompt; `run.py --cleanup` reuses
# the login/api helpers) would import `requests` — and ssl — first, and gevent's late
# patch then crashes with RecursionError on modern Python. Patching here first makes
# every entry path safe; locust's own later patch_all() is an idempotent no-op.
from gevent import monkey
monkey.patch_all()

import sys
# Windows consoles default to cp1252 and raise UnicodeEncodeError on non-ASCII
# (Arabic guest names, log glyphs). Force UTF-8 with replacement so logging/printing
# never crashes the run.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass

import csv
import json
import logging
import os
import random
import threading
import time
from collections import defaultdict
from typing import Optional

import requests
from locust import HttpUser, LoadTestShape, between, events, task

# RSA password-encryption for the bootstrap login (matches the browser client).
# Imports only requests + cryptography, so it is gevent-safe after the patch above.
from passwordcrypto import encrypt_credentials

# --- Optional run config file (the dashboard's single source of run params) --
# When LOADTEST_CONFIG_FILE points at a run_config.json, its values become the
# fallback for every CONFIG constant below. Precedence stays: explicit env var
# wins, then this _CFG, then the hardcoded literal default. Credentials are NEVER
# read from here — they only come from env vars. A bad/missing path fails loudly.
_CFG = {}
_cfg_path = os.environ.get("LOADTEST_CONFIG_FILE")
if _cfg_path:
    with open(_cfg_path, encoding="utf-8") as _f:
        _CFG = json.load(_f)

# ════════════════════════════════════════════════════════════════════════════
#  CONFIG  —  edit anything in this block; the logic below reads from here.
# ════════════════════════════════════════════════════════════════════════════

# --- Target -----------------------------------------------------------------
# The REST API is SAME-ORIGIN under /api (Firebase Hosting rewrites /api/** to
# the `api` Cloud Function). Page routes (/, /d/...) are served by Hosting/the
# preview function. Default to LOCALHOST so a run that forgets to set
# LOADTEST_BASE_URL can never accidentally hammer production — point it at prod
# explicitly via LOADTEST_BASE_URL=https://dawa.to (or set base_url in config).
BASE_URL = os.environ.get("LOADTEST_BASE_URL") or _CFG.get("base_url", "http://localhost:5000")
API_BASE = "/api"

# --- Credentials (used ONLY by the one-time bootstrap to mint a real token) --
# Minting an invite token is an ADMIN operation server-side, so the admin login
# is required. The groom login is used to discover groomUid and manage the test
# guest. Set these in the gitignored loadtest/.env (see .env.example) — NEVER
# hardcode a real password here. Passwords have NO default: a missing one yields
# an empty string, so the bootstrap login fails loudly instead of silently
# authenticating with a real production credential baked into source control.
CREDENTIALS = {
    "admin": {"username": os.environ.get("LOADTEST_ADMIN_USER", "admin"),
              "password": os.environ.get("LOADTEST_ADMIN_PASS", "")},
    "groom": {"username": os.environ.get("LOADTEST_GROOM_USER", "groom"),
              "password": os.environ.get("LOADTEST_GROOM_PASS", "")},
}

# --- Write policy ------------------------------------------------------------
# When True, the RsvpBuyer/Confirmer personas POST to the public submit endpoints.
# These are per-IP rate limited (5-10/hr), so from one machine they 429 quickly —
# that is EXPECTED and is itself a useful measurement of the limiter. Successful
# writes create real records tagged "LOADTEST" (clean up with: python run.py --cleanup).
ENABLE_WRITES = (os.environ.get("LOADTEST_NO_WRITES") != "1") if "LOADTEST_NO_WRITES" in os.environ \
    else bool(_CFG.get("enable_writes", True))

# When True, the bootstrap may force the groom's default design to "approved"
# (admin override) so the minted digital token carries a full design snapshot and
# /digital/:uid/public returns a real payload. When False, an unapproved design
# just makes those reads return null (HTTP 200) — still a valid round trip.
ALLOW_APPROVE_DESIGN = (os.environ.get("LOADTEST_NO_APPROVE") != "1") if "LOADTEST_NO_APPROVE" in os.environ \
    else bool(_CFG.get("allow_approve_design", True))

# A syntactically-valid (32 hex) token used if the bootstrap can't mint one.
# It will not exist in the DB, so reads exercise the 404 path instead of the
# real-payload path. Replace with a known good test token if you have one.
FALLBACK_TOKEN = os.environ.get("LOADTEST_FALLBACK_TOKEN") \
    or _CFG.get("fallback_token", "00000000000000000000000000000000")
FALLBACK_GROOM_USERNAME = os.environ.get("LOADTEST_FALLBACK_GROOM") \
    or _CFG.get("fallback_groom_username", "groom")

# --- Human think time (seconds) between a user's actions ---------------------
THINK_MIN = float(_CFG.get("think_min", 1.0))
THINK_MAX = float(_CFG.get("think_max", 5.0))

# --- Persona mix (relative weights; need not sum to 100) ---------------------
# GuestBrowser  : opens a digital invite and reads it (the dominant real traffic)
# InvitePoller  : the 3s token poller behind every open invite tab (highest-freq hit)
# RsvpBuyer     : submits an RSVP + a guestbook wish (writes; mostly 409/429)
# LandingConfirmer: hits the landing page, health probe and public confirm form
PERSONA_WEIGHTS = {
    **{
        "GuestBrowser": 60,
        "InvitePoller": 20,
        "RsvpBuyer": 15,
        "LandingConfirmer": 5,
    },
    **_CFG.get("persona_weights", {}),
}

# --- Ramp schedule: list of (target_users, hold_seconds, spawn_rate_per_sec) --
# Each stage ramps to target_users at spawn_rate, then holds for hold_seconds so
# the percentiles stabilise before the next step. This is where the breaking
# point shows up. Total run time = sum of hold_seconds (+ ramp time).
RAMP_STAGES = [tuple(s) for s in _CFG.get("ramp_stages", [
    (10,   60, 10),
    (50,   60, 25),
    (100,  60, 50),
    (250,  60, 50),
    (500,  90, 75),
    (1000, 120, 100),
])]
# Tiny shake-out used by `run.py --smoke` (selected via the LOADTEST_SMOKE env var).
SMOKE_STAGES = [(5, 15, 5)]

# --- Health thresholds (drive the plain-language verdict) --------------------
P95_MS = float(_CFG.get("p95_ms", 1000.0))          # a stage is "healthy" only if aggregate p95 latency is under this
ERROR_RATE_MAX = float(_CFG.get("error_rate_max", 0.01))    # ...and the GENUINE error rate (excludes intentional 429s) is under this

# --- Output ------------------------------------------------------------------
OUT_DIR = os.environ.get("LOADTEST_OUT_DIR", "out")

# ════════════════════════════════════════════════════════════════════════════
#  END CONFIG
# ════════════════════════════════════════════════════════════════════════════

log = logging.getLogger("dawa-loadtest")

def api(path: str) -> str:
    """Absolute API URL for a path like '/auth/login'."""
    return f"{BASE_URL}{API_BASE}{path}"


# ─── Shared runtime state, populated once by the bootstrap ──────────────────
class _State:
    digital_token: str = FALLBACK_TOKEN     # a real digital token if minting succeeded
    groom_uid: str = ""                     # the groom's Firebase uid (= /digital/:uid/...)
    groom_username: str = FALLBACK_GROOM_USERNAME
    admin_token: str = ""
    bootstrap_ok: bool = False
    minted: bool = False                    # True only if we minted a real token this run

STATE = _State()


# ─── Status-code tally + page TTFB (the authoritative error-type breakdown) ──
# Locust's own pass/fail accounting is configured (below) to treat 429/expected
# 404/409 as "success" so they don't pollute the health verdict. To STILL see the
# full picture (4xx vs 429 vs 5xx vs timeouts, and page time-to-first-byte) we
# tally every response here, keyed by the request name, and dump it at the end.
_tally_lock = threading.Lock()
_status_tally: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
_ttfb_samples: dict[str, list[float]] = defaultdict(list)


def classify(status: Optional[int], exception) -> str:
    """Bucket a response into a coarse class for the breakdown chart."""
    if exception is not None:
        msg = str(exception).lower()
        return "timeout" if "timeout" in msg or "timed out" in msg else "error"
    if status is None:
        return "error"
    if status == 429:
        return "429"            # intentional rate-limit — tracked separately from real 4xx
    if 200 <= status < 300:
        return "2xx"
    if 300 <= status < 400:
        return "3xx"
    if 400 <= status < 500:
        return "4xx"
    return "5xx"


@events.request.add_listener
def _on_request(request_type, name, response_time, response_length, response,
                context, exception, start_time, url, **kwargs):
    """Fires for every Locust request — record status class and page TTFB."""
    status = getattr(response, "status_code", None)
    cls = classify(status, exception)
    with _tally_lock:
        _status_tally[name][cls] += 1
        # response.elapsed (from requests) ~= time to first byte / headers received.
        if name.startswith("PAGE ") and response is not None:
            elapsed = getattr(response, "elapsed", None)
            if elapsed is not None:
                _ttfb_samples[name].append(elapsed.total_seconds() * 1000.0)


# ─── Bootstrap: log in and mint a real digital invite token (once) ──────────
def _post_json(path: str, payload: dict, token: Optional[str] = None, timeout: int = 30):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.post(api(path), json=payload, headers=headers, timeout=timeout)


def _get_json(path: str, token: Optional[str] = None, timeout: int = 30):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.get(api(path), headers=headers, timeout=timeout)


def _login(role: str) -> Optional[dict]:
    creds = CREDENTIALS.get(role)
    if not creds:
        return None
    try:
        # Encrypt the password (RSA-OAEP) before sending, exactly like the
        # browser. Degrades to plaintext if the server publishes no key.
        r = _post_json("/auth/login", encrypt_credentials(BASE_URL, creds))
        if r.status_code == 200:
            return r.json()
        log.warning("bootstrap: login(%s) -> HTTP %s %s", role, r.status_code, r.text[:200])
    except Exception as e:  # noqa: BLE001
        log.warning("bootstrap: login(%s) failed: %s", role, e)
    return None


def _il_phone() -> str:
    """A valid-format Israeli mobile in E.164, unique-ish per run (avoids dup guard)."""
    suffix = f"{int(time.time() * 1000) % 100_000_000:08d}"
    return f"+9725{suffix}"


def _bootstrap() -> None:
    """Best-effort: obtain a real digital token so reads hit the real payload path.
    Every failure degrades gracefully to the FALLBACK_TOKEN (404 read path)."""
    admin = _login("admin")
    groom = _login("groom")
    if not admin or not groom:
        log.warning("bootstrap: missing admin/groom login - using FALLBACK token (404 read path)")
        return
    STATE.admin_token = admin.get("idToken", "")
    STATE.groom_uid = groom.get("uid", "")
    STATE.groom_username = groom.get("username") or FALLBACK_GROOM_USERNAME
    groom_token = groom.get("idToken", "")
    uid = STATE.groom_uid
    if not uid or not STATE.admin_token or not groom_token:
        log.warning("bootstrap: incomplete tokens/uid - using FALLBACK token")
        return

    try:
        # 1. Reuse an existing LOADTEST digital guest, else create one (groom owns it).
        guest_id = None
        gr = _get_json(f"/digital/{uid}/guests", groom_token)
        if gr.status_code == 200 and isinstance(gr.json(), list):
            for g in gr.json():
                if str(g.get("name", "")).startswith("LOADTEST"):
                    guest_id = g.get("id")
                    break
        if not guest_id:
            cr = _post_json(f"/digital/{uid}/guests",
                            {"name": "LOADTEST Guest", "phone": _il_phone()}, groom_token)
            if cr.status_code == 200:
                guest_id = cr.json().get("id")
            else:
                log.warning("bootstrap: create guest -> HTTP %s %s", cr.status_code, cr.text[:200])
        if not guest_id:
            log.warning("bootstrap: no digital guest available - using FALLBACK token")
            return

        # 2. Resolve the default design and ensure it is approved (admin override).
        design_id = None
        dr = _get_json(f"/digital/{uid}/designs", groom_token)
        if dr.status_code == 200 and isinstance(dr.json(), list) and dr.json():
            rows = dr.json()
            approved = next((d for d in rows if d.get("designStatus") == "approved"), None)
            default = next((d for d in rows if d.get("isDefault")), rows[0])
            chosen = approved or default
            design_id = chosen.get("id")
            if chosen.get("designStatus") != "approved" and ALLOW_APPROVE_DESIGN and design_id:
                ar = _post_json(f"/digital/{uid}/designs/{design_id}/design/set-status",
                                {"status": "approved"}, STATE.admin_token)
                if ar.status_code != 200:
                    log.warning("bootstrap: approve design -> HTTP %s %s", ar.status_code, ar.text[:200])

        # 3. Mint the digital invite token (admin only).
        mr = _post_json("/invites/digital", {"groomUid": uid, "guestId": guest_id}, STATE.admin_token)
        if mr.status_code == 200 and mr.json().get("token"):
            STATE.digital_token = mr.json()["token"]
            STATE.minted = True
            STATE.bootstrap_ok = True
            log.info("bootstrap: minted digital token %s... for groom '%s' (uid %s)",
                     STATE.digital_token[:8], STATE.groom_username, uid)
        else:
            log.warning("bootstrap: mint -> HTTP %s %s - using FALLBACK token",
                        mr.status_code, mr.text[:200])
    except Exception as e:  # noqa: BLE001
        log.warning("bootstrap: unexpected error %s - using FALLBACK token", e)


@events.test_start.add_listener
def _on_test_start(environment, **kwargs):
    os.makedirs(OUT_DIR, exist_ok=True)
    log.info("Bootstrapping against %s ...", BASE_URL)
    _bootstrap()
    if not STATE.bootstrap_ok:
        log.warning("Running with FALLBACK token - token/public/wishes reads will hit the 404/empty path.")


@events.test_stop.add_listener
def _on_test_stop(environment, **kwargs):
    """Dump the status-class breakdown and page TTFB so analyze.py can chart them."""
    os.makedirs(OUT_DIR, exist_ok=True)
    classes = ["2xx", "3xx", "4xx", "429", "5xx", "timeout", "error"]
    with open(os.path.join(OUT_DIR, "status_breakdown.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Name", *classes, "Total"])
        with _tally_lock:
            for name in sorted(_status_tally):
                row = _status_tally[name]
                counts = [row.get(c, 0) for c in classes]
                w.writerow([name, *counts, sum(counts)])
    with open(os.path.join(OUT_DIR, "page_ttfb.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Name", "Samples", "Avg_ms", "P50_ms", "P95_ms"])
        with _tally_lock:
            for name in sorted(_ttfb_samples):
                xs = sorted(_ttfb_samples[name])
                if not xs:
                    continue
                avg = sum(xs) / len(xs)
                p50 = xs[int(0.50 * (len(xs) - 1))]
                p95 = xs[int(0.95 * (len(xs) - 1))]
                w.writerow([name, len(xs), round(avg, 1), round(p50, 1), round(p95, 1)])
    log.info("Wrote status_breakdown.csv and page_ttfb.csv to %s/", OUT_DIR)


# ─── Request helpers used by the personas ───────────────────────────────────
def _validate(resp, ok_statuses: set[int], shape_key: Optional[str] = None,
              allow_null: bool = False) -> None:
    """Mark the (catch_response) result success/failure.

    ok_statuses are EXPECTED outcomes (incl. intentional 429/404/409) and count as
    success so they don't inflate the health error rate. Anything else — and any
    JSON-shape mismatch on a 200 — is a genuine failure we want surfaced.
    """
    sc = resp.status_code
    if sc not in ok_statuses:
        resp.failure(f"unexpected HTTP {sc}: {resp.text[:120]}")
        return
    if sc == 200 and shape_key is not None:
        try:
            body = resp.json()
        except ValueError:
            resp.failure("200 but body is not JSON")
            return
        if body is None:
            if not allow_null:
                resp.failure("200 but body is null")
            else:
                resp.success()
            return
        if isinstance(body, dict) and shape_key not in body:
            resp.failure(f"200 but missing '{shape_key}' key")
            return
    resp.success()


def _get(client, path: str, name: str, ok: set[int], shape_key=None, allow_null=False):
    with client.get(api(path), name=name, catch_response=True) as r:
        _validate(r, ok, shape_key, allow_null)
        return r


def _post(client, path: str, name: str, payload: dict, ok: set[int]):
    with client.post(api(path), json=payload, name=name, catch_response=True) as r:
        _validate(r, ok)
        return r


def _page(client, path: str, name: str):
    """A full HTML page GET (TTFB recorded by the request listener)."""
    with client.get(path, name=name, catch_response=True) as r:
        _validate(r, {200})
        return r


# ─── Personas ───────────────────────────────────────────────────────────────
class _BaseUser(HttpUser):
    """Common base — abstract so Locust doesn't instantiate it directly."""
    abstract = True
    host = BASE_URL
    wait_time = between(THINK_MIN, THINK_MAX)


class GuestBrowser(_BaseUser):
    """A guest opens their digital invitation and reads through it.
    This is the dominant, realistic traffic: all reads, no writes."""
    weight = PERSONA_WEIGHTS["GuestBrowser"]

    @task
    def open_and_read(self):
        tok = STATE.digital_token
        # 1. The invitation microsite (separate preview function — heavier page load).
        self._page_invite(tok)
        self.wait()
        # 2. The page's own load calls.
        _get(self.client, f"/invites/token/{tok}", "GET token", {200, 404},
             shape_key="groomUsername")
        if STATE.groom_uid:
            _get(self.client, f"/digital/{STATE.groom_uid}/public", "GET digital/public",
                 {200}, allow_null=True)
        _get(self.client, f"/invites/digital/wishes/{tok}", "GET wishes", {200, 400},
             shape_key="wishes")

    def _page_invite(self, tok: str):
        _page(self.client, f"/d/{STATE.groom_username}/{tok}", "PAGE /d/:groom/:token")


class InvitePoller(_BaseUser):
    """Mirrors the production InviteForm poller: GET the token every ~3s while a
    guest has the tab open. The single highest-frequency backend hit in prod."""
    weight = PERSONA_WEIGHTS["InvitePoller"]
    wait_time = between(2.5, 3.5)   # ~3s poll, like src/config POLL_MS for invites

    @task
    def poll(self):
        _get(self.client, f"/invites/token/{STATE.digital_token}", "GET token",
             {200, 404}, shape_key="groomUsername")


class RsvpBuyer(_BaseUser):
    """A guest who actually RSVPs and leaves a guestbook wish. Writes are per-IP
    rate limited, so most of these return 409 (already submitted) / 429 — exactly
    the limiter behaviour we want to measure. Disabled when ENABLE_WRITES is False."""
    weight = PERSONA_WEIGHTS["RsvpBuyer"] if ENABLE_WRITES else 0

    @task(2)
    def rsvp(self):
        # Read the invite first (a real guest always loads before submitting).
        _get(self.client, f"/invites/token/{STATE.digital_token}", "GET token",
             {200, 404}, shape_key="groomUsername")
        self.wait()
        payload = {
            "token": STATE.digital_token,
            "rsvp": random.choice(["attending", "attending", "absent"]),
            "submittedPhone": _il_phone(),
            "companions": random.randint(0, 3),
            "mealPreference": "LOADTEST",
            "songRequest": "LOADTEST",
        }
        # 200 (first time), 409 (already used / wrong type), 410 (expired),
        # 404 (fallback token), 429 (rate limited) are all EXPECTED.
        _post(self.client, "/invites/digital/submit", "POST digital/submit", payload,
              {200, 404, 409, 410, 429})

    @task(1)
    def wish(self):
        payload = {"token": STATE.digital_token, "who": "LOADTEST", "what": "LOADTEST wish"}
        _post(self.client, "/invites/digital/wish", "POST digital/wish", payload,
              {200, 404, 410, 429})


class LandingConfirmer(_BaseUser):
    """A visitor who lands on the homepage, the app warms the health probe, and
    occasionally submits the public confirmation form (also rate limited)."""
    weight = PERSONA_WEIGHTS["LandingConfirmer"]

    @task(3)
    def landing(self):
        _page(self.client, "/", "PAGE / (landing)")
        _get(self.client, "/health", "GET /api/health", {200}, shape_key="ok")

    @task(1)
    def confirm(self):
        if not ENABLE_WRITES:
            return
        payload = {
            "groomUsername": STATE.groom_username,
            # Two words: /confirmations rejects a single-word name with 400 name_must_be_full.
            "submittedName": "LOADTEST Guest",
            "submittedPhone": _il_phone(),
            "submittedCity": "LOADTEST",
            "submittedStreet": "LOADTEST",
            "submittedHouse": "1",
            "companions": random.randint(0, 2),
        }
        # 404 (unknown_groom) is expected if the groom username can't be resolved
        # (e.g. a degraded bootstrap fell back to the default username).
        _post(self.client, "/confirmations", "POST confirmations", payload, {200, 404, 429})


# ─── Staged ramp (10 -> 1000) ───────────────────────────────────────────────
class StagedRamp(LoadTestShape):
    """Walks RAMP_STAGES (or SMOKE_STAGES) by elapsed time, holding each level so
    percentiles stabilise. Returning None ends the test."""
    stages = SMOKE_STAGES if os.environ.get("LOADTEST_SMOKE") == "1" else RAMP_STAGES

    def __init__(self):
        super().__init__()
        self._announced = -1
        # Precompute cumulative end-time for each stage.
        self._bounds = []
        t = 0
        for users, hold, rate in self.stages:
            t += hold
            self._bounds.append((t, users, rate))

    def tick(self):
        run_time = self.get_run_time()
        for idx, (end_t, users, rate) in enumerate(self._bounds):
            if run_time < end_t:
                if idx != self._announced:
                    self._announced = idx
                    logging.getLogger("dawa-loadtest").info(
                        "-- stage %d/%d: target %d users (spawn %d/s, hold %ds) --",
                        idx + 1, len(self._bounds), users, rate, self.stages[idx][1])
                return (users, rate)
        return None
