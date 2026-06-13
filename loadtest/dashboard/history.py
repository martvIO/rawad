"""Run archiving, history, timeseries, and comparison.

out/ holds the LATEST run only. The Archive button copies out/* (except runs/)
into out/runs/<YYYYMMDD-HHMMSS>/ with a meta.json — those archives power the
History + Compare views.
"""

from __future__ import annotations

import csv
import json
import os
import shutil
from datetime import datetime
from typing import Any, Dict, List, Optional

from dashboard import configstore

ROOT = configstore.ROOT
OUT_DIR = os.path.join(ROOT, "out")
RUNS_DIR = os.path.join(OUT_DIR, "runs")

# Artifacts copied into an archive (everything a run produces except the runs/
# directory itself).
_ARCHIVE_GLOBS = [
    "dawa_stats.csv", "dawa_stats_history.csv", "dawa_failures.csv",
    "dawa_exceptions.csv", "status_breakdown.csv", "page_ttfb.csv",
    "report.html", "verdict.json", "run_config.json", "locust.log",
    "1_latency_vs_users.png", "2_throughput_over_time.png",
    "3_errors.png", "4_endpoint_latency.png",
]


def _read_json(path: str) -> Optional[Any]:
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def archive_latest(run_meta: Dict[str, Any], stamp: str) -> Dict[str, Any]:
    """Copy the latest out/ artifacts into out/runs/<stamp>/ and write meta.json.

    `stamp` is supplied by the caller (it owns the clock) — e.g. the runner or
    the archive route via datetime.now().
    """
    os.makedirs(RUNS_DIR, exist_ok=True)
    dest = os.path.join(RUNS_DIR, stamp)
    os.makedirs(dest, exist_ok=True)

    for name in _ARCHIVE_GLOBS:
        src = os.path.join(OUT_DIR, name)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(dest, name))

    verdict = _read_json(os.path.join(OUT_DIR, "verdict.json"))
    config = run_meta.get("config") or _read_json(os.path.join(OUT_DIR, "run_config.json")) or {}

    meta = {
        "id": stamp,
        "timestamp": run_meta.get("timestamp") or stamp,
        "started_at": run_meta.get("started_at"),
        "ended_at": run_meta.get("ended_at"),
        "aborted": bool(run_meta.get("aborted")),
        "target": (config or {}).get("base_url") or run_meta.get("target"),
        "config": config,
        "slo": {
            "p95_ms": (config or {}).get("p95_ms"),
            "error_rate_max": (config or {}).get("error_rate_max"),
        },
        "max_users": configstore.max_users(config or {}),
        "slo_pass": (verdict or {}).get("slo_pass") if verdict else None,
        "verdict": verdict,
        "cleanup_report": run_meta.get("cleanup_report") or [],
    }
    with open(os.path.join(dest, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    return meta


def list_history() -> List[Dict[str, Any]]:
    if not os.path.isdir(RUNS_DIR):
        return []
    out: List[Dict[str, Any]] = []
    for name in os.listdir(RUNS_DIR):
        meta = _read_json(os.path.join(RUNS_DIR, name, "meta.json"))
        if meta:
            out.append(meta)
        else:
            out.append({"id": name, "timestamp": name})
    out.sort(key=lambda m: str(m.get("id", "")), reverse=True)
    return out


def get_history(run_id: str) -> Optional[Dict[str, Any]]:
    safe = os.path.basename(run_id)
    meta = _read_json(os.path.join(RUNS_DIR, safe, "meta.json"))
    return meta


def delete_history(run_id: str) -> bool:
    safe = os.path.basename(run_id)
    path = os.path.join(RUNS_DIR, safe)
    if os.path.isdir(path):
        shutil.rmtree(path, ignore_errors=True)
        return True
    return False


def _history_csv(run_id: str) -> str:
    safe = os.path.basename(run_id)
    return os.path.join(RUNS_DIR, safe, "dawa_stats_history.csv")


def timeseries(run_id: str, max_points: int = 500) -> List[Dict[str, Any]]:
    """Parse the Aggregated rows of a run's dawa_stats_history.csv."""
    path = _history_csv(run_id)
    if not os.path.exists(path):
        return []
    rows: List[Dict[str, Any]] = []
    try:
        with open(path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for r in reader:
                name = (r.get("Name") or "").strip()
                if name not in ("Aggregated", "Total", ""):
                    continue
                rps = _f(r.get("Requests/s"))
                fps = _f(r.get("Failures/s"))
                rows.append({
                    "t": _f(r.get("Timestamp")),
                    "users": int(_f(r.get("User Count"))),
                    "rps": rps,
                    "fail_rate": (fps / rps) if rps > 0 else 0.0,
                    "p50": _f(r.get("50%")),
                    "p95": _f(r.get("95%")),
                    "p99": _f(r.get("99%")),
                })
    except (OSError, ValueError):
        return []

    # keep only one aggregated row per timestamp (DictReader may include the
    # final cumulative block too); de-dupe by timestamp keeping the last.
    if len(rows) > max_points:
        stride = len(rows) // max_points + 1
        rows = rows[::stride]
    return rows


def compare(a: str, b: str) -> Dict[str, Any]:
    return {
        "a": {"meta": get_history(a) or {"id": a}, "timeseries": timeseries(a)},
        "b": {"meta": get_history(b) or {"id": b}, "timeseries": timeseries(b)},
    }


def _f(v: Any) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0
