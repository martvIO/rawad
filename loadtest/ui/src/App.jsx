import React, { useEffect, useState, useCallback } from "react";
import { C, SP, chip, FONT } from "./theme.js";
import { useEventSource, getRunStatus, getLatestResults, getConfig } from "./api.js";
import ConfigForm from "./components/ConfigForm.jsx";
import RunControls from "./components/RunControls.jsx";
import LiveCharts from "./components/LiveCharts.jsx";
import EndpointTable from "./components/EndpointTable.jsx";
import VerdictPanel from "./components/VerdictPanel.jsx";
import CleanupReportPanel from "./components/CleanupReportPanel.jsx";
import HistoryList from "./components/HistoryList.jsx";

// Top-level shell: Configure | Run | History tabs. Holds the shared run config
// (lifted from ConfigForm) and subscribes once to the SSE run stream so the
// header badge + Run tab stay live.
const TABS = ["Configure", "Run", "History"];

export default function App() {
  const [tab, setTab] = useState("Run");
  const [config, setConfig] = useState(null);
  const [resetKey, setResetKey] = useState(0);

  // Single SSE subscription, shared across the app.
  const { state, lastStats, stats, cleanup, done, connected } = useEventSource(
    "/api/run/stream",
    resetKey
  );

  const [status, setStatus] = useState(null); // last /api/run/status snapshot
  const [results, setResults] = useState(null); // last /api/results/latest

  // Seed config + status once on mount. Loading config here (not only in
  // ConfigForm, which mounts on the Configure tab) means the Run tab knows the
  // target host immediately — so the Start button shows the right localhost vs
  // production styling even before the user visits Configure.
  useEffect(() => {
    getConfig().then(setConfig).catch(() => {});
    getRunStatus().then(setStatus).catch(() => {});
    getLatestResults().then(setResults).catch(() => {});
  }, []);

  // Effective run state prefers the live SSE "state" event, then polled status.
  const runState =
    (state && state.state) || (status && status.state) || "idle";
  const userCount =
    (lastStats && lastStats.user_count) ??
    (state && state.user_count) ??
    (status && status.locust && status.locust.user_count) ??
    null;
  const cleanupReport =
    cleanup || (status && status.cleanup_report) || [];

  // When a run reaches a terminal state, refresh status + results.
  useEffect(() => {
    if (!done && runState !== "done" && runState !== "error") return;
    getRunStatus().then(setStatus).catch(() => {});
    getLatestResults().then(setResults).catch(() => {});
  }, [done, runState]);

  const onStarted = useCallback(() => {
    setResetKey((k) => k + 1);
    setResults(null);
    setStatus(null);
    getRunStatus().then(setStatus).catch(() => {});
  }, []);

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <Header
        tab={tab}
        setTab={setTab}
        runState={runState}
        connected={connected}
      />

      <main
        style={{
          flex: 1,
          width: "100%",
          maxWidth: 1100,
          margin: "0 auto",
          padding: `${SP.xl}px ${SP.lg}px ${SP.xxl}px`,
        }}
      >
        {tab === "Configure" && (
          <ConfigForm config={config} onConfigChange={setConfig} />
        )}

        {tab === "Run" && (
          <div style={{ display: "flex", flexDirection: "column", gap: SP.lg }}>
            <RunControls
              config={config}
              runState={runState}
              userCount={userCount}
              onStarted={onStarted}
            />
            <LiveCharts stats={stats} p95Slo={(config && config.p95_ms) || 1000} />
            <EndpointTable endpoints={(lastStats && lastStats.endpoints) || []} />
            <CleanupReportPanel report={cleanupReport} onRetried={() => {
              getRunStatus().then(setStatus).catch(() => {});
            }} />
            <VerdictPanel
              results={results}
              onArchived={() => getLatestResults().then(setResults).catch(() => {})}
            />
          </div>
        )}

        {tab === "History" && <HistoryList />}
      </main>
    </div>
  );
}

function Header({ tab, setTab, runState, connected }) {
  return (
    <header
      style={{
        borderBottom: `1px solid ${C.border}`,
        background: C.panel,
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: `${SP.md}px ${SP.lg}px`,
          display: "flex",
          alignItems: "center",
          gap: SP.lg,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: SP.sm }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: C.gold }}>Dawa</span>
          <span style={{ fontSize: 13, color: C.textDim }}>Load-test control</span>
        </div>

        <nav style={{ display: "flex", gap: SP.xs, marginLeft: SP.lg }}>
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? C.panelAlt : "transparent",
                border: `1px solid ${tab === t ? C.border : "transparent"}`,
                color: tab === t ? C.text : C.textDim,
                borderRadius: 6,
                padding: "6px 14px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: FONT.sans,
              }}
            >
              {t}
            </button>
          ))}
        </nav>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: SP.md }}>
          <span
            title={connected ? "Live stream connected" : "Reconnecting…"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              color: C.textFaint,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: connected ? C.green : C.orange,
              }}
            />
            {connected ? "live" : "offline"}
          </span>
          <span style={chip(stateChip(runState))}>{runState}</span>
        </div>
      </div>
    </header>
  );
}

function stateChip(state) {
  const s = String(state || "").toLowerCase();
  if (s === "running") return "info";
  if (s === "done") return "pass";
  if (s === "error") return "fail";
  if (s === "stopping" || s === "cleanup" || s === "analyzing" || s === "preparing")
    return "warn";
  return "neutral";
}
