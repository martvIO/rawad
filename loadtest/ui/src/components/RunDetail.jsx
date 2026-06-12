import React, { useEffect, useState } from "react";
import { C, SP, card, chip } from "../theme.js";
import { getHistoryItem } from "../api.js";

// Detail view for one archived run.
// Props:
//   id: run id
//   onBack: () => void
const PNGS = [
  ["1_latency_vs_users.png", "Latency vs users"],
  ["2_throughput_over_time.png", "Throughput over time"],
  ["3_errors.png", "Errors"],
  ["4_endpoint_latency.png", "Endpoint latency"],
];

export default function RunDetail({ id, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    setError(null);
    getHistoryItem(id)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div style={{ ...card, color: C.red }}>{error}</div>;
  if (!data) return <div style={{ ...card, color: C.textDim }}>Loading run {id}…</div>;

  const meta = data.meta || data;
  const verdict = data.verdict || meta.verdict || {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.lg }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.md }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            background: "transparent",
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            color: C.textDim,
            padding: "6px 12px",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          ← Back
        </button>
        <h2 style={{ margin: 0, fontSize: 18 }}>{meta.id || id}</h2>
        {verdict.slo_pass != null && (
          <span style={chip(verdict.slo_pass ? "pass" : "fail")}>
            SLO {verdict.slo_pass ? "PASS" : "FAIL"}
          </span>
        )}
        {meta.aborted && <span style={chip("warn")}>aborted</span>}
      </div>

      {/* Meta */}
      <div style={card}>
        <h3 style={{ margin: `0 0 ${SP.md}px`, fontSize: 15 }}>Run metadata</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: SP.md }}>
          <Field label="Timestamp" value={meta.timestamp || meta.started_at || meta.archived_at} />
          <Field label="Target" value={meta.target || meta.base_url || meta.config?.base_url} />
          <Field label="Max users" value={meta.max_users ?? verdict.healthy_max_users} />
          <Field label="Healthy max users" value={verdict.healthy_max_users} />
          <Field label="Degrade at" value={verdict.degrade_at} />
        </div>
      </div>

      {/* Stage table */}
      {Array.isArray(verdict.stages) && verdict.stages.length > 0 && (
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: `${SP.md}px ${SP.lg}px`, borderBottom: `1px solid ${C.border}` }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>Per-stage results</h3>
          </div>
          <table style={{ width: "100%" }}>
            <thead>
              <tr>
                {["Users", "RPS", "p95 (ms)", "Error rate", "Health"].map((h) => (
                  <th key={h} style={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {verdict.stages.map((s, i) => (
                <tr key={i}>
                  <td style={td}>{s.users}</td>
                  <td style={tdNum}>{round(s.rps)}</td>
                  <td style={tdNum}>{round(s.p95)}</td>
                  <td style={tdNum}>{fmtPct(s.error_rate)}</td>
                  <td style={td}>
                    <span style={chip(s.healthy ? "pass" : "fail")}>
                      {s.healthy ? "healthy" : "degraded"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Archived PNGs */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: SP.md }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Charts</h3>
          <a href={`/artifacts/runs/${id}/report.html`} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
            Open report.html ↗
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
                src={`/artifacts/runs/${id}/${file}`}
                alt={title}
                style={{ width: "100%", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff" }}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              <figcaption style={{ fontSize: 12, color: C.textDim, marginTop: 4 }}>{title}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: C.textDim }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: C.text, marginTop: 2, wordBreak: "break-all" }}>
        {value == null || value === "" ? "—" : String(value)}
      </div>
    </div>
  );
}

const th = {
  textAlign: "left",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: C.textDim,
  padding: "8px 12px",
  borderBottom: `1px solid ${C.border}`,
};
const td = { padding: "7px 12px", fontSize: 13, borderBottom: `1px solid ${C.border}`, color: C.text };
const tdNum = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };

function round(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Math.round(Number(n) * 10) / 10;
}
function fmtPct(v) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return `${(Number(v) * 100).toFixed(2)}%`;
}
