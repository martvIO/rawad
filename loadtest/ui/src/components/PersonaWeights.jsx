import React from "react";
import { C, SP, input, label } from "../theme.js";

// Persona weight editor. Props:
//   weights: { GuestBrowser, InvitePoller, RsvpBuyer, LandingConfirmer }
//   onChange: (weights) => void
const PERSONAS = [
  { key: "GuestBrowser", color: C.blue },
  { key: "InvitePoller", color: C.gold },
  { key: "RsvpBuyer", color: C.green },
  { key: "LandingConfirmer", color: C.purple },
];

export default function PersonaWeights({ weights = {}, onChange }) {
  const total = PERSONAS.reduce(
    (sum, p) => sum + (Number(weights[p.key]) || 0),
    0
  );
  const valid = total > 0;

  const set = (key, raw) => {
    const v = raw === "" ? "" : Math.max(0, Number(raw));
    onChange({ ...weights, [key]: v });
  };

  return (
    <div>
      <div style={{ ...label, marginBottom: SP.sm }}>Persona Weights</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: SP.md,
        }}
      >
        {PERSONAS.map((p) => {
          const w = Number(weights[p.key]) || 0;
          const pct = valid ? Math.round((w / total) * 100) : 0;
          return (
            <div key={p.key}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 4,
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: p.color,
                    display: "inline-block",
                  }}
                />
                <span style={{ fontSize: 12, color: C.text }}>{p.key}</span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 12,
                    color: C.textDim,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {pct}%
                </span>
              </div>
              <input
                type="number"
                min={0}
                value={weights[p.key] ?? 0}
                onChange={(e) => set(p.key, e.target.value)}
                style={{ ...input, width: "100%" }}
              />
              <div
                style={{
                  marginTop: 4,
                  height: 4,
                  borderRadius: 2,
                  background: C.border,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: p.color,
                    transition: "width .15s ease",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {!valid && (
        <div style={{ marginTop: SP.sm, fontSize: 12, color: C.red }}>
          At least one persona weight must be greater than 0.
        </div>
      )}
    </div>
  );
}
