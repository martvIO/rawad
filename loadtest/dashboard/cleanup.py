"""Always-on cleanup orchestration.

Runs after every load test (normal end, abort, or crash). Produces a report
list [{step, ok, deleted, error, hint}] — nothing is swallowed; failed steps are
surfaced to the UI and can be retried.

Reuses the framework-free loadtest/cleanup_core.py (the same logic run.py
--cleanup uses), so the CLI and the dashboard stay in lockstep.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Tuple

import cleanup_core  # top-level module in loadtest/ (ROOT on sys.path)

from dashboard import configstore

OUT_DIR = os.path.join(configstore.ROOT, "out")

_PURGE_HINT = ("endpoint not deployed — run `firebase deploy --only functions` "
               "or `node backend/scripts/cleanup-loadtest.cjs`")


def _login_both(target: str) -> Tuple[Optional[dict], Optional[dict]]:
    creds = configstore.get_credentials()
    try:
        admin = cleanup_core.login(target, creds["admin_user"], creds["admin_pass"])
    except Exception:  # noqa: BLE001
        admin = None
    try:
        groom = cleanup_core.login(target, creds["groom_user"], creds["groom_pass"])
    except Exception:  # noqa: BLE001
        groom = None
    return admin, groom


def _step_guests_wishes(target: str, admin: Optional[dict], groom: Optional[dict]) -> Dict[str, Any]:
    if not admin or not groom:
        return {"step": "guests_wishes", "ok": False, "deleted": None,
                "error": "could not log in as admin/groom",
                "hint": "check credentials in loadtest/.env"}
    try:
        res = cleanup_core.cleanup_guests_and_wishes(target, admin, groom)
    except Exception as e:  # noqa: BLE001
        return {"step": "guests_wishes", "ok": False, "deleted": None,
                "error": str(e), "hint": "is the target reachable?"}
    errors = res.get("errors") or []
    return {
        "step": "guests_wishes",
        "ok": not errors,
        "deleted": {"guests": res.get("guests", 0), "wishes": res.get("wishes", 0)},
        "error": "; ".join(errors) if errors else None,
        "hint": None if not errors else "some per-record deletes failed",
    }


def _step_server_purge(target: str, admin: Optional[dict], groom: Optional[dict]) -> Dict[str, Any]:
    if not admin:
        return {"step": "server_purge", "ok": False, "deleted": None,
                "error": "could not log in as admin",
                "hint": "check admin credentials in loadtest/.env"}
    try:
        res = cleanup_core.purge_server_data(
            target, admin.get("idToken", ""), (groom or {}).get("uid", "")
        )
    except Exception as e:  # noqa: BLE001
        return {"step": "server_purge", "ok": False, "deleted": None,
                "error": str(e), "hint": _PURGE_HINT}
    ok = bool(res.get("ok"))
    return {
        "step": "server_purge",
        "ok": ok,
        "deleted": res.get("deleted"),
        "error": res.get("error"),
        "hint": None if ok else _PURGE_HINT,
    }


def _step_artifacts(target: str, admin: Optional[dict], groom: Optional[dict]) -> Dict[str, Any]:
    # No deletion — out/ is rotated at the start of the next run; the Archive
    # button preserves a run first. This step just records the inventory.
    known = ["dawa_stats.csv", "dawa_stats_history.csv", "status_breakdown.csv",
             "page_ttfb.csv", "report.html"]
    present = [n for n in known if os.path.exists(os.path.join(OUT_DIR, n))]
    has_verdict = os.path.exists(os.path.join(OUT_DIR, "verdict.json"))
    return {
        "step": "artifacts",
        "ok": True,
        "deleted": {"artifacts": len(present), "verdict": "yes" if has_verdict else "no"},
        "error": None,
        "hint": None,
    }


_STEPS = {
    "guests_wishes": _step_guests_wishes,
    "server_purge": _step_server_purge,
    "artifacts": _step_artifacts,
}
_ORDER = ["guests_wishes", "server_purge", "artifacts"]


def run_full(target: str) -> List[Dict[str, Any]]:
    """Run all cleanup steps and return the report."""
    admin, groom = _login_both(target)
    return [_STEPS[name](target, admin, groom) for name in _ORDER]


def retry_failed(target: str, prev_report: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Re-run only the steps that previously failed; keep the rest as-is."""
    failed = {r.get("step") for r in prev_report if not r.get("ok")}
    if not failed:
        return prev_report
    admin, groom = _login_both(target)
    out: List[Dict[str, Any]] = []
    for r in prev_report:
        step = r.get("step")
        if r.get("ok") or step not in _STEPS:
            out.append(r)
        else:
            out.append(_STEPS[step](target, admin, groom))
    return out
