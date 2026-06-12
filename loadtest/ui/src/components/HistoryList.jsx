import React, { useEffect, useState, useCallback } from "react";
import { C, SP, card, button, chip } from "../theme.js";
import { getHistory, deleteHistoryItem } from "../api.js";
import RunDetail from "./RunDetail.jsx";
import CompareView from "./CompareView.jsx";

// History tab. Lists archived runs as cards, opens a RunDetail, and supports
// picking exactly two runs to compare.
export default function HistoryList() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState(null);
  const [comparePair, setComparePair] = useState(null); // [a, b]
  const [picked, setPicked] = useState([]); // selected ids for compare

  const refresh = useCallback(() => {
    setLoading(true);
    getHistory()
      .then((list) => {
        setItems(Array.isArray(list) ? list : []);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (detailId) {
    return <RunDetail id={detailId} onBack={() => setDetailId(null)} />;
  }
  if (comparePair) {
    return (
      <CompareView
        a={comparePair[0]}
        b={comparePair[1]}
        onBack={() => setComparePair(null)}
      />
    );
  }

  const togglePick = (id) => {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id]; // keep last two
      return prev.concat(id);
    });
  };

  const remove = async (id, e) => {
    e.stopPropagation();
    try {
      await deleteHistoryItem(id);
      setPicked((p) => p.filter((x) => x !== id));
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.lg }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.md, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>History</h2>
        <button type="button" onClick={refresh} style={button("ghost")}>
          Refresh
        </button>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: SP.md }}>
          <span style={{ fontSize: 12, color: C.textDim }}>
            {picked.length}/2 selected for compare
          </span>
          <button
            type="button"
            disabled={picked.length !== 2}
            onClick={() => setComparePair([picked[0], picked[1]])}
            style={{ ...button("blue"), opacity: picked.length === 2 ? 1 : 0.5 }}
          >
            Compare
          </button>
        </div>
      </div>

      {error && <div style={{ ...card, color: C.red }}>{error}</div>}
      {loading && <div style={{ color: C.textDim }}>Loading history…</div>}
      {!loading && items.length === 0 && (
        <div style={{ ...card, color: C.textFaint }}>
          No archived runs yet. Archive a completed run from the Run tab.
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: SP.md,
        }}
      >
        {items.map((m) => {
          const id = m.id || m.run_id;
          const selected = picked.includes(id);
          const verdict = m.verdict || {};
          const sloPass = m.slo_pass != null ? m.slo_pass : verdict.slo_pass;
          return (
            <div
              key={id}
              onClick={() => setDetailId(id)}
              style={{
                ...card,
                cursor: "pointer",
                borderColor: selected ? C.blue : C.border,
                boxShadow: selected ? `0 0 0 1px ${C.blue}` : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <strong style={{ fontSize: 14, color: C.text, wordBreak: "break-all" }}>{id}</strong>
                <label
                  onClick={(e) => e.stopPropagation()}
                  style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.textDim }}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => togglePick(id)}
                  />
                  compare
                </label>
              </div>

              <div style={{ fontSize: 12, color: C.textDim, marginTop: 4 }}>
                {m.timestamp || m.started_at || m.archived_at || "—"}
              </div>
              <div style={{ fontSize: 12, color: C.textDim, marginTop: 2, wordBreak: "break-all" }}>
                {m.target || m.base_url || m.config?.base_url || "—"}
              </div>

              <div style={{ display: "flex", gap: SP.sm, marginTop: SP.md, flexWrap: "wrap", alignItems: "center" }}>
                <span style={chip("neutral")}>
                  {(m.max_users ?? verdict.healthy_max_users ?? "—")} max users
                </span>
                {sloPass != null && (
                  <span style={chip(sloPass ? "pass" : "fail")}>
                    SLO {sloPass ? "PASS" : "FAIL"}
                  </span>
                )}
                {m.aborted && <span style={chip("warn")}>aborted</span>}
                <button
                  type="button"
                  onClick={(e) => remove(id, e)}
                  style={{
                    marginLeft: "auto",
                    background: "transparent",
                    border: `1px solid ${C.border}`,
                    color: C.red,
                    borderRadius: 4,
                    fontSize: 11,
                    padding: "3px 8px",
                    cursor: "pointer",
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
