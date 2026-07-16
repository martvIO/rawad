// Blossom & Oud ornaments — all drawn in code. The mihrab arch is the signature:
// a pointed Islamic arch that frames the content, the way the source frames its
// card. Deterministic; no randomness.

const L = (lang, ar, he) => (lang === "he" ? he : ar);

// The arch outline, in a 100x150 viewBox. Vertical jambs, then an ogee sweep to
// a point — the mihrab profile.
const ARCH_D =
  "M 6 148 L 6 62 C 6 34, 24 12, 50 3 C 76 12, 94 34, 94 62 L 94 148";

/**
 * A mihrab arch frame. Children render INSIDE it. The arch is an SVG border laid
 * over a clipped panel, so the content follows the arch's shape at the top.
 */
export function ArchFrame({ t, children, minH = 300 }) {
  return (
    <div style={{ position: "relative", maxWidth: t.maxW, margin: "0 auto" }}>
      <div
        style={{
          background: t.paper,
          color: t.paperInk,
          minHeight: minH,
          // The panel itself takes the arch silhouette.
          clipPath: "polygon(0% 100%, 0% 42%, 8% 26%, 22% 12%, 50% 0%, 78% 12%, 92% 26%, 100% 42%, 100% 100%)",
          padding: "62px 22px 30px",
          boxShadow: "0 30px 70px -34px rgba(0,0,0,.42)",
        }}
      >
        {children}
      </div>
      {/* The gold arch line, drawn over the panel edge. */}
      <svg
        viewBox="0 0 100 150"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      >
        <path d={ARCH_D} fill="none" stroke={t.trim} strokeWidth="0.7" vectorEffect="non-scaling-stroke" opacity="0.85" />
        <path d={ARCH_D} fill="none" stroke={t.trim} strokeWidth="0.35" vectorEffect="non-scaling-stroke" opacity="0.5"
          transform="translate(0 4) scale(1 0.97)" />
      </svg>
    </div>
  );
}

/** An eight-point arabesque star — the girih motif, code-drawn. */
export function Girih({ size = 22, t, color }) {
  const c = color || t.trim;
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI / 8) * i - Math.PI / 2;
    const r = i % 2 === 0 ? 20 : 8.5;
    pts.push(`${(20 + r * Math.cos(a)).toFixed(2)},${(20 + r * Math.sin(a)).toFixed(2)}`);
  }
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <polygon points={pts.join(" ")} fill="none" stroke={c} strokeWidth="1.1" opacity="0.9" />
      <circle cx="20" cy="20" r="3" fill={c} opacity="0.8" />
    </svg>
  );
}

/** A blossom — five petals around a gold heart. */
export function Blossom({ size = 22, t }) {
  const petals = [0, 72, 144, 216, 288];
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      {petals.map((deg) => (
        <ellipse key={deg} cx="20" cy="11" rx="5.4" ry="8.6" fill={t.blossom} opacity="0.62"
          transform={`rotate(${deg} 20 20)`} />
      ))}
      <circle cx="20" cy="20" r="3.4" fill={t.trim} />
    </svg>
  );
}

/** An arabesque band — a repeating vine scroll used as a divider. */
export function ArabesqueBand({ t, w = 200 }) {
  return (
    <svg width={w} height="14" viewBox="0 0 200 14" fill="none" aria-hidden="true" style={{ maxWidth: "100%" }}>
      <path
        d="M2 7 C 14 -2, 26 16, 38 7 C 50 -2, 62 16, 74 7 C 86 -2, 98 16, 110 7 C 122 -2, 134 16, 146 7 C 158 -2, 170 16, 182 7 C 190 1, 195 7, 198 7"
        stroke={t.trim} strokeWidth="1" opacity="0.7"
      />
    </svg>
  );
}

export function SectionTitle({ eyebrow, title, t, clipTextOk }) {
  return (
    <div style={{ textAlign: "center", marginBottom: 20 }}>
      {eyebrow && (
        <div className="bo-track" style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: t.theme.eyebrow, marginBottom: 8 }}>
          {eyebrow}
        </div>
      )}
      <h2
        className={clipTextOk ? "bo-grad" : "bo-grad-off"}
        style={{ fontFamily: "inherit", fontWeight: 900, fontSize: "clamp(22px,5.6vw,30px)", lineHeight: 1.4, margin: 0, paddingBlock: 4 }}
      >
        {title}
      </h2>
      <div aria-hidden="true" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 }}>
        <span style={{ width: 30, height: 1, background: t.rule }} />
        <Girih size={16} t={t} />
        <span style={{ width: 30, height: 1, background: t.rule }} />
      </div>
    </div>
  );
}

export function BoButton({ children, onClick, disabled, t, full, testid }) {
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: full ? "100%" : undefined,
        padding: "12px 22px", borderRadius: 999, border: "none",
        background: `linear-gradient(135deg, ${t.trim}, ${t.theme.accent})`,
        color: "#fffbf8",
        fontWeight: 800, fontSize: 14, fontFamily: "inherit",
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

export { L };
