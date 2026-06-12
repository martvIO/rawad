import React, { useState } from "react";
import { C, SP, card, button, chip } from "../theme.js";
import { retryCleanup } from "../api.js";

// Renders the cleanup report rows and offers a retry for failed steps.
// Props:
//   report: [{ step, ok, deleted, error, hint }]
//   onRetried: (result) => void   (optional callback after retry)
export default function CleanupReportPanel({ report, onRetried }) {
  const [retrying, setRetrying] = useState(false);
  const [status, setStatus] = useState(null);

  const rows = Array.isArray(report) ? report : report?.steps || [];
  const hasFailures = rows.some((r) => !r.ok);

  const retry = async () => {
    setRetrying(true);
    setStatus(null);
    try {
      const res = await retryCleanup();
      setStatus({ kind: "ok", msg: "Retry complete" });
      if (onRetried) onRetried(res);
    } catch (e) {
      setStatus({ kind: "err", msg: e.message });
    } finally {
      setRetrying(false);
    }
  };

  if (!rows.length) {
    return (
      <div style={{ ...card, color: C.textFaint }}>
        No cleanup report yet. Data cleanup runs automatically after a run.
      </div>
    );
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: SP.md }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Cleanup Report</h3>
        <span style={chip(hasFailures ? "fail" : "pass")}>
          {hasFailures ? "Action needed" : "All clean"}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: SP.sm }}>
        {rows.map((r, i) => (
          <div
            key={r.step || i}
            style={{
              border: `1px solid ${r.ok ? C.green : C.red}`,
              background: r.ok ? C.greenGlow : C.redGlow,
              borderRadius: 8,
              padding: `${SP.sm}px ${SP.md}px`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: SP.sm }}>
              <span style={{ color: r.ok ? C.green : C.red, fontWeight: 700 }}>
                {r.ok ? "✓" : "✕"}
              </span>
              <strong style={{ fontSize: 13, color: C.text }}>{r.step}</strong>
              {r.deleted != null && (
                <span style={{ marginLeft: "auto", fontSize: 12, color: C.textDim }}>
                  deleted {renderDeleted(r.deleted)}
                </span>
              )}
            </div>
            {!r.ok && r.error && (
              <div style={{ marginTop: 4, fontSize: 12, color: C.red }}>
                {r.error}
              </div>
            )}
            {!r.ok && r.hint && (
              <div style={{ marginTop: 2, fontSize: 12, color: C.textDim }}>
                Hint: {r.hint}
              </div>
            )}
          </div>
        ))}
      </div>

      {hasFailures && (
        <div style={{ display: "flex", alignItems: "center", gap: SP.md, marginTop: SP.md }}>
          <button type="button" onClick={retry} disabled={retrying} style={button("danger")}>
            {retrying ? "Retrying…" : "Retry cleanup"}
          </button>
          {status && (
            <span style={{ fontSize: 12, color: status.kind === "ok" ? C.green : C.red }}>
              {status.msg}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function renderDeleted(d) {
  if (d == null) return "—";
  if (typeof d === "number") return String(d);
  if (typeof d === "object") {
    return Object.entries(d)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
  }
  return String(d);
}
