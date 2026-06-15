// Small presentational progress bar used on the gallery/photographer surfaces.
import { C } from "../styles/theme.js";

export function ProgressBar({ value = 0, total = 0, label, sublabel, color = C.gold }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div style={{ margin: "8px 0" }}>
      {label && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.dim, marginBottom: 4 }}>
          <span>{label}</span>
          <span>{total > 0 ? `${value}/${total}` : ""}</span>
        </div>
      )}
      <div style={{ height: 8, borderRadius: 6, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, transition: "width .3s" }} />
      </div>
      {sublabel && <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>{sublabel}</div>}
    </div>
  );
}
