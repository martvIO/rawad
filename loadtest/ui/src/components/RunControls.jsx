import React, { useState } from "react";
import { C, SP, card, button, chip } from "../theme.js";
import { startRun, stopRun, isLocalhost } from "../api.js";
import ProdConfirmModal from "./ProdConfirmModal.jsx";

// Start/stop controls + run-state timeline.
// Props:
//   config: current RunConfig (used as the run body)
//   runState: current state string from /api/run/status or SSE "state"
//   userCount: current locust user count (optional, for display)
//   onStarted: () => void   (e.g. clear charts / refresh status)
const TIMELINE = ["idle", "preparing", "running", "stopping", "cleanup", "analyzing", "done"];

export default function RunControls({ config, runState, userCount, onStarted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showProd, setShowProd] = useState(false);

  const cfg = config || {};
  const local = isLocalhost(cfg.base_url);
  const active = ["preparing", "running", "stopping", "cleanup", "analyzing"].includes(
    String(runState || "").toLowerCase()
  );

  const doStart = async (confirmProduction) => {
    setBusy(true);
    setError(null);
    try {
      await startRun(cfg, confirmProduction);
      setShowProd(false);
      if (onStarted) onStarted();
    } catch (e) {
      if (e.status === 428) {
        // production confirmation required
        setShowProd(true);
      } else if (e.status === 409) {
        setError("A run is already in progress.");
      } else {
        setError(e.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const start = () => doStart(false);

  const stop = async () => {
    setBusy(true);
    setError(null);
    try {
      await stopRun();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.md, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={start}
          disabled={busy || active}
          style={{ ...button(local ? "primary" : "danger"), opacity: busy || active ? 0.5 : 1 }}
        >
          {local ? "Start run" : "Start run (production)"}
        </button>
        <button
          type="button"
          onClick={stop}
          disabled={busy || !active}
          style={{ ...button("ghost"), opacity: busy || !active ? 0.5 : 1 }}
        >
          Stop
        </button>
        <span style={{ fontSize: 12, color: C.textFaint }}>
          Stopping still runs data cleanup.
        </span>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: SP.md }}>
          {userCount != null && (
            <span style={{ fontSize: 13, color: C.textDim }}>
              users <strong style={{ color: C.text }}>{userCount}</strong>
            </span>
          )}
          <span style={chip(stateChip(runState))}>{runState || "idle"}</span>
        </div>
      </div>

      {error && (
        <div style={{ marginTop: SP.sm, fontSize: 13, color: C.red }}>{error}</div>
      )}

      {/* Run-state timeline */}
      <div style={{ display: "flex", alignItems: "center", marginTop: SP.lg, flexWrap: "wrap" }}>
        {TIMELINE.map((step, i) => {
          const reached = timelineIndex(runState) >= i;
          const current = String(runState || "").toLowerCase() === step;
          return (
            <React.Fragment key={step}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  opacity: reached ? 1 : 0.4,
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: current ? C.gold : reached ? C.green : C.border,
                    boxShadow: current ? `0 0 0 3px ${C.goldGlow}` : "none",
                  }}
                />
                <span
                  style={{
                    fontSize: 12,
                    color: current ? C.gold : reached ? C.text : C.textFaint,
                    textTransform: "capitalize",
                  }}
                >
                  {step}
                </span>
              </div>
              {i < TIMELINE.length - 1 && (
                <span
                  style={{
                    flex: "0 0 24px",
                    height: 1,
                    background: timelineIndex(runState) > i ? C.green : C.border,
                    margin: "0 4px",
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {showProd && (
        <ProdConfirmModal
          baseUrl={cfg.base_url}
          onConfirm={() => doStart(true)}
          onCancel={() => setShowProd(false)}
        />
      )}
    </div>
  );
}

function timelineIndex(state) {
  const order = ["idle", "preparing", "running", "stopping", "cleanup", "analyzing", "done"];
  const idx = order.indexOf(String(state || "idle").toLowerCase());
  return idx < 0 ? 0 : idx;
}

function stateChip(state) {
  const s = String(state || "").toLowerCase();
  if (s === "running") return "info";
  if (s === "done") return "pass";
  if (s === "error" || s === "aborted" || s === "stopping") return "warn";
  return "neutral";
}
