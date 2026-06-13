"""RunManager — owns the Locust subprocess lifecycle and the live event stream.

State machine (names match the UI's run-state timeline):
    idle -> preparing -> running -> [stopping] -> cleanup -> analyzing -> done | error

Locust runs as a child process in WEB mode with --autostart/--autoquit so we can
(a) poll its JSON /stats/requests for live metrics and (b) abort it gracefully via
GET/POST /stop (which lets the @events.test_stop listeners flush the custom CSVs)
before terminating the process so the LoadTestShape can't restart it.

This module NEVER imports locustfile.py / locust / gevent.
"""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import threading
import time
from typing import Any, Dict, List, Optional

import requests

from dashboard import cleanup as cleanup_mod
from dashboard import configstore
from dashboard import history as history_mod

ROOT = configstore.ROOT
OUT_DIR = os.path.join(ROOT, "out")
RUNS_DIR = os.path.join(OUT_DIR, "runs")
LOCUSTFILE = os.path.join(ROOT, "locustfile.py")
RUN_CONFIG_PATH = os.path.join(OUT_DIR, "run_config.json")
VERDICT_PATH = os.path.join(OUT_DIR, "verdict.json")
LOCUST_LOG = os.path.join(OUT_DIR, "locust.log")

ACTIVE_STATES = {"preparing", "running", "stopping", "cleanup", "analyzing"}

# Latest-run artifacts wiped at the start of a new run (out/ keeps latest only;
# the runs/ archive directory is preserved).
_ROTATE = [
    "dawa_stats.csv", "dawa_stats_history.csv", "dawa_failures.csv",
    "dawa_exceptions.csv", "status_breakdown.csv", "page_ttfb.csv",
    "report.html", "verdict.json", "run_config.json", "locust.log",
    "1_latency_vs_users.png", "2_throughput_over_time.png",
    "3_errors.png", "4_endpoint_latency.png",
]

_RESULT_ARTIFACTS = [
    "1_latency_vs_users.png", "2_throughput_over_time.png",
    "3_errors.png", "4_endpoint_latency.png", "report.html",
]


def _num(v: Any) -> float:
    try:
        n = float(v)
        return n if n == n else 0.0  # NaN guard
    except (TypeError, ValueError):
        return 0.0


def _pctl(d: Dict[str, Any], p: int) -> float:
    """Pull a current p50/p95 from the locust stats JSON across version layouts."""
    key = f"current_response_time_percentile_{p}"
    if d.get(key) is not None:
        return _num(d[key])
    cur = d.get("current_response_time_percentiles") or {}
    for k in (f"response_time_percentile_0.{p}", f"response_time_percentile_{p/100}", str(p)):
        if cur.get(k) is not None:
            return _num(cur[k])
    return 0.0


def is_production(url: str) -> bool:
    from urllib.parse import urlparse
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:  # noqa: BLE001
        host = ""
    if not host:
        return False
    if host in {"localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"}:
        return False
    if host.endswith(".local"):
        return False
    return True


class RunManager:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self.state = "idle"
        self.run_id: Optional[str] = None
        self.started_at: Optional[float] = None
        self.ended_at: Optional[float] = None
        self.aborted = False
        self.error: Optional[str] = None
        self.config: Optional[Dict[str, Any]] = None
        self.target: Optional[str] = None
        self.proc: Optional[subprocess.Popen] = None
        self.web_port = int(os.environ.get("LOADTEST_LOCUST_WEB_PORT", "8089"))
        self.user_count = 0
        self.locust_state: Optional[str] = None
        self.cleanup_report: List[Dict[str, Any]] = []
        self._events: List[tuple] = []
        self._seq = 0
        self._got_stats = False
        self._log = None
        self._monitor: Optional[threading.Thread] = None

    # --- event hub ----------------------------------------------------------
    def _emit(self, name: str, data: Any) -> None:
        payload = json.dumps(data, default=str)
        with self._lock:
            self._seq += 1
            self._events.append((self._seq, name, payload))
            if len(self._events) > 8000:
                self._events = self._events[-6000:]

    def _set_state(self, s: str, **extra: Any) -> None:
        with self._lock:
            self.state = s
        data = {
            "state": s, "run_id": self.run_id, "aborted": self.aborted,
            "error": self.error, "user_count": self.user_count,
        }
        data.update(extra)
        self._emit("state", data)

    def events_since(self, cursor: int) -> List[tuple]:
        with self._lock:
            return [e for e in self._events if e[0] > cursor]

    # --- lifecycle ----------------------------------------------------------
    def start(self, config: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            if self.state in ACTIVE_STATES:
                raise RunningError("a run is already in progress")
            self._events = []
            self._seq = 0
            self.cleanup_report = []
            self.error = None
            self.aborted = False
            self._got_stats = False
            self.user_count = 0
            self.locust_state = None
            self.config = dict(config or {})
            self.target = self.config.get("base_url")
            self.started_at = time.time()
            self.ended_at = None
            self.run_id = time.strftime("%Y%m%d-%H%M%S", time.localtime(self.started_at))

        self._set_state("preparing")
        self._rotate_out()
        self._write_run_config()
        err = self._spawn_locust()
        if err:
            self.error = err
            self._set_state("cleanup")
            self._post_cleanup_only()
            self._set_state("error")
            self._emit("done", {"state": "error", "error": err, "run_id": self.run_id})
            raise SpawnError(err)

        self._set_state("running")
        self._monitor = threading.Thread(target=self._run_monitor, daemon=True)
        self._monitor.start()
        return {"ok": True, "run_id": self.run_id, "state": self.state}

    def _rotate_out(self) -> None:
        os.makedirs(OUT_DIR, exist_ok=True)
        os.makedirs(RUNS_DIR, exist_ok=True)
        for name in _ROTATE:
            p = os.path.join(OUT_DIR, name)
            try:
                if os.path.exists(p):
                    os.remove(p)
            except OSError:
                pass

    def _write_run_config(self) -> None:
        cfg = configstore._strip_creds(self.config or {})
        with open(RUN_CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)

    def _spawn_locust(self) -> Optional[str]:
        env = dict(os.environ)
        env["LOADTEST_CONFIG_FILE"] = RUN_CONFIG_PATH
        env["LOADTEST_OUT_DIR"] = OUT_DIR
        if self.target:
            env["LOADTEST_BASE_URL"] = self.target
        env.update(configstore.credentials_env())
        # The dashboard expresses everything via the config file; make sure no
        # stray CLI-mode env vars leak in.
        for k in ("LOADTEST_SMOKE", "LOADTEST_NO_WRITES", "LOADTEST_NO_APPROVE"):
            env.pop(k, None)

        cmd = [
            sys.executable, "-m", "locust", "-f", LOCUSTFILE,
            "--web-host", "127.0.0.1", "--web-port", str(self.web_port),
            "--autostart", "--autoquit", "5",
            "--csv", os.path.join(OUT_DIR, "dawa"),
            "--csv-full-history",
            "--html", os.path.join(OUT_DIR, "report.html"),
        ]
        creationflags = 0
        if os.name == "nt":
            creationflags = subprocess.CREATE_NEW_PROCESS_GROUP
        try:
            self._log = open(LOCUST_LOG, "w", encoding="utf-8", errors="replace")
            self.proc = subprocess.Popen(
                cmd, cwd=ROOT, env=env,
                stdout=self._log, stderr=subprocess.STDOUT,
                creationflags=creationflags,
            )
        except Exception as e:  # noqa: BLE001
            return f"failed to start locust: {e}"
        return None

    def _run_monitor(self) -> None:
        base = f"http://127.0.0.1:{self.web_port}"
        boot_deadline = time.monotonic() + 25  # tolerate slow boot / connrefused
        while True:
            rc = self.proc.poll() if self.proc else 0
            snap = self._poll_stats(base)
            if snap is not None:
                self._got_stats = True
                with self._lock:
                    self.user_count = snap["user_count"]
                self._emit("stats", snap)
            if rc is not None:
                break
            if not self._got_stats and time.monotonic() > boot_deadline and rc is not None:
                break
            time.sleep(2.0)

        with self._lock:
            self.ended_at = time.time()
        try:
            if self._log:
                self._log.flush()
                self._log.close()
        except Exception:  # noqa: BLE001
            pass
        self._post_run()

    def _poll_stats(self, base: str) -> Optional[Dict[str, Any]]:
        try:
            r = requests.get(base + "/stats/requests", timeout=2)
        except requests.RequestException:
            return None
        if r.status_code != 200:
            return None
        try:
            d = r.json()
        except ValueError:
            return None
        self.locust_state = d.get("state")
        endpoints = []
        for row in d.get("stats", []) or []:
            nm = row.get("name")
            if nm in ("Aggregated", "Total"):
                continue
            endpoints.append({
                "name": nm,
                "method": row.get("method") or "",
                "rps": _num(row.get("current_rps")),
                "p95": _num(row.get("response_time_percentile_0.95")
                            or row.get("ninety_fifth_response_time")
                            or row.get("ninetieth_response_time")
                            or row.get("median_response_time")),
                "failures": int(_num(row.get("num_failures"))),
            })
        return {
            "ts": time.time(),
            "user_count": int(_num(d.get("user_count"))),
            "total_rps": _num(d.get("total_rps")),
            "fail_ratio": _num(d.get("fail_ratio")),
            "p50": _pctl(d, 50),
            "p95": _pctl(d, 95),
            "endpoints": endpoints,
        }

    def _post_run(self) -> None:
        # 1. Cleanup ALWAYS (normal end, abort, or crash).
        self._set_state("cleanup")
        report = self._run_cleanup()
        self._emit("cleanup", report)

        # 2. Analyze (best-effort; produces verdict.json + the 4 PNGs).
        self._set_state("analyzing")
        self._run_analyze()

        # 3. Terminal state.
        rc = self.proc.returncode if self.proc else None
        if not self._got_stats and rc not in (0, None):
            tail = self._log_tail()
            self.error = self.error or f"locust exited with code {rc}. {tail}"
            final = "error"
        else:
            final = "done"
        with self._lock:
            self.ended_at = time.time()
        self._set_state(final)
        self._emit("done", {
            "state": final, "aborted": self.aborted,
            "run_id": self.run_id, "error": self.error,
        })

    def _post_cleanup_only(self) -> None:
        report = self._run_cleanup()
        self._emit("cleanup", report)

    def _run_cleanup(self) -> List[Dict[str, Any]]:
        try:
            report = cleanup_mod.run_full(self.target or "")
        except Exception as e:  # noqa: BLE001
            report = [{"step": "cleanup", "ok": False, "deleted": None,
                       "error": str(e), "hint": None}]
        with self._lock:
            self.cleanup_report = report
        return report

    def _run_analyze(self) -> None:
        cfg = self.config or {}
        cmd = [
            sys.executable, os.path.join(ROOT, "analyze.py"),
            "--prefix", os.path.join(OUT_DIR, "dawa"),
            "--out-dir", OUT_DIR, "--no-show",
            "--json", VERDICT_PATH,
            "--p95-ms", str(cfg.get("p95_ms", 1000.0)),
            "--error-rate-max", str(cfg.get("error_rate_max", 0.01)),
        ]
        try:
            subprocess.call(cmd, cwd=ROOT, timeout=180)
        except Exception:  # noqa: BLE001
            pass  # analyze failing must not break the run

    # --- abort --------------------------------------------------------------
    def stop(self) -> Dict[str, Any]:
        with self._lock:
            if self.state not in ACTIVE_STATES:
                raise RunningError("no run in progress")
            self.aborted = True
        self._set_state("stopping")
        threading.Thread(target=self._do_stop, daemon=True).start()
        return {"ok": True}

    def _do_stop(self) -> None:
        base = f"http://127.0.0.1:{self.web_port}"
        for method in ("get", "post"):
            try:
                getattr(requests, method)(base + "/stop", timeout=5)
                break
            except requests.RequestException:
                continue
        # Let @events.test_stop flush status_breakdown.csv / page_ttfb.csv.
        time.sleep(3)
        self._terminate_proc()

    def _terminate_proc(self) -> None:
        p = self.proc
        if not p or p.poll() is not None:
            return
        try:
            if os.name == "nt":
                p.send_signal(signal.CTRL_BREAK_EVENT)
            else:
                p.terminate()
        except Exception:  # noqa: BLE001
            pass
        try:
            p.wait(timeout=10)
        except Exception:  # noqa: BLE001
            try:
                p.kill()
            except Exception:  # noqa: BLE001
                pass

    # --- cleanup retry / archive / status ----------------------------------
    def retry_cleanup(self) -> List[Dict[str, Any]]:
        report = cleanup_mod.retry_failed(self.target or "", self.cleanup_report or [])
        with self._lock:
            self.cleanup_report = report
        self._emit("cleanup", report)
        return report

    def archive(self) -> Dict[str, Any]:
        stamp = self.run_id or time.strftime("%Y%m%d-%H%M%S")
        meta = history_mod.archive_latest({
            "config": self.config,
            "started_at": self.started_at,
            "ended_at": self.ended_at,
            "aborted": self.aborted,
            "cleanup_report": self.cleanup_report,
            "timestamp": stamp,
            "target": self.target,
        }, stamp)
        return {"id": meta["id"]}

    def status(self) -> Dict[str, Any]:
        return {
            "state": self.state,
            "run_id": self.run_id,
            "started_at": self.started_at,
            "aborted": self.aborted,
            "config": self.config,
            "locust": {"user_count": self.user_count, "state": self.locust_state},
            "error": self.error,
            "cleanup_report": self.cleanup_report,
        }

    def latest_results(self) -> Dict[str, Any]:
        verdict = None
        if os.path.exists(VERDICT_PATH):
            try:
                with open(VERDICT_PATH, encoding="utf-8") as f:
                    verdict = json.load(f)
            except (OSError, ValueError):
                verdict = None
        artifacts = [f"/artifacts/latest/{n}" for n in _RESULT_ARTIFACTS
                     if os.path.exists(os.path.join(OUT_DIR, n))]
        archived = bool(self.run_id) and os.path.isdir(os.path.join(RUNS_DIR, self.run_id or ""))
        return {"verdict": verdict, "artifacts": artifacts, "archived": archived}

    def _log_tail(self, lines: int = 15) -> str:
        try:
            with open(LOCUST_LOG, encoding="utf-8", errors="replace") as f:
                return "".join(f.readlines()[-lines:]).strip()
        except OSError:
            return ""


class RunningError(RuntimeError):
    """Raised when an operation conflicts with the current run state (HTTP 409)."""


class SpawnError(RuntimeError):
    """Raised when locust fails to start."""


# Module-level singleton shared by the API.
MANAGER = RunManager()
