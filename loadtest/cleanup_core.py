"""
Framework-free cleanup helpers for the Dawa load test.

This module is the shared source of truth for tearing down the LOADTEST data the
suite creates. It imports ONLY the `requests` library — never locust / gevent /
locustfile — so it is safe to import from the FastAPI dashboard, from run.py, or
from a plain script without triggering gevent's monkey-patch.

Public API:
    login(base_url, username, password) -> dict | None
    cleanup_guests_and_wishes(base_url, admin, groom) -> dict
    purge_server_data(base_url, admin_token, groom_uid) -> dict

The first two mirror the per-guest/per-wish deletion run.py used to do inline; the
third calls the admin bulk-purge endpoint (DELETE /api/admin/loadtest-data).
"""

from __future__ import annotations

from typing import Optional

import requests

API_BASE = "/api"
_TIMEOUT = 30


def _api(base_url: str, path: str) -> str:
    """Absolute API URL for a path like '/auth/login'."""
    return f"{base_url}{API_BASE}{path}"


def _headers(token: Optional[str] = None) -> dict:
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def login(base_url: str, username: str, password: str) -> Optional[dict]:
    """POST {base_url}/api/auth/login and return the parsed JSON (includes idToken
    and uid), or None on any failure. Uses the same payload shape run.py uses."""
    try:
        r = requests.post(
            _api(base_url, "/auth/login"),
            json={"username": username, "password": password},
            headers={"Content-Type": "application/json"},
            timeout=_TIMEOUT,
        )
        if r.status_code == 200:
            return r.json()
    except Exception:  # noqa: BLE001 — login failures degrade to None by contract
        return None
    return None


def cleanup_guests_and_wishes(base_url: str, admin: dict, groom: dict) -> dict:
    """Delete every digital guest / wish tagged "LOADTEST" for the groom.

    `admin` and `groom` are the dicts returned by login(). The groom idToken owns
    the /digital/:uid/... resources, so it is used for the GETs and DELETEs. A
    single failed delete never raises — it is collected into "errors".

    Returns {"guests": int, "wishes": int, "errors": [str, ...]}.
    """
    result = {"guests": 0, "wishes": 0, "errors": []}
    groom = groom or {}
    uid = groom.get("uid", "")
    groom_token = groom.get("idToken", "")
    if not uid or not groom_token:
        result["errors"].append("missing groom uid/idToken - cannot clean guests/wishes")
        return result

    # --- Guests (name starts with "LOADTEST") --------------------------------
    try:
        gr = requests.get(_api(base_url, f"/digital/{uid}/guests"),
                          headers=_headers(groom_token), timeout=_TIMEOUT)
        if gr.status_code == 200 and isinstance(gr.json(), list):
            for g in gr.json():
                if not str(g.get("name", "")).startswith("LOADTEST"):
                    continue
                gid = g.get("id")
                try:
                    d = requests.delete(_api(base_url, f"/digital/{uid}/guests/{gid}"),
                                        headers=_headers(groom_token), timeout=_TIMEOUT)
                    if d.status_code == 200:
                        result["guests"] += 1
                    else:
                        result["errors"].append(f"delete guest {gid} -> HTTP {d.status_code}")
                except Exception as e:  # noqa: BLE001
                    result["errors"].append(f"delete guest {gid} failed: {e}")
        else:
            result["errors"].append(f"list guests -> HTTP {gr.status_code}")
    except Exception as e:  # noqa: BLE001
        result["errors"].append(f"list guests failed: {e}")

    # --- Wishes (who or what starts with "LOADTEST") -------------------------
    try:
        wr = requests.get(_api(base_url, f"/digital/{uid}/wishes"),
                          headers=_headers(groom_token), timeout=_TIMEOUT)
        if wr.status_code == 200 and isinstance(wr.json(), list):
            for w in wr.json():
                if not (str(w.get("who", "")).startswith("LOADTEST")
                        or str(w.get("what", "")).startswith("LOADTEST")):
                    continue
                wid = w.get("id")
                try:
                    d = requests.delete(_api(base_url, f"/digital/{uid}/wishes/{wid}"),
                                        headers=_headers(groom_token), timeout=_TIMEOUT)
                    if d.status_code == 200:
                        result["wishes"] += 1
                    else:
                        result["errors"].append(f"delete wish {wid} -> HTTP {d.status_code}")
                except Exception as e:  # noqa: BLE001
                    result["errors"].append(f"delete wish {wid} failed: {e}")
        else:
            result["errors"].append(f"list wishes -> HTTP {wr.status_code}")
    except Exception as e:  # noqa: BLE001
        result["errors"].append(f"list wishes failed: {e}")

    return result


def purge_server_data(base_url: str, admin_token: str, groom_uid: str) -> dict:
    """Call the admin bulk-purge endpoint:
        DELETE {base_url}/api/admin/loadtest-data
    with Authorization: Bearer {admin_token} and JSON {"groomUid": groom_uid}.

    Returns {"ok": bool, "deleted": dict, "error": str|None, "status": int}.
    A 404 means the endpoint isn't deployed on this host -> ok False with a hint.
    """
    out = {"ok": False, "deleted": {}, "error": None, "status": 0}
    try:
        r = requests.delete(
            _api(base_url, "/admin/loadtest-data"),
            headers=_headers(admin_token),
            json={"groomUid": groom_uid},
            timeout=_TIMEOUT,
        )
    except Exception as e:  # noqa: BLE001
        out["error"] = f"request failed: {e}"
        return out

    out["status"] = r.status_code
    if r.status_code == 404:
        out["error"] = ("endpoint not found (HTTP 404) - deploy functions or run "
                        "backend/scripts/cleanup-loadtest.cjs")
        return out

    try:
        body = r.json()
    except ValueError:
        body = {}

    if r.status_code == 200 and body.get("ok"):
        out["ok"] = True
        out["deleted"] = body.get("deleted", {})
        return out

    # Partial failure (500) or any other non-200: surface server detail + partial counts.
    out["deleted"] = body.get("deleted", {})
    detail = body.get("detail") or body.get("error") or r.text[:200]
    out["error"] = f"purge failed (HTTP {r.status_code}): {detail}"
    return out
