import React, { useEffect, useState } from "react";
import { C, SP, card, button, input, label } from "../theme.js";
import { getCredentials, putCredentials } from "../api.js";

// Admin + groom credentials. Stored server-side in loadtest/.env (gitignored).
// Never written to run_config.json or presets.
const FIELDS = [
  { key: "admin_user", name: "Admin user", secret: false },
  { key: "admin_pass", name: "Admin password", secret: true },
  { key: "groom_user", name: "Groom user", secret: false },
  { key: "groom_pass", name: "Groom password", secret: true },
];

export default function CredentialsPanel() {
  const [creds, setCreds] = useState({
    admin_user: "",
    admin_pass: "",
    groom_user: "",
    groom_pass: "",
  });
  const [reveal, setReveal] = useState(false);
  const [status, setStatus] = useState(null); // {kind, msg}
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getCredentials()
      .then((c) => setCreds((prev) => ({ ...prev, ...(c || {}) })))
      .catch((e) => setStatus({ kind: "err", msg: e.message }));
  }, []);

  const set = (k, v) => setCreds((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await putCredentials(creds);
      setStatus({ kind: "ok", msg: "Saved to loadtest/.env" });
    } catch (e) {
      setStatus({ kind: "err", msg: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={card}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: SP.md,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15 }}>Credentials</h3>
        <label
          style={{
            fontSize: 12,
            color: C.textDim,
            display: "flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={reveal}
            onChange={(e) => setReveal(e.target.checked)}
          />
          Reveal
        </label>
      </div>

      <div
        style={{
          background: C.goldGlow,
          border: `1px solid ${C.gold}`,
          color: C.goldLight,
          borderRadius: 6,
          padding: "6px 10px",
          fontSize: 12,
          marginBottom: SP.md,
        }}
      >
        Stored in <code>loadtest/.env</code> (gitignored) — never in presets or run config.
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: SP.md,
        }}
      >
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label style={label}>{f.name}</label>
            <input
              type={f.secret && !reveal ? "password" : "text"}
              value={creds[f.key] ?? ""}
              autoComplete="off"
              onChange={(e) => set(f.key, e.target.value)}
              style={{ ...input, width: "100%" }}
            />
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: SP.md, marginTop: SP.md }}>
        <button type="button" onClick={save} disabled={saving} style={button("primary")}>
          {saving ? "Saving…" : "Save credentials"}
        </button>
        {status && (
          <span
            style={{
              fontSize: 12,
              color: status.kind === "ok" ? C.green : C.red,
            }}
          >
            {status.msg}
          </span>
        )}
      </div>
    </div>
  );
}
