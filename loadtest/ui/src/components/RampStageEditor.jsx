import React from "react";
import { C, SP, button, input, label } from "../theme.js";

// Editable ramp-stage table. Each stage = [users, hold_seconds, spawn_rate].
// Props:
//   stages: number[][]
//   onChange: (stages) => void
const COLS = [
  { key: 0, name: "Users", min: 1 },
  { key: 1, name: "Hold (s)", min: 1 },
  { key: 2, name: "Spawn /s", min: 1 },
];

export default function RampStageEditor({ stages = [], onChange }) {
  const setCell = (rowIdx, colIdx, raw) => {
    const v = raw === "" ? "" : Number(raw);
    const next = stages.map((row, i) =>
      i === rowIdx ? row.map((c, j) => (j === colIdx ? v : c)) : row
    );
    onChange(next);
  };

  const addRow = () => {
    const last = stages[stages.length - 1] || [10, 60, 10];
    onChange(stages.concat([[...last]]));
  };

  const removeRow = (idx) => onChange(stages.filter((_, i) => i !== idx));

  const move = (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= stages.length) return;
    const next = stages.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };

  const loadSmoke = () => onChange([[5, 15, 5]]);

  const totalDuration = stages.reduce(
    (sum, s) => sum + (Number(s[1]) || 0),
    0
  );
  const fmt = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m ? `${m}m ${s}s` : `${s}s`;
  };
  const peakUsers = stages.reduce(
    (m, s) => Math.max(m, Number(s[0]) || 0),
    0
  );

  const th = {
    textAlign: "left",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: C.textDim,
    padding: "4px 6px",
    fontWeight: 600,
  };
  const td = { padding: "3px 6px" };

  return (
    <div>
      <div style={{ ...label, marginBottom: SP.sm }}>Ramp Stages</div>
      <table style={{ width: "100%" }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 28 }}>#</th>
            {COLS.map((c) => (
              <th key={c.key} style={th}>
                {c.name}
              </th>
            ))}
            <th style={{ ...th, width: 110 }}></th>
          </tr>
        </thead>
        <tbody>
          {stages.map((row, ri) => (
            <tr key={ri}>
              <td style={{ ...td, color: C.textFaint, fontSize: 12 }}>{ri + 1}</td>
              {COLS.map((c) => (
                <td key={c.key} style={td}>
                  <input
                    type="number"
                    min={c.min}
                    value={row[c.key]}
                    onChange={(e) => setCell(ri, c.key, e.target.value)}
                    style={{ ...input, width: "100%" }}
                  />
                </td>
              ))}
              <td style={{ ...td, whiteSpace: "nowrap" }}>
                <button
                  type="button"
                  title="Move up"
                  onClick={() => move(ri, -1)}
                  disabled={ri === 0}
                  style={iconBtn(ri === 0)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  title="Move down"
                  onClick={() => move(ri, 1)}
                  disabled={ri === stages.length - 1}
                  style={iconBtn(ri === stages.length - 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  title="Remove"
                  onClick={() => removeRow(ri)}
                  disabled={stages.length <= 1}
                  style={iconBtn(stages.length <= 1, C.red)}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
          {stages.length === 0 && (
            <tr>
              <td colSpan={5} style={{ ...td, color: C.textFaint, padding: SP.md }}>
                No stages. Add one or load the smoke stage.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div style={{ display: "flex", gap: SP.sm, marginTop: SP.md, flexWrap: "wrap" }}>
        <button type="button" onClick={addRow} style={button()}>
          + Add stage
        </button>
        <button type="button" onClick={loadSmoke} style={button("ghost")}>
          Load smoke stage
        </button>
        <div
          style={{
            marginLeft: "auto",
            alignSelf: "center",
            fontSize: 12,
            color: C.textDim,
          }}
        >
          Total duration <strong style={{ color: C.text }}>{fmt(totalDuration)}</strong>
          {" · "}peak <strong style={{ color: C.text }}>{peakUsers}</strong> users
        </div>
      </div>
    </div>
  );
}

function iconBtn(disabled, color) {
  return {
    background: "transparent",
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    color: disabled ? C.textFaint : color || C.textDim,
    cursor: disabled ? "not-allowed" : "pointer",
    width: 26,
    height: 26,
    marginRight: 4,
    fontSize: 12,
    opacity: disabled ? 0.4 : 1,
  };
}
