import React, { useState } from "react";
import { C, SP, card, button, chip } from "../theme.js";
import { archiveRun } from "../api.js";

// Renders the latest verdict from GET /api/results/latest. Single-run charts
// use the CLI-generated PNGs (parity, no duplicated charting).
// Props:
//   results: { verdict, artifacts, archived }
//   onArchived: (id) => void
const PNGS = [
  ["1_latency_vs_users.png", "Latency vs users"],
  ["2_throughput_over_time.png", "Throughput over time"],
  ["3_errors.png", "Errors"],
  ["4_endpoint_latency.png", "Endpoint latency"],
];

export default function VerdictPanel({ results, onArchived }) {
  const [archiving, setArchiving] = useState(false);
  const [status, setStatus] = useState(null);

  const verdict = results?.verdict;

  const archive = async () => {
    setArchiving(true);
    setStatus(null);
    try {
      const res = await archiveRun();
      setStatus({ kind: "ok", msg: `Archived as ${res?.id ?? "run"}` });
      if (onArchived) onArchived(res?.id);
    } catch (e) {
      setStatus({ kind: "err", msg: e.message });
    } finally {
      setArchiving(false);
    }
  };

  if (!verdict) {
    return (
      <div style={{ ...card, color: C.textFaint }}>
        No verdict yet. Run a test to generate results.
      </div>
    );
  }

  const slo = verdict.slo || {};
  const stages = verdict.stages || [];
  const slowest = verdict.slowest_endpoints || [];
  const rl = verdict.rate_limited_429 || {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.lg }}>
      {/* Header / SLO verdict */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: SP.md, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Verdict</h3>
          <span style={chip(verdict.slo_pass ? "pass" : "fail")}>
            SLO {verdict.slo_pass ? "PASS" : "FAIL"}
          </span>
          {results?.archived && <span style={chip("info")}>archived</span>}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: SP.md }}>
            {status && (
              <span style={{ fontSize: 12, color: status.kind === "ok" ? C.green : C.red }}>
                {status.msg}
              </span>
            )}
            <button type="button" onClick={archive} disabled={archiving} style={button("primary")}>
              {archiving ? "Archiving…" : "Archive this run"}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: SP.xl, marginTop: SP.md, flexWrap: "wrap" }}>
          <Metric label="p95 SLO" value={`${slo.p95_ms ?? "—"} ms`} />
          <Metric label="Max error rate" value={fmtPct(slo.error_rate_max)} />
          <Metric
            label="Healthy max users"
            value={verdict.healthy_max_users ?? "—"}
            color={C.green}
          />
          <Metric
            label="Degrade at"
            value={verdict.degrade_at ?? "—"}
            color={verdict.degrade_at != null ? C.orange : C.textDim}
          />
          <Metric
            label="429 rate-limited"
            value={`${rl.count ?? 0} (${fmtPct((rl.pct ?? 0) / 100)})`}
          />
        </div>
      </div>

      {/* Stage table */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: `${SP.md}px ${SP.lg}px`, borderBottom: `1px solid ${C.border}` }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Per-stage results</h3>
        </div>
        <div style={{ overflow: "auto" }}>
          <table style={{ width: "100%" }}>
            <thead>
              <tr>
                {["Users", "RPS", "p95 (ms)", "Error rate", "Health"].map((h) => (
                  <th key={h} style={thStyle}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stages.map((s, i) => (
                <tr key={i}>
                  <td style={tdStyle}>{s.users}</td>
                  <td style={tdNum}>{round(s.rps)}</td>
                  <td style={tdNum}>{round(s.p95)}</td>
                  <td style={tdNum}>{fmtPct(s.error_rate)}</td>
                  <td style={tdStyle}>
                    <span style={chip(s.healthy ? "pass" : "fail")}>
                      {s.healthy ? "healthy" : "degraded"}
                    </span>
                  </td>
                </tr>
              ))}
              {stages.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ ...tdStyle, color: C.textFaint }}>
                    No stage data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slowest endpoints */}
      {slowest.length > 0 && (
        <div style={card}>
          <h3 style={{ margin: `0 0 ${SP.md}px`, fontSize: 15 }}>Slowest endpoints</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: SP.xs }}>
            {slowest.map(([name, p95], i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: C.text, wordBreak: "break-all" }}>{name}</span>
                <span style={{ color: C.orange, fontVariantNumeric: "tabular-nums" }}>
                  {round(p95)} ms
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Genuine failures */}
      {Array.isArray(verdict.genuine_failures) && verdict.genuine_failures.length > 0 && (
        <div style={{ ...card, borderColor: C.red }}>
          <h3 style={{ margin: `0 0 ${SP.sm}px`, fontSize: 15, color: C.red }}>
            Genuine failures
          </h3>
          <pre style={{ margin: 0, fontSize: 12, color: C.textDim, whiteSpace: "pre-wrap" }}>
            {JSON.stringify(verdict.genuine_failures, null, 2)}
          </pre>
        </div>
      )}

      {/* PNG charts (CLI parity) */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: SP.md }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Charts</h3>
          <a href="/artifacts/latest/report.html" target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
            Open full report.html ↗
          </a>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: SP.md,
          }}
        >
          {PNGS.map(([file, title]) => (
            <figure key={file} style={{ margin: 0 }}>
              <img
                src={`/artifacts/latest/${file}`}
                alt={title}
                style={{
                  width: "100%",
                  borderRadius: 8,
                  border: `1px solid ${C.border}`,
                  background: "#fff",
                }}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  if (e.currentTarget.nextSibling)
                    e.currentTarget.nextSibling.style.display = "block";
                }}
              />
              <div style={{ display: "none", fontSize: 12, color: C.textFaint, padding: SP.sm }}>
                {title} — not available
              </div>
              <figcaption style={{ fontSize: 12, color: C.textDim, marginTop: 4 }}>
                {title}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: C.textDim }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || C.text, marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

const thStyle = {
  textAlign: "left",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: C.textDim,
  padding: "8px 12px",
  borderBottom: `1px solid ${C.border}`,
};
const tdStyle = { padding: "7px 12px", fontSize: 13, borderBottom: `1px solid ${C.border}`, color: C.text };
const tdNum = { ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" };

function round(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Math.round(Number(n) * 10) / 10;
}
function fmtPct(v) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return `${(Number(v) * 100).toFixed(2)}%`;
}
