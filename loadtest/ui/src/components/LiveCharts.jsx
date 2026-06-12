import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { C, SP, card } from "../theme.js";

// Live charts driven by accumulated "stats" snapshots from the SSE stream.
// Props:
//   stats: array of snapshots { ts, user_count, total_rps, fail_ratio, p50, p95, ... }
//   p95Slo: number (ms) — drawn as a ReferenceLine on the latency chart
export default function LiveCharts({ stats = [], p95Slo = 1000 }) {
  const data = useMemo(() => {
    if (!stats.length) return [];
    const t0 = Number(stats[0].ts) || 0;
    return stats.map((s) => {
      const t = Number(s.ts) || 0;
      return {
        // seconds since start
        t: t0 ? Math.round(t - t0) : 0,
        users: num(s.user_count),
        rps: num(s.total_rps),
        p50: num(s.p50),
        p95: num(s.p95),
        // fail_ratio is 0–1; show as %
        errPct: num(s.fail_ratio) * 100,
      };
    });
  }, [stats]);

  if (!data.length) {
    return (
      <div style={{ ...card, color: C.textFaint, textAlign: "center", padding: SP.xxl }}>
        Waiting for live metrics…
      </div>
    );
  }

  const axis = { stroke: C.textFaint, fontSize: 11 };
  const grid = C.border;
  const tooltipStyle = {
    background: C.panelAlt,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    color: C.text,
    fontSize: 12,
  };
  const xLabel = { value: "seconds", position: "insideBottom", offset: -4, fill: C.textFaint, fontSize: 11 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.lg }}>
      {/* RPS + users dual axis */}
      <Panel title="Throughput & concurrency">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 14, left: 0 }}>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={axis} label={xLabel} />
            <YAxis yAxisId="left" tick={axis} stroke={C.blue} />
            <YAxis yAxisId="right" orientation="right" tick={axis} stroke={C.gold} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="rps"
              name="RPS"
              stroke={C.blue}
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="users"
              name="Users"
              stroke={C.gold}
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      {/* p50 / p95 with SLO reference line */}
      <Panel title="Latency (p50 / p95)">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 14, left: 0 }}>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={axis} label={xLabel} />
            <YAxis tick={axis} stroke={C.textFaint} unit="ms" />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine
              y={p95Slo}
              stroke={C.red}
              strokeDasharray="6 4"
              label={{ value: `p95 SLO ${p95Slo}ms`, fill: C.red, fontSize: 11, position: "insideTopRight" }}
            />
            <Line
              type="monotone"
              dataKey="p50"
              name="p50"
              stroke={C.green}
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="p95"
              name="p95"
              stroke={C.orange}
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      {/* Error rate % */}
      <Panel title="Error rate">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 14, left: 0 }}>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={axis} label={xLabel} />
            <YAxis tick={axis} stroke={C.textFaint} unit="%" />
            <Tooltip contentStyle={tooltipStyle} />
            <Line
              type="monotone"
              dataKey="errPct"
              name="Error %"
              stroke={C.red}
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div style={card}>
      <h3 style={{ margin: `0 0 ${SP.sm}px`, fontSize: 14, color: C.textDim }}>{title}</h3>
      {children}
    </div>
  );
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
