"""Pydantic models for the dashboard API.

These are intentionally lenient: the run config is carried as a plain dict so the
React form can add/remove keys without breaking validation. configstore owns the
canonical defaults and merging.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class RampStage(BaseModel):
    users: int
    hold_seconds: int
    spawn_rate: float


class RunConfig(BaseModel):
    """Mirror of run_config.json. Used for documentation / optional validation;
    the API accepts a raw dict and merges it over the defaults in configstore."""

    base_url: str = "http://localhost:5000"
    ramp_stages: List[List[float]] = Field(
        default_factory=lambda: [[10, 60, 10], [50, 60, 25], [100, 60, 50],
                                 [250, 60, 50], [500, 90, 75], [1000, 120, 100]]
    )
    persona_weights: Dict[str, float] = Field(
        default_factory=lambda: {"GuestBrowser": 60, "InvitePoller": 20,
                                 "RsvpBuyer": 15, "LandingConfirmer": 5}
    )
    think_min: float = 1.0
    think_max: float = 5.0
    enable_writes: bool = True
    allow_approve_design: bool = True
    fallback_token: str = "00000000000000000000000000000000"
    fallback_groom_username: str = "groom"
    p95_ms: float = 1000.0
    error_rate_max: float = 0.01


class RunRequest(BaseModel):
    config: Dict[str, Any] = Field(default_factory=dict)
    confirm_production: bool = False


class Credentials(BaseModel):
    admin_user: str = ""
    admin_pass: str = ""
    groom_user: str = ""
    groom_pass: str = ""


class Preset(BaseModel):
    name: str
    config: Dict[str, Any]


class CleanupStep(BaseModel):
    step: str
    ok: bool
    deleted: Optional[Any] = None
    error: Optional[str] = None
    hint: Optional[str] = None


class RunStatus(BaseModel):
    state: str
    run_id: Optional[str] = None
    started_at: Optional[float] = None
    aborted: bool = False
    config: Optional[Dict[str, Any]] = None
    locust: Dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None
    cleanup_report: List[Dict[str, Any]] = Field(default_factory=list)
