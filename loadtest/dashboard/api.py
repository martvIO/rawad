"""FastAPI app: config/credentials/presets CRUD, run lifecycle, live SSE,
cleanup, results, and archived run history. Serves the built React SPA.

Bound to 127.0.0.1 only — no auth (local developer tool).
"""

from __future__ import annotations

import asyncio
import os
from typing import Any, Dict

from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from dashboard import configstore, history as history_mod
from dashboard.runner import MANAGER, RunningError, SpawnError, is_production
from dashboard.schemas import RunRequest

ROOT = configstore.ROOT
OUT_DIR = os.path.join(ROOT, "out")
RUNS_DIR = os.path.join(OUT_DIR, "runs")
UI_DIST = os.path.join(ROOT, "ui", "dist")

app = FastAPI(title="Dawa Load-test Dashboard", docs_url="/api/docs", openapi_url="/api/openapi.json")


# --- config -----------------------------------------------------------------
@app.get("/api/config")
def get_config() -> Dict[str, Any]:
    return configstore.get_config()


@app.put("/api/config")
def put_config(cfg: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    return configstore.save_config(cfg)


# --- credentials ------------------------------------------------------------
@app.get("/api/credentials")
def get_credentials() -> Dict[str, str]:
    return configstore.get_credentials()


@app.put("/api/credentials")
def put_credentials(creds: Dict[str, str] = Body(...)) -> Dict[str, str]:
    return configstore.save_credentials(creds)


# --- presets ----------------------------------------------------------------
@app.get("/api/presets")
def get_presets():
    return configstore.list_presets()


@app.put("/api/presets/{name}")
def put_preset(name: str, cfg: Dict[str, Any] = Body(...)):
    try:
        return configstore.save_preset(name, cfg)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/presets/{name}")
def delete_preset(name: str):
    configstore.delete_preset(name)
    return {"ok": True}


# --- run lifecycle ----------------------------------------------------------
@app.post("/api/run")
def post_run(req: RunRequest):
    config = req.config or {}
    if MANAGER.state in ("preparing", "running", "stopping", "cleanup", "analyzing"):
        raise HTTPException(status_code=409, detail="a run is already in progress")
    if is_production(config.get("base_url", "")) and not req.confirm_production:
        return JSONResponse(
            status_code=428,
            content={"error": "production_confirmation_required",
                     "host": config.get("base_url", "")},
        )
    try:
        return MANAGER.start(config)
    except RunningError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except SpawnError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/run/stop")
def post_stop():
    try:
        return MANAGER.stop()
    except RunningError as e:
        raise HTTPException(status_code=409, detail=str(e))


@app.get("/api/run/status")
def get_status():
    return MANAGER.status()


@app.get("/api/run/stream")
async def get_stream(request: Request):
    async def gen():
        cursor = 0
        # Replay the current run's events so a freshly-opened page is in sync.
        while True:
            if await request.is_disconnected():
                break
            for seq, name, data in MANAGER.events_since(cursor):
                cursor = seq
                yield f"event: {name}\ndata: {data}\n\n"
            yield ": ping\n\n"
            await asyncio.sleep(0.5)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no",
                 "Connection": "keep-alive"},
    )


@app.post("/api/cleanup/retry")
def post_cleanup_retry():
    return MANAGER.retry_cleanup()


# --- results + archive ------------------------------------------------------
@app.get("/api/results/latest")
def get_results():
    return MANAGER.latest_results()


@app.post("/api/archive")
def post_archive():
    return MANAGER.archive()


# --- history ----------------------------------------------------------------
@app.get("/api/history")
def get_history():
    return history_mod.list_history()


@app.get("/api/history/{run_id}")
def get_history_item(run_id: str):
    meta = history_mod.get_history(run_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="run not found")
    return meta


@app.delete("/api/history/{run_id}")
def delete_history_item(run_id: str):
    ok = history_mod.delete_history(run_id)
    if not ok:
        raise HTTPException(status_code=404, detail="run not found")
    return {"ok": True}


@app.get("/api/history/{run_id}/timeseries")
def get_history_timeseries(run_id: str):
    return history_mod.timeseries(run_id)


@app.get("/api/compare")
def get_compare(a: str, b: str):
    return history_mod.compare(a, b)


# --- static artifacts + SPA -------------------------------------------------
def _mount_static() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(RUNS_DIR, exist_ok=True)
    # Artifact servers (declared before the SPA catch-all).
    app.mount("/artifacts/runs", StaticFiles(directory=RUNS_DIR), name="artifacts-runs")
    app.mount("/artifacts/latest", StaticFiles(directory=OUT_DIR), name="artifacts-latest")
    if os.path.isdir(UI_DIST):
        # html=True -> SPA fallback to index.html for unknown paths.
        app.mount("/", StaticFiles(directory=UI_DIST, html=True), name="spa")


_mount_static()
