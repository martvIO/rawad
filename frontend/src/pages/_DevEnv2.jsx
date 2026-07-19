// TEMP preview page for the owner to review the designer envelope styles.
// Pick a style, tap the envelope to open it. REMOVE once styles are approved.
import { lazy, Suspense, useRef, useState } from "react";
import { getDigitalTheme } from "../styles/digitalThemes.js";
const CelestialCanvas = lazy(() => import("../components/digital/celestial/CelestialCanvas.jsx"));

const STYLES = [
  { key: "bloom", label: "المتفتّح (٤ طيّات)", sw: "#e9c9cb" },
  { key: "curtain", label: "الستائر المخملية", sw: "#6a1a2e" },
  { key: "classic", label: "المكتوب العادي", sw: "#8a6a52" },
];

export function DevEnv2() {
  const [style, setStyle] = useState("curtain");
  const [k, setK] = useState(0); // remount key: rebuilds the sealed envelope on switch / replay
  const worldRef = useRef(null);
  const theme = getDigitalTheme("ivorygold");
  const envelope = {
    style, colors: {},
    content: {
      namesAr: "كريم & ليلى", namesHe: "כרים & לילה",
      blessing: "على بركة الله", welcome: "بكل الحبّ ندعوكم لمشاركتنا فرحتنا",
      date: "14 يوليو 2026", eyebrow: "دعوة شخصية",
    },
  };
  const pick = (s) => { worldRef.current = null; setStyle(s); setK((n) => n + 1); };
  const open = () => { if (worldRef.current && worldRef.current.openEnvelope) worldRef.current.openEnvelope({}); };
  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: "#0c0b12", color: "#f0ece4", display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 10px", fontFamily: "'Amiri','Frank Ruhl Libre',serif" }}>
      <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 3 }}>معاينة أشكال المظروف</div>
      <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 12 }}>اختر شكلاً ثم اضغط على المظروف ليُفتح</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", justifyContent: "center" }}>
        {STYLES.map((s) => (
          <button key={s.key} onClick={() => pick(s.key)}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 999, cursor: "pointer",
              border: `2px solid ${style === s.key ? "#e0b34a" : "rgba(255,255,255,.15)"}`,
              background: style === s.key ? "rgba(224,179,74,.12)" : "rgba(255,255,255,.03)", color: "#f0ece4", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }}>
            <span style={{ width: 14, height: 14, borderRadius: "50%", background: s.sw, border: "1px solid rgba(255,255,255,.3)" }} />
            {s.label}
          </button>
        ))}
      </div>
      <div onClick={open} data-testid="env-box"
        style={{ position: "relative", width: "min(100vw, 480px)", height: "84vh", borderRadius: 22, overflow: "hidden", background: theme.bg, cursor: "pointer", boxShadow: "0 20px 60px -20px rgba(0,0,0,.6)" }}>
        <Suspense fallback={null}>
          <CelestialCanvas key={style + "-" + k} theme={theme} mode="preview" fixed={false} tier={2} envelope={envelope} elevated={false}
            onReady={(w) => { worldRef.current = w; }} />
        </Suspense>
      </div>
      <button onClick={() => pick(style)}
        style={{ marginTop: 12, padding: "8px 20px", borderRadius: 999, border: "1px solid rgba(255,255,255,.2)", background: "transparent", color: "#f0ece4", fontFamily: "inherit", fontSize: 13, cursor: "pointer" }}>↻ إعادة الإغلاق</button>
    </div>
  );
}
