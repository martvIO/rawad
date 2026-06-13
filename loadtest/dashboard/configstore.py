"""Config, credentials, and preset persistence for the dashboard.

Files (all under loadtest/):
  .lastconfig.json   last-used run config (gitignored)
  .env               admin/groom credentials (gitignored)
  presets/*.json     named, committed run configs — NEVER credentials
"""

from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List

from dotenv import dotenv_values, set_key

HERE = os.path.dirname(os.path.abspath(__file__))          # .../loadtest/dashboard
ROOT = os.path.dirname(HERE)                                # .../loadtest
LASTCONFIG_PATH = os.path.join(ROOT, ".lastconfig.json")
ENV_PATH = os.path.join(ROOT, ".env")
PRESETS_DIR = os.path.join(ROOT, "presets")

# Keep in sync with the CONFIG block at the top of loadtest/locustfile.py.
# (The dashboard process must never import locustfile.py — it monkey-patches
# gevent — so the defaults are duplicated here on purpose.)
DEFAULT_CONFIG: Dict[str, Any] = {
    "base_url": "http://localhost:5000",
    "ramp_stages": [[10, 60, 10], [50, 60, 25], [100, 60, 50],
                    [250, 60, 50], [500, 90, 75], [1000, 120, 100]],
    "persona_weights": {"GuestBrowser": 60, "InvitePoller": 20,
                        "RsvpBuyer": 15, "LandingConfirmer": 5},
    "think_min": 1.0,
    "think_max": 5.0,
    "enable_writes": True,
    "allow_approve_design": True,
    "fallback_token": "00000000000000000000000000000000",
    "fallback_groom_username": "groom",
    "p95_ms": 1000.0,
    "error_rate_max": 0.01,
}

# Defaults mirror locustfile.py CREDENTIALS (env LOADTEST_*_USER/PASS override).
DEFAULT_CREDENTIALS: Dict[str, str] = {
    "admin_user": "admin",
    "admin_pass": "DawaAdmin2026",
    "groom_user": "groom",
    "groom_pass": "DawaGroom2026",
}

# Credential-ish keys are stripped from any preset / config that gets persisted.
_CRED_KEYS = {"admin_user", "admin_pass", "groom_user", "groom_pass",
              "username", "password"}
_SLUG_RE = re.compile(r"[^a-zA-Z0-9_-]+")


# --- run config -------------------------------------------------------------
def get_config() -> Dict[str, Any]:
    cfg = dict(DEFAULT_CONFIG)
    if os.path.exists(LASTCONFIG_PATH):
        try:
            with open(LASTCONFIG_PATH, encoding="utf-8") as f:
                cfg.update(json.load(f) or {})
        except (OSError, ValueError):
            pass
    return cfg


def save_config(cfg: Dict[str, Any]) -> Dict[str, Any]:
    clean = _strip_creds(cfg)
    merged = dict(DEFAULT_CONFIG)
    merged.update(clean)
    with open(LASTCONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(merged, f, indent=2)
    return merged


# --- credentials ------------------------------------------------------------
def get_credentials() -> Dict[str, str]:
    creds = dict(DEFAULT_CREDENTIALS)
    values = dotenv_values(ENV_PATH) if os.path.exists(ENV_PATH) else {}
    mapping = {
        "LOADTEST_ADMIN_USER": "admin_user",
        "LOADTEST_ADMIN_PASS": "admin_pass",
        "LOADTEST_GROOM_USER": "groom_user",
        "LOADTEST_GROOM_PASS": "groom_pass",
    }
    for env_key, out_key in mapping.items():
        if values.get(env_key):
            creds[out_key] = values[env_key]
    return creds


def save_credentials(creds: Dict[str, str]) -> Dict[str, str]:
    if not os.path.exists(ENV_PATH):
        # set_key needs the file to exist.
        open(ENV_PATH, "a", encoding="utf-8").close()
    mapping = {
        "admin_user": "LOADTEST_ADMIN_USER",
        "admin_pass": "LOADTEST_ADMIN_PASS",
        "groom_user": "LOADTEST_GROOM_USER",
        "groom_pass": "LOADTEST_GROOM_PASS",
    }
    for in_key, env_key in mapping.items():
        if in_key in creds and creds[in_key] is not None:
            set_key(ENV_PATH, env_key, str(creds[in_key]), quote_mode="never")
    return get_credentials()


def credentials_env() -> Dict[str, str]:
    """Credentials as LOADTEST_* env vars for the locust subprocess."""
    c = get_credentials()
    return {
        "LOADTEST_ADMIN_USER": c["admin_user"],
        "LOADTEST_ADMIN_PASS": c["admin_pass"],
        "LOADTEST_GROOM_USER": c["groom_user"],
        "LOADTEST_GROOM_PASS": c["groom_pass"],
    }


# --- presets ----------------------------------------------------------------
def list_presets() -> List[Dict[str, Any]]:
    os.makedirs(PRESETS_DIR, exist_ok=True)
    out: List[Dict[str, Any]] = []
    for fn in sorted(os.listdir(PRESETS_DIR)):
        if not fn.endswith(".json"):
            continue
        path = os.path.join(PRESETS_DIR, fn)
        try:
            with open(path, encoding="utf-8") as f:
                cfg = json.load(f)
        except (OSError, ValueError):
            continue
        out.append({"name": fn[:-5], "config": cfg})
    return out


def save_preset(name: str, cfg: Dict[str, Any]) -> Dict[str, Any]:
    slug = _slugify(name)
    if not slug:
        raise ValueError("invalid preset name")
    os.makedirs(PRESETS_DIR, exist_ok=True)
    clean = _strip_creds(cfg)
    path = os.path.join(PRESETS_DIR, f"{slug}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(clean, f, indent=2)
    return {"name": slug, "config": clean}


def delete_preset(name: str) -> None:
    slug = _slugify(name)
    path = os.path.join(PRESETS_DIR, f"{slug}.json")
    if os.path.exists(path):
        os.remove(path)


# --- helpers ----------------------------------------------------------------
def _strip_creds(cfg: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in (cfg or {}).items() if k not in _CRED_KEYS}


def _slugify(name: str) -> str:
    return _SLUG_RE.sub("-", str(name or "").strip()).strip("-")


def max_users(cfg: Dict[str, Any]) -> int:
    stages = cfg.get("ramp_stages") or []
    users = [int(s[0]) for s in stages if isinstance(s, (list, tuple)) and s]
    return max(users) if users else 0
