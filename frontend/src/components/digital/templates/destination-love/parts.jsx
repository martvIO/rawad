// Shared visual primitives for the Destination Love sections. Kept here so the
// paper-plane, the dashed flight path, the section title, the shine button, and
// the boarding-pass ticker read identically everywhere.
import { getDigitalFont } from "../../../../styles/digitalThemes.js";

// A little paper/origami plane, tinted. `tail` draws a short dashed contrail.
export function PaperPlane({ size = 24, color = "#c9a86a", stroke = "rgba(0,0,0,.15)" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ display: "block" }}>
      <path d="M22 2 L2 10.5 L9.6 13 L12.5 21 L15 13.4 Z" fill={color} stroke={stroke} strokeWidth="0.8" strokeLinejoin="round" />
      <path d="M9.6 13 L22 2 L14 12.2 Z" fill={color} opacity="0.7" />
    </svg>
  );
}

// A dashed flight path with a plane flying along it. The container is sized in
// exact px and the SVG viewBox matches 1:1, so the CSS offset-path coordinates
// align with the drawn path (no scaling → no drift). Reduced-motion parks the
// plane mid-route (handled in Styles). Keep w ≤ ~340 so it fits a 390 phone.
export function FlightPath({ w = 320, h = 120, d, t, fly = true, planeSize = 22, duration = "9s" }) {
  return (
    <div style={{ position: "relative", width: w, height: h, maxWidth: "100%", margin: "0 auto" }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", overflow: "visible" }} aria-hidden="true">
        <path className="dl-path" d={d} />
        <circle cx={pathStart(d).x} cy={pathStart(d).y} r="3.4" fill={t.accent} />
      </svg>
      <div
        className={fly ? "dl-plane-fly" : ""}
        style={{ position: "absolute", insetInlineStart: 0, top: 0, offsetPath: `path("${d}")`, offsetDistance: fly ? undefined : "100%", animationDuration: duration, width: planeSize, height: planeSize, marginInlineStart: -planeSize / 2, marginTop: -planeSize / 2 }}
      >
        <PaperPlane size={planeSize} color={t.secondary} />
      </div>
    </div>
  );
}

// Parse the "M x y" that starts a path so the origin dot can sit on it.
function pathStart(d) {
  const m = /M\s*([\d.]+)[ ,]+([\d.]+)/.exec(d || "");
  return m ? { x: +m[1], y: +m[2] } : { x: 0, y: 0 };
}

// Eyebrow + gradient script title + the twin-rule flourish.
export function SectionTitle({ eyebrow, title, t, fontFamily, id }) {
  const font = getDigitalFont(fontFamily);
  return (
    <div style={{ textAlign: "center", marginBottom: 20 }} id={id}>
      {eyebrow && (
        <div className="dl-track" style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: t.accent, marginBottom: 8 }}>
          {eyebrow}
        </div>
      )}
      <h2
        style={{
          margin: 0,
          fontFamily: font.family,
          fontSize: "clamp(26px,7vw,40px)",
          fontWeight: 700,
          lineHeight: 1.15,
          background: `linear-gradient(135deg, ${t.theme.gradientStops.join(",")})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        {title}
      </h2>
      <div className="dl-rule" style={{ marginTop: 12 }} aria-hidden="true"><i /><b /><i /></div>
    </div>
  );
}

// Sage/accent pill with the shine sweep.
export function DlButton({ children, onClick, disabled, t, type = "button", full = false, testid }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-testid={testid}
      className="dl-btn"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        width: full ? "100%" : undefined,
        padding: "13px 26px",
        borderRadius: 999,
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        background: t.secondary,
        color: t.isLight ? "#fff" : "#20211c",
        fontWeight: 800,
        fontSize: 15,
        fontFamily: "inherit",
        boxShadow: `0 10px 26px -12px ${t.secondary}`,
      }}
    >
      {children}
    </button>
  );
}

// The scrolling "boarding pass" ribbon. Doubled row so the -50% loop is seamless.
export function Ticker({ text }) {
  const items = Array.from({ length: 12 }, (_, i) => <span key={i}>{text}</span>);
  return (
    <div className="dl-ticker" aria-hidden="true">
      <div className="dl-ticker-row">{items}{items}</div>
    </div>
  );
}
