import React, { useEffect, useState, useCallback } from "react";
import { C, SP, card, button, input, label, chip } from "../theme.js";
import { getConfig, putConfig, isLocalhost, hostnameOf } from "../api.js";
import RampStageEditor from "./RampStageEditor.jsx";
import PersonaWeights from "./PersonaWeights.jsx";
import CredentialsPanel from "./CredentialsPanel.jsx";
import PresetBar from "./PresetBar.jsx";

// Full run-configuration form. Holds the live config state and lifts it up via
// onConfigChange so the Run tab can start a run with the current config.
// Props:
//   config, onConfigChange  (controlled from App so Run tab shares it)
const DEFAULT_CONFIG = {
  base_url: "http://localhost:8080",
  ramp_stages: [[5, 15, 5]],
  persona_weights: {
    GuestBrowser: 60,
    InvitePoller: 20,
    RsvpBuyer: 15,
    LandingConfirmer: 5,
  },
  think_min: 1.0,
  think_max: 5.0,
  enable_writes: true,
  allow_approve_design: true,
  fallback_token: "00000000000000000000000000000000",
  fallback_groom_username: "groom",
  p95_ms: 1000,
  error_rate_max: 0.01,
};

export default function ConfigForm({ config, onConfigChange }) {
  const [saveState, setSaveState] = useState(null); // {kind,msg}
  const [loaded, setLoaded] = useState(false);

  // Load server config once on mount.
  useEffect(() => {
    getConfig()
      .then((c) => {
        onConfigChange({ ...DEFAULT_CONFIG, ...(c || {}) });
        setLoaded(true);
      })
      .catch(() => {
        onConfigChange(DEFAULT_CONFIG);
        setLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback(
    (patch) => onConfigChange({ ...config, ...patch }),
    [config, onConfigChange]
  );

  const cfg = config || DEFAULT_CONFIG;
  const local = isLocalhost(cfg.base_url);

  const save = async () => {
    setSaveState(null);
    try {
      const saved = await putConfig(cfg);
      // server may echo merged config
      if (saved && typeof saved === "object") onConfigChange({ ...cfg, ...saved });
      setSaveState({ kind: "ok", msg: "Config saved" });
    } catch (e) {
      setSaveState({ kind: "err", msg: e.message });
    }
  };

  const loadPreset = (presetConfig) => {
    // Merge preset (full or partial) over current config.
    onConfigChange({ ...cfg, ...presetConfig });
  };

  if (!loaded) {
    return <div style={{ color: C.textDim, padding: SP.xl }}>Loading config…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.lg }}>
      {/* Target host */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: SP.md }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Target</h3>
          <span style={chip(local ? "info" : "fail")}>
            {local ? "localhost" : "PRODUCTION"} · {hostnameOf(cfg.base_url)}
          </span>
        </div>
        <label style={label}>Base URL</label>
        <input
          value={cfg.base_url}
          onChange={(e) => update({ base_url: e.target.value })}
          style={{ ...input, width: "100%" }}
          placeholder="http://localhost:8080"
        />
        {!local && (
          <div style={{ marginTop: SP.sm, fontSize: 12, color: C.red }}>
            Non-localhost target — running will require typing the hostname to confirm.
          </div>
        )}
      </div>

      {/* Ramp + personas */}
      <div style={card}>
        <RampStageEditor
          stages={cfg.ramp_stages || []}
          onChange={(ramp_stages) => update({ ramp_stages })}
        />
      </div>

      <div style={card}>
        <PersonaWeights
          weights={cfg.persona_weights || {}}
          onChange={(persona_weights) => update({ persona_weights })}
        />
      </div>

      {/* Think time + toggles */}
      <div style={card}>
        <h3 style={{ margin: `0 0 ${SP.md}px`, fontSize: 15 }}>Behaviour</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: SP.md }}>
          <div>
            <label style={label}>Think min (s)</label>
            <input
              type="number"
              step="0.1"
              min={0}
              value={cfg.think_min}
              onChange={(e) => update({ think_min: Number(e.target.value) })}
              style={{ ...input, width: "100%" }}
            />
          </div>
          <div>
            <label style={label}>Think max (s)</label>
            <input
              type="number"
              step="0.1"
              min={0}
              value={cfg.think_max}
              onChange={(e) => update({ think_max: Number(e.target.value) })}
              style={{ ...input, width: "100%" }}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: SP.xl, marginTop: SP.md, flexWrap: "wrap" }}>
          <Toggle
            label="Enable writes"
            checked={!!cfg.enable_writes}
            onChange={(v) => update({ enable_writes: v })}
          />
          <Toggle
            label="Allow approve design"
            checked={!!cfg.allow_approve_design}
            onChange={(v) => update({ allow_approve_design: v })}
          />
        </div>
        {cfg.think_max < cfg.think_min && (
          <div style={{ marginTop: SP.sm, fontSize: 12, color: C.red }}>
            Think max must be ≥ think min.
          </div>
        )}
      </div>

      {/* SLO */}
      <div style={card}>
        <h3 style={{ margin: `0 0 ${SP.md}px`, fontSize: 15 }}>Service-Level Objectives</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: SP.md }}>
          <div>
            <label style={label}>p95 latency (ms)</label>
            <input
              type="number"
              min={1}
              value={cfg.p95_ms}
              onChange={(e) => update({ p95_ms: Number(e.target.value) })}
              style={{ ...input, width: "100%" }}
            />
          </div>
          <div>
            <label style={label}>Max error rate (0–1)</label>
            <input
              type="number"
              step="0.001"
              min={0}
              max={1}
              value={cfg.error_rate_max}
              onChange={(e) => update({ error_rate_max: Number(e.target.value) })}
              style={{ ...input, width: "100%" }}
            />
            <div style={{ fontSize: 11, color: C.textFaint, marginTop: 2 }}>
              {(Number(cfg.error_rate_max || 0) * 100).toFixed(2)}%
            </div>
          </div>
        </div>
      </div>

      {/* Fallbacks */}
      <div style={card}>
        <h3 style={{ margin: `0 0 ${SP.md}px`, fontSize: 15 }}>Fallbacks</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: SP.md }}>
          <div>
            <label style={label}>Fallback token</label>
            <input
              value={cfg.fallback_token}
              onChange={(e) => update({ fallback_token: e.target.value })}
              style={{ ...input, width: "100%", fontFamily: "monospace" }}
            />
          </div>
          <div>
            <label style={label}>Fallback groom username</label>
            <input
              value={cfg.fallback_groom_username}
              onChange={(e) => update({ fallback_groom_username: e.target.value })}
              style={{ ...input, width: "100%" }}
            />
          </div>
        </div>
      </div>

      {/* Save */}
      <div style={{ display: "flex", gap: SP.md, alignItems: "center" }}>
        <button type="button" onClick={save} style={button("primary")}>
          Save config
        </button>
        {saveState && (
          <span style={{ fontSize: 13, color: saveState.kind === "ok" ? C.green : C.red }}>
            {saveState.msg}
          </span>
        )}
      </div>

      <PresetBar currentConfig={cfg} onLoad={loadPreset} />
      <CredentialsPanel />
    </div>
  );
}

function Toggle({ label: text, checked, onChange }) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
        fontSize: 13,
        color: C.text,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 16, height: 16, accentColor: C.gold }}
      />
      {text}
    </label>
  );
}
