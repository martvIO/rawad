"""
Orchestrator for the Dawa load test.

    python run.py                 # full 10 -> 1000 ramp against https://dawa.to
    python run.py --smoke         # tiny 5-user / 15s shake-out
    python run.py --yes           # skip the production-safety confirmation
    python run.py --no-writes     # reads only (no POSTs to the public submit endpoints)
    python run.py --no-show       # generate charts but don't pop windows
    python run.py --config c.json # load run params from a run_config.json
    python run.py --cleanup       # delete the LOADTEST guest + its pending wishes, then exit

Steps:
    1. Print a clear PRODUCTION warning and require explicit consent.
    2. Run Locust headless with the staged ramp + CSV history (live table streams here).
    3. Hand the CSVs to analyze.py for the charts + plain-language verdict.

The actual target / endpoints / ramp / thresholds all live at the top of locustfile.py.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from urllib.parse import urlparse

# Windows consoles default to cp1252 and crash on non-ASCII output. Force UTF-8.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "out")
CSV_PREFIX = os.path.join(OUT_DIR, "dawa")


_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"}


def _is_local(base_url: str) -> bool:
    """True if base_url targets the loopback / local machine (no prod prompt needed)."""
    try:
        host = (urlparse(base_url).hostname or "").lower()
    except Exception:  # noqa: BLE001
        host = ""
    return host in _LOCAL_HOSTS


def _import_config():
    """Pull the target + ramp out of locustfile so we can show them in the prompt."""
    sys.path.insert(0, HERE)
    import locustfile as lf  # noqa: E402
    return lf


def confirm(lf, smoke: bool, writes: bool, assume_yes: bool) -> bool:
    stages = lf.SMOKE_STAGES if smoke else lf.RAMP_STAGES
    max_users = max(u for u, _, _ in stages)
    total_s = sum(h for _, h, _ in stages)
    local = _is_local(lf.BASE_URL)
    target_note = "(LOCAL target)" if local else "(PRODUCTION - project dawa-aa793)"
    print("=" * 72)
    print("  Dawa LOAD TEST - pre-flight")
    print("=" * 72)
    print(f"  Target          : {lf.BASE_URL}  {target_note}")
    print(f"  Ramp            : {' -> '.join(str(u) for u, _, _ in stages)} users")
    print(f"  Max concurrency : {max_users}")
    print(f"  Hold time total : ~{total_s}s (+ ramp)")
    print(f"  Writes          : {'ON - creates LOADTEST records (mostly 429 by design)' if writes else 'OFF (reads only)'}")
    print("  Cost note       : real Cloud Function invocations + RTDB/Firestore reads will be billed.")
    print("=" * 72)
    if local:
        print("  Local target; skipping the production confirmation prompt.\n")
        return True
    if assume_yes:
        print("  --yes supplied; proceeding.\n")
        return True
    try:
        ans = input("  Type 'yes' to run against PRODUCTION: ").strip().lower()
    except EOFError:
        ans = ""
    print()
    return ans == "yes"


def run_locust(smoke: bool, writes: bool, host: str | None) -> int:
    env = dict(os.environ)
    if smoke:
        env["LOADTEST_SMOKE"] = "1"
    if not writes:
        env["LOADTEST_NO_WRITES"] = "1"
    env["LOADTEST_OUT_DIR"] = OUT_DIR
    if host:
        env["LOADTEST_BASE_URL"] = host
    os.makedirs(OUT_DIR, exist_ok=True)
    cmd = [
        sys.executable, "-m", "locust",
        "-f", os.path.join(HERE, "locustfile.py"),
        "--headless",
        "--csv", CSV_PREFIX,
        "--csv-full-history",
        "--html", os.path.join(OUT_DIR, "report.html"),
        "--print-stats",  # stream the live per-interval stats table to the terminal
    ]
    print("Starting Locust:\n  " + " ".join(cmd) + "\n")
    return subprocess.call(cmd, cwd=HERE, env=env)


def run_analyze(no_show: bool) -> int:
    cmd = [sys.executable, os.path.join(HERE, "analyze.py"),
           "--prefix", CSV_PREFIX, "--out-dir", OUT_DIR]
    if no_show:
        cmd.append("--no-show")
    return subprocess.call(cmd, cwd=HERE)


def cleanup(lf) -> int:
    """Best-effort removal of LOADTEST data created by the test.

    Delegates to cleanup_core: per-guest/per-wish deletes (groom token) PLUS the
    admin bulk-purge endpoint (confirmations + inviteTokens + guests + wishes).
    """
    import cleanup_core

    base_url = lf.BASE_URL
    print(f"Cleanup: logging in and removing LOADTEST data on {base_url} ...")
    admin = cleanup_core.login(base_url, *_creds(lf, "admin"))
    groom = cleanup_core.login(base_url, *_creds(lf, "groom"))
    if not admin or not groom:
        print("  ! could not log in - nothing cleaned.")
        return 1

    # 1. Per-guest / per-wish deletes (idempotent; tagged "LOADTEST").
    gw = cleanup_core.cleanup_guests_and_wishes(base_url, admin, groom)
    print(f"  guests removed : {gw['guests']}")
    print(f"  wishes removed : {gw['wishes']}")
    for err in gw["errors"]:
        print(f"  ! {err}")

    # 2. Admin bulk purge (also clears mirrored confirmations + invite tokens).
    purge = cleanup_core.purge_server_data(base_url, admin.get("idToken", ""), groom.get("uid", ""))
    if purge["ok"]:
        d = purge["deleted"]
        print("  server purge   : ok"
              f" (confirmations={d.get('confirmations', 0)},"
              f" inviteTokens={d.get('inviteTokens', 0)},"
              f" guests={d.get('guests', 0)}, wishes={d.get('wishes', 0)})")
    else:
        print(f"  server purge   : skipped/failed - {purge['error']}")

    ok = not gw["errors"] and purge["ok"]
    print("  cleanup complete." if ok else "  cleanup finished with warnings (see above).")
    return 0


def _creds(lf, role: str) -> tuple[str, str]:
    """Pull (username, password) for a role from locustfile's CREDENTIALS block."""
    c = lf.CREDENTIALS.get(role, {})
    return c.get("username", ""), c.get("password", "")


def main():
    ap = argparse.ArgumentParser(description="Run the Dawa load test and report.")
    ap.add_argument("--smoke", action="store_true", help="tiny 5-user/15s shake-out")
    ap.add_argument("--yes", action="store_true", help="skip the production confirmation prompt")
    ap.add_argument("--no-writes", action="store_true", help="reads only; no POSTs")
    ap.add_argument("--no-show", action="store_true", help="don't open chart windows")
    ap.add_argument("--host", default=None, help="override target base URL")
    ap.add_argument("--config", default=None, help="path to a run_config.json (sets run params)")
    ap.add_argument("--cleanup", action="store_true", help="delete LOADTEST data and exit")
    args = ap.parse_args()

    # Set the config-file env var BEFORE importing locustfile, so the pre-flight
    # prompt shows the overridden values and the locust subprocess inherits it.
    if args.config:
        os.environ["LOADTEST_CONFIG_FILE"] = os.path.abspath(args.config)

    lf = _import_config()
    if args.host:
        lf.BASE_URL = args.host  # so the prompt + cleanup use the override

    if args.cleanup:
        sys.exit(cleanup(lf))

    writes = not args.no_writes and lf.ENABLE_WRITES
    if not confirm(lf, args.smoke, writes, args.yes):
        print("Aborted.")
        sys.exit(0)

    rc = run_locust(args.smoke, writes, args.host)
    if rc != 0:
        print(f"\nLocust exited with code {rc}. Charts may be incomplete.")
    print("\n" + "-" * 72 + "\nGenerating charts + verdict ...\n" + "-" * 72)
    run_analyze(args.no_show)


if __name__ == "__main__":
    main()
