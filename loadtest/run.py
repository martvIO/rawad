"""
Orchestrator for the Dawa load test.

    python run.py                 # full 10 -> 1000 ramp against https://dawa.to
    python run.py --smoke         # tiny 5-user / 15s shake-out
    python run.py --yes           # skip the production-safety confirmation
    python run.py --no-writes     # reads only (no POSTs to the public submit endpoints)
    python run.py --no-show       # generate charts but don't pop windows
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

# Windows consoles default to cp1252 and crash on non-ASCII output. Force UTF-8.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "out")
CSV_PREFIX = os.path.join(OUT_DIR, "dawa")


def _import_config():
    """Pull the target + ramp out of locustfile so we can show them in the prompt."""
    sys.path.insert(0, HERE)
    import locustfile as lf  # noqa: E402
    return lf


def confirm(lf, smoke: bool, writes: bool, assume_yes: bool) -> bool:
    stages = lf.SMOKE_STAGES if smoke else lf.RAMP_STAGES
    max_users = max(u for u, _, _ in stages)
    total_s = sum(h for _, h, _ in stages)
    print("=" * 72)
    print("  Dawa LOAD TEST - pre-flight")
    print("=" * 72)
    print(f"  Target          : {lf.BASE_URL}  (PRODUCTION - project dawa-aa793)")
    print(f"  Ramp            : {' -> '.join(str(u) for u, _, _ in stages)} users")
    print(f"  Max concurrency : {max_users}")
    print(f"  Hold time total : ~{total_s}s (+ ramp)")
    print(f"  Writes          : {'ON - creates LOADTEST records (mostly 429 by design)' if writes else 'OFF (reads only)'}")
    print("  Cost note       : real Cloud Function invocations + RTDB/Firestore reads will be billed.")
    print("=" * 72)
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
    """Best-effort removal of LOADTEST data created by the test (admin token)."""
    import requests
    print("Cleanup: logging in and removing LOADTEST data ...")
    admin = lf._login("admin")
    groom = lf._login("groom")
    if not admin or not groom:
        print("  ! could not log in - nothing cleaned.")
        return 1
    uid = groom.get("uid", "")
    admin_token = admin.get("idToken", "")
    groom_token = groom.get("idToken", "")
    removed = 0

    def headers(tok):
        return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}

    try:
        gr = requests.get(lf.api(f"/digital/{uid}/guests"), headers=headers(groom_token), timeout=30)
        if gr.status_code == 200:
            for g in gr.json():
                if str(g.get("name", "")).startswith("LOADTEST"):
                    d = requests.delete(lf.api(f"/digital/{uid}/guests/{g['id']}"),
                                        headers=headers(groom_token), timeout=30)
                    removed += 1 if d.status_code == 200 else 0
        wr = requests.get(lf.api(f"/digital/{uid}/wishes"), headers=headers(groom_token), timeout=30)
        if wr.status_code == 200:
            for w in wr.json():
                if str(w.get("who", "")).startswith("LOADTEST") or str(w.get("what", "")).startswith("LOADTEST"):
                    d = requests.delete(lf.api(f"/digital/{uid}/wishes/{w['id']}"),
                                        headers=headers(groom_token), timeout=30)
                    removed += 1 if d.status_code == 200 else 0
    except Exception as e:  # noqa: BLE001
        print(f"  ! cleanup error: {e}")
    print(f"  removed {removed} LOADTEST record(s).")
    print("  NOTE: mirrored LOADTEST confirmations may remain - remove them from the admin Confirmations tab.")
    return 0


def main():
    ap = argparse.ArgumentParser(description="Run the Dawa load test and report.")
    ap.add_argument("--smoke", action="store_true", help="tiny 5-user/15s shake-out")
    ap.add_argument("--yes", action="store_true", help="skip the production confirmation prompt")
    ap.add_argument("--no-writes", action="store_true", help="reads only; no POSTs")
    ap.add_argument("--no-show", action="store_true", help="don't open chart windows")
    ap.add_argument("--host", default=None, help="override target base URL")
    ap.add_argument("--cleanup", action="store_true", help="delete LOADTEST data and exit")
    args = ap.parse_args()

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
