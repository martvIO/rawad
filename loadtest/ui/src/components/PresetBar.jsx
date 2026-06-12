import React, { useEffect, useState, useCallback } from "react";
import { C, SP, card, button, input } from "../theme.js";
import { getPresets, putPreset, deletePreset } from "../api.js";

// Preset management. Presets are full-or-partial RunConfig objects and NEVER
// contain credentials.
// Props:
//   currentConfig: the live config (used for "Save as…")
//   onLoad: (presetConfig) => void   merge a preset into the live config
export default function PresetBar({ currentConfig, onLoad }) {
  const [presets, setPresets] = useState([]);
  const [selected, setSelected] = useState("");
  const [newName, setNewName] = useState("");
  const [status, setStatus] = useState(null);

  const refresh = useCallback(() => {
    getPresets()
      .then((list) => setPresets(Array.isArray(list) ? list : []))
      .catch((e) => setStatus({ kind: "err", msg: e.message }));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loadSelected = () => {
    const p = presets.find((x) => x.name === selected);
    if (p && onLoad) {
      onLoad(p.config || {});
      setStatus({ kind: "ok", msg: `Loaded "${p.name}"` });
    }
  };

  const saveAs = async () => {
    const name = newName.trim();
    if (!name) {
      setStatus({ kind: "err", msg: "Enter a preset name" });
      return;
    }
    try {
      // Strip credentials defensively (config shouldn't carry them anyway).
      const clean = { ...currentConfig };
      delete clean.admin_user;
      delete clean.admin_pass;
      delete clean.groom_user;
      delete clean.groom_pass;
      await putPreset(name, clean);
      setNewName("");
      setStatus({ kind: "ok", msg: `Saved preset "${name}"` });
      refresh();
    } catch (e) {
      setStatus({ kind: "err", msg: e.message });
    }
  };

  const remove = async () => {
    if (!selected) return;
    try {
      await deletePreset(selected);
      setStatus({ kind: "ok", msg: `Deleted "${selected}"` });
      setSelected("");
      refresh();
    } catch (e) {
      setStatus({ kind: "err", msg: e.message });
    }
  };

  return (
    <div style={card}>
      <h3 style={{ margin: `0 0 ${SP.md}px`, fontSize: 15 }}>Presets</h3>
      <div style={{ fontSize: 11, color: C.textFaint, marginBottom: SP.md }}>
        Presets never store credentials.
      </div>

      <div style={{ display: "flex", gap: SP.sm, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          style={{ ...input, minWidth: 160 }}
        >
          <option value="">— select preset —</option>
          {presets.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={loadSelected}
          disabled={!selected}
          style={button("blue")}
        >
          Load
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={!selected}
          style={button("danger")}
        >
          Delete
        </button>

        <span style={{ width: 1, height: 22, background: C.border, margin: `0 ${SP.xs}px` }} />

        <input
          placeholder="New preset name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={{ ...input, minWidth: 150 }}
        />
        <button type="button" onClick={saveAs} style={button("primary")}>
          Save as…
        </button>
      </div>

      {status && (
        <div
          style={{
            marginTop: SP.sm,
            fontSize: 12,
            color: status.kind === "ok" ? C.green : C.red,
          }}
        >
          {status.msg}
        </div>
      )}
    </div>
  );
}
