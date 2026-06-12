import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { C, SP, card, chip } from "../theme.js";
import { getCompare } from "../api.js";

// Compare two runs by overlaying re-rendered timeseries (PNGs can't overlay).
// Run A = solid, Run B = dashed.
// Props:
//   a, b: run ids
//   onBack: () => void
export default function CompareView({ a, b, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    setError(null);
    getCompare(a, b)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [a, b]);

  if (error) return <div style={{ ...card, color: C.red }}>{error}</div>;
  if (!data) return <div style={{ ...card, color: C.textDim }}>Loading comparison…</div>;

  const runA = data.a || {};
  const runB = data.b || {};

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
        <h2 style={{ margin: 0, fontSize: 18 }}>Compare</h2>
        <span style={{ ...chip("info") }}>A: {idOf(runA, a)}</span>
        <span style={{ ...chip("warn") }}>B: {idOf(runB, b)}</span>
      </div>

      {/* Legend note */}
      <div style={{ fontSize: 12, color: C.textFaint }}>
        Run A is drawn solid, Run B dashed.
      </div>

      <CompareChart title="p95 vs time" xKey="t" xLabel="seconds" yKey="p95" unit="ms" a={runA} b={runB} />
      <CompareChart title="p95 vs users" xKey="users" xLabel="users" yKey="p95" unit="ms" a={runA} b={runB} />
      <CompareChart title="RPS vs time" xKey="t" xLabel="seconds" yKey="rps" a={runA} b={runB} />
      <CompareChart title="Error rate vs time" xKey="t" xLabel="seconds" yKey="errPct" unit="%" a={runA} b={runB} />

      {/* Side-by-side meta/verdict */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: `${SP.md}px ${SP.lg}px`, borderBottom: `1px solid ${C.border}` }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Side-by-side</h3>
        </div>
        <table style={{ width: "100%" }}>
          <thead>
            <tr>
              <th style={th}>Metric</th>
              <th style={{ ...th, color: C.blue }}>A · {idOf(runA, a)}</th>
              <th style={{ ...th, color: C.orange }}>B · {idOf(runB, b)}</th>
            </tr>
          </thead>
          <tbody>
            {metaRows(runA, runB).map((r) => (
              <tr key={r.label}>
                <td style={{ ...td, color: C.textDim }}>{r.label}</td>
                <td style={td}>{r.a}</td>
                <td style={td}>{r.b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompareChart({ title, xKey, xLabel, yKey, unit, a, b }) {
  const seriesA = normalize(a.timeseries);
  const seriesB = normalize(b.timeseries);

  // Merge into one dataset keyed by x value for overlay rendering.
  const merged = useMemo(() => {
    const map = new Map();
    for (const p of seriesA) {
      const k = p[xKey];
      map.set(k, { ...(map.get(k) || { [xKey]: k }), aVal: p[yKey] });
    }
    for (const p of seriesB) {
      const k = p[xKey];
      map.set(k, { ...(map.get(k) || { [xKey]: k }), bVal: p[yKey] });
    }
    return Array.from(map.values()).sort((p, q) => p[xKey] - q[xKey]);
  }, [seriesA, seriesB, xKey, yKey]);

  const axis = { stroke: C.textFaint, fontSize: 11 };
  const tooltipStyle = {
    background: C.panelAlt,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    color: C.text,
    fontSize: 12,
  };

  if (!merged.length) {
    return (
      <div style={{ ...card, color: C.textFaint }}>{title} — no timeseries data.</div>
    );
  }

  return (
    <div style={card}>
      <h3 style={{ margin: `0 0 ${SP.sm}px`, fontSize: 14, color: C.textDim }}>{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={merged} margin={{ top: 8, right: 16, bottom: 14, left: 0 }}>
          <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
          <XAxis
            dataKey={xKey}
            tick={axis}
            type="number"
            domain={["dataMin", "dataMax"]}
            label={{ value: xLabel, position: "insideBottom", offset: -4, fill: C.textFaint, fontSize: 11 }}
          />
          <YAxis tick={axis} stroke={C.textFaint} unit={unit || ""} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="aVal"
            name="A"
            stroke={C.blue}
            dot={false}
            strokeWidth={2}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="bVal"
            name="B"
            stroke={C.orange}
            strokeDasharray="6 4"
            dot={false}
            strokeWidth={2}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Normalize the /timeseries rows to a consistent shape with t (seconds from
// start), users, rps, p95, errPct.
function normalize(ts) {
  if (!Array.isArray(ts) || !ts.length) return [];
  const t0 = Number(ts[0].t) || 0;
  return ts.map((p) => ({
    t: Math.round((Number(p.t) || 0) - t0),
    users: num(p.users),
    rps: num(p.rps),
    p50: num(p.p50),
    p95: num(p.p95),
    p99: num(p.p99),
    errPct: num(p.fail_rate) * (p.fail_rate > 1 ? 1 : 100),
  }));
}

function metaRows(a, b) {
  const ma = a.meta || {};
  const mb = b.meta || {};
  const va = ma.verdict || a.verdict || {};
  const vb = mb.verdict || b.verdict || {};
  const fmtBool = (v) => (v == null ? "—" : v ? "PASS" : "FAIL");
  return [
    { label: "Timestamp", a: ma.timestamp || ma.started_at || "—", b: mb.timestamp || mb.started_at || "—" },
    { label: "Target", a: ma.target || ma.base_url || "—", b: mb.target || mb.base_url || "—" },
    { label: "Max users", a: ma.max_users ?? va.healthy_max_users ?? "—", b: mb.max_users ?? vb.healthy_max_users ?? "—" },
    { label: "SLO", a: fmtBool(va.slo_pass), b: fmtBool(vb.slo_pass) },
    { label: "Healthy max users", a: va.healthy_max_users ?? "—", b: vb.healthy_max_users ?? "—" },
    { label: "Degrade at", a: va.degrade_at ?? "—", b: vb.degrade_at ?? "—" },
    { label: "Aborted", a: ma.aborted ? "yes" : "no", b: mb.aborted ? "yes" : "no" },
  ];
}

function idOf(run, fallback) {
  return run?.meta?.id || run?.id || fallback;
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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
