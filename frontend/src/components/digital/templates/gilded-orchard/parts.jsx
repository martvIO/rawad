// Gilded Orchard ornaments — strung lights, a lit fountain, vine silhouettes.
// All code-drawn and DETERMINISTIC (no Math.random), so the orchard never
// reshuffles between renders.

const L = (lang, ar, he) => (lang === "he" ? he : ar);

/** A string of bulbs hanging in a catenary sag across the top. */
export function StringLights({ t, bulbs = 9, animate = true }) {
  // A fixed catenary; bulbs hang from evenly spaced points along it.
  const sag = 26;
  const pts = Array.from({ length: bulbs }, (_, i) => {
    const x = 6 + (188 / (bulbs - 1)) * i;
    const u = (x - 100) / 100;
    return { x, y: 8 + sag * (1 - u * u), i };
  });
  const d = `M 6 ${8 + 0} Q 100 ${8 + sag * 2} 194 ${8 + 0}`;
  return (
    <svg viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true" style={{ width: "100%", height: 60, display: "block" }}>
      <path d={d} fill="none" stroke={t.wire} strokeWidth="1" />
      {pts.map((p) => (
        <g key={p.i}>
          <line x1={p.x} y1={p.y} x2={p.x} y2={p.y + 7} stroke={t.wire} strokeWidth="0.7" />
          <circle cx={p.x} cy={p.y + 11} r="6.5" fill={t.bulbGlow} opacity="0.18">
            {animate && <animate attributeName="opacity" values="0.1;0.28;0.1" dur={`${2.6 + (p.i % 3) * 0.7}s`} repeatCount="indefinite" />}
          </circle>
          <circle cx={p.x} cy={p.y + 11} r="2.6" fill={t.bulb}>
            {animate && <animate attributeName="opacity" values="0.75;1;0.75" dur={`${2.6 + (p.i % 3) * 0.7}s`} repeatCount="indefinite" />}
          </circle>
        </g>
      ))}
    </svg>
  );
}

/** A tiered fountain, lit from within — the source's centrepiece. */
export function Fountain({ t, size = 150, animate = true }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      {/* pool glow */}
      <ellipse cx="50" cy="86" rx="34" ry="9" fill={t.water} opacity="0.18" />
      <ellipse cx="50" cy="86" rx="22" ry="5.5" fill={t.water} opacity="0.3" />
      {/* base + column + tiers */}
      <path d="M28 86 L34 74 H66 L72 86 Z" fill={t.water} opacity="0.5" />
      <ellipse cx="50" cy="74" rx="16" ry="4" fill={t.water} opacity="0.75" />
      <rect x="47.5" y="56" width="5" height="18" fill={t.water} opacity="0.6" />
      <ellipse cx="50" cy="56" rx="21" ry="5" fill={t.water} opacity="0.8" />
      <rect x="48.5" y="42" width="3" height="14" fill={t.water} opacity="0.6" />
      <ellipse cx="50" cy="42" rx="12" ry="3.4" fill={t.water} opacity="0.85" />
      <rect x="49.2" y="32" width="1.6" height="10" fill={t.water} opacity="0.6" />
      {/* jets */}
      {[[50, 30, 0], [42, 34, -1], [58, 34, 1]].map(([x, y, dir], i) => (
        <path key={i} d={`M${x} ${y} C ${x + dir * 9} ${y + 6}, ${x + dir * 12} ${y + 14}, ${x + dir * 13} ${y + 22}`}
          stroke={t.bulbGlow} strokeWidth="1.1" opacity="0.5" fill="none">
          {animate && <animate attributeName="opacity" values="0.3;0.62;0.3" dur={`${2.2 + i * 0.5}s`} repeatCount="indefinite" />}
        </path>
      ))}
      <circle cx="50" cy="28" r="2.6" fill={t.bulbGlow} opacity="0.9" />
    </svg>
  );
}

/** A vine silhouette for the page edges. */
export function VineEdge({ t, w = 90, h = 240, flip = false, opacity = 0.9 }) {
  const leaves = [
    [12, 210, -30, 1], [20, 182, 32, 0.9], [8, 158, -46, 0.95], [26, 132, 26, 0.84],
    [14, 106, -38, 0.8], [30, 80, 30, 0.72], [20, 54, -28, 0.64], [34, 30, 24, 0.56],
  ];
  return (
    <svg width={w} height={h} viewBox="0 0 60 240" fill="none" aria-hidden="true"
      style={{ transform: flip ? "scaleX(-1)" : undefined, opacity }}>
      <path d="M6 240 C 26 200, 4 168, 24 132 C 40 102, 26 70, 44 34 C 50 22, 48 10, 52 0"
        stroke={t.vine} strokeWidth="2.2" strokeLinecap="round" />
      {leaves.map(([x, y, rot, sc], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${rot}) scale(${sc})`}>
          <path d="M 0 0 C 10 -6, 19 -2, 23 0 C 19 2, 10 6, 0 0 Z" fill={t.vine} />
        </g>
      ))}
    </svg>
  );
}

export function SectionTitle({ eyebrow, title, t, clipTextOk }) {
  return (
    <div style={{ textAlign: "center", marginBottom: 20 }}>
      {eyebrow && (
        <div className="go-track" style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: t.theme.eyebrow, marginBottom: 8 }}>
          {eyebrow}
        </div>
      )}
      <h2
        className={clipTextOk ? "go-grad" : "go-grad-off"}
        style={{ fontFamily: "inherit", fontWeight: 900, fontSize: "clamp(22px,5.6vw,30px)", lineHeight: 1.4, margin: 0, paddingBlock: 4 }}
      >
        {title}
      </h2>
      <div aria-hidden="true" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 }}>
        <span style={{ width: 32, height: 1, background: t.rule }} />
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.bulb, boxShadow: `0 0 8px ${t.bulbGlow}` }} />
        <span style={{ width: 32, height: 1, background: t.rule }} />
      </div>
    </div>
  );
}

export function GoButton({ children, onClick, disabled, t, full, testid }) {
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: full ? "100%" : undefined,
        padding: "12px 22px", borderRadius: 999, border: "none",
        background: `linear-gradient(135deg, ${t.bulbGlow}, ${t.theme.accent})`,
        color: "#241d0b",
        fontWeight: 800, fontSize: 14, fontFamily: "inherit",
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

export { L };
