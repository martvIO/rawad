import React, { useState } from "react";
import { C, SP, button, input } from "../theme.js";
import { hostnameOf } from "../api.js";

// Shown when POST /api/run returns 428 (production_confirmation_required).
// The user must type the target hostname to enable Confirm, which resubmits
// the run with confirm_production = true.
// Props:
//   baseUrl: string (the target base_url)
//   onConfirm: () => void
//   onCancel: () => void
export default function ProdConfirmModal({ baseUrl, onConfirm, onCancel }) {
  const [typed, setTyped] = useState("");
  const host = hostnameOf(baseUrl);
  const match = typed.trim() === host;

  return (
    <div style={overlay} onClick={onCancel}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: SP.sm, marginBottom: SP.md }}>
          <span style={{ fontSize: 22 }}>⚠️</span>
          <h3 style={{ margin: 0, fontSize: 17, color: C.red }}>
            Non-local target
          </h3>
        </div>

        <p style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>
          You are about to run a load test against a non-localhost target:
        </p>
        <div
          style={{
            background: C.bg,
            border: `1px solid ${C.red}`,
            borderRadius: 6,
            padding: "8px 12px",
            fontFamily: "monospace",
            color: C.goldLight,
            wordBreak: "break-all",
            marginBottom: SP.md,
          }}
        >
          {baseUrl}
        </div>

        <p style={{ fontSize: 13, color: C.textDim }}>
          To confirm, type the hostname{" "}
          <code style={{ color: C.gold }}>{host}</code> below:
        </p>
        <input
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={host}
          style={{ ...input, width: "100%", marginBottom: SP.lg }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: SP.sm }}>
          <button type="button" onClick={onCancel} style={button("ghost")}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!match}
            style={{ ...button("danger"), opacity: match ? 1 : 0.4, cursor: match ? "pointer" : "not-allowed" }}
          >
            Confirm &amp; run against production
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};

const modal = {
  background: C.panel,
  border: `1px solid ${C.red}`,
  borderRadius: 12,
  padding: SP.xl,
  width: 460,
  maxWidth: "90vw",
  boxShadow: "0 20px 60px rgba(0,0,0,.5)",
};
