// Autocomplete input that picks a city from the local CITIES_DB.
import { useState, useMemo } from "react";
import { CITIES_DB } from "../data/cities.js";

export function CityField({ value, onChange, lang, t }) {
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const q = (value || "").trim().toLowerCase();
    if (q.length < 1) return CITIES_DB.slice(0, 8);
    const startsWith = (s) => s.toLowerCase().startsWith(q);
    const includes   = (s) => s.toLowerCase().includes(q);
    const starts = CITIES_DB.filter(c => startsWith(c.ar) || startsWith(c.he));
    const incs   = CITIES_DB.filter(c => !startsWith(c.ar) && !startsWith(c.he) && (includes(c.ar) || includes(c.he)));
    return [...starts, ...incs].slice(0, 8);
  }, [value]);

  return (
    <div style={{ position: "relative" }}>
      <input className="input-field" type="text" placeholder={t("addr_city_placeholder")}
             value={value}
             onChange={e => { onChange(e.target.value); setOpen(true); }}
             onFocus={() => setOpen(true)}
             onBlur={() => setTimeout(() => setOpen(false), 200)}/>
      {open && matches.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0,
          background: "#0c0c11", border: "1px solid rgba(201,168,76,.3)",
          borderRadius: 12, marginTop: 4, padding: 6,
          maxHeight: 260, overflowY: "auto", zIndex: 100,
          boxShadow: "0 8px 28px rgba(0,0,0,.6)",
        }}>
          {matches.map(c => {
            const primary = lang === "he" ? c.he : c.ar;
            const secondary = lang === "he" ? c.ar : c.he;
            return (
              <div key={c.ar} onMouseDown={e => e.preventDefault()}
                   onClick={() => { onChange(primary); setOpen(false); }}
                   style={{
                     padding: "9px 12px", borderRadius: 8, cursor: "pointer",
                     fontSize: 13, color: "#f5e6b8", lineHeight: 1.5,
                     transition: "background .15s",
                     display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                   }}
                   onMouseEnter={e => e.currentTarget.style.background = "rgba(201,168,76,.12)"}
                   onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <span style={{ fontWeight: 700 }}>🏘 {primary}</span>
                <span style={{ fontSize: 11, color: "#5a5040" }}>{secondary}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
