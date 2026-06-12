import React from "react";
import { C, SP, card } from "../theme.js";

// Live per-endpoint table fed by the latest stats snapshot.
// Props:
//   endpoints: [{ name, method, rps, p95, failures }]
export default function EndpointTable({ endpoints = [] }) {
  const th = {
    textAlign: "left",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: C.textDim,
    padding: "6px 8px",
    borderBottom: `1px solid ${C.border}`,
    position: "sticky",
    top: 0,
    background: C.panel,
  };
  const td = {
    padding: "5px 8px",
    fontSize: 13,
    borderBottom: `1px solid ${C.border}`,
    fontVariantNumeric: "tabular-nums",
  };
  const num = { ...td, textAlign: "right" };

  return (
    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: `${SP.md}px ${SP.lg}px`, borderBottom: `1px solid ${C.border}` }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Endpoints (live)</h3>
      </div>
      <div style={{ maxHeight: 340, overflow: "auto" }}>
        <table style={{ width: "100%" }}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={{ ...th, width: 70 }}>Method</th>
              <th style={{ ...th, textAlign: "right", width: 80 }}>RPS</th>
              <th style={{ ...th, textAlign: "right", width: 90 }}>p95 (ms)</th>
              <th style={{ ...th, textAlign: "right", width: 90 }}>Failures</th>
            </tr>
          </thead>
          <tbody>
            {endpoints.length === 0 && (
              <tr>
                <td colSpan={5} style={{ ...td, color: C.textFaint, padding: SP.lg }}>
                  No endpoint data yet.
                </td>
              </tr>
            )}
            {endpoints.map((e, i) => (
              <tr key={`${e.method}-${e.name}-${i}`}>
                <td style={{ ...td, color: C.text, wordBreak: "break-all" }}>{e.name}</td>
                <td style={{ ...td, color: C.textDim }}>{e.method}</td>
                <td style={num}>{fmt(e.rps)}</td>
                <td style={{ ...num, color: p95Color(e.p95) }}>{fmt(e.p95)}</td>
                <td style={{ ...num, color: e.failures > 0 ? C.red : C.textDim }}>
                  {e.failures ?? 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function fmt(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return typeof n === "number" ? Math.round(n * 10) / 10 : n;
}

function p95Color(v) {
  if (v == null) return C.textDim;
  if (v >= 2000) return C.red;
  if (v >= 1000) return C.orange;
  return C.text;
}
