// Sacred Garden ornaments — all drawn in code (SVG), never lifted from the
// source. A vine, a rose, a leaf, the torn-paper edge and the section title.
// Deterministic: no randomness, so a re-render never reshuffles the garden.

const L = (lang, ar, he) => (lang === "he" ? he : ar);

/** A climbing vine with leaves — used as a corner garland. `flip` mirrors it. */
export function Vine({ w = 120, h = 150, t, flip = false, opacity = 0.5 }) {
  const stem = "M 8 150 C 30 110, 6 84, 28 56 C 42 38, 34 18, 52 2";
  // Leaf positions along the stem, hand-placed so they read as growth.
  const leaves = [
    [16, 126, -28, 1], [22, 104, 34, 0.86], [12, 88, -44, 0.92],
    [30, 66, 28, 0.8], [24, 46, -34, 0.74], [40, 26, 30, 0.66], [44, 10, -22, 0.58],
  ];
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 60 152"
      fill="none"
      aria-hidden="true"
      style={{ transform: flip ? "scaleX(-1)" : undefined, opacity }}
    >
      <path d={stem} stroke={t.leaf} strokeWidth="1.4" strokeLinecap="round" />
      {leaves.map(([x, y, rot, sc], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${rot}) scale(${sc})`}>
          {/* A single leaf: two mirrored arcs + a midrib. */}
          <path d="M 0 0 C 9 -5, 17 -2, 20 0 C 17 2, 9 5, 0 0 Z" fill={t.leafSoft} opacity="0.9" />
          <path d="M 0 0 L 20 0" stroke={t.leaf} strokeWidth="0.6" opacity="0.7" />
        </g>
      ))}
    </svg>
  );
}

/** A rose seen from above — concentric petal arcs. */
export function Rose({ size = 26, t }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="17" fill={t.rose} opacity="0.42" />
      <circle cx="20" cy="20" r="12.5" fill={t.rose} opacity="0.55" />
      <circle cx="20" cy="20" r="8" fill={t.rose} opacity="0.7" />
      <path d="M 20 12 C 26 14, 27 21, 20 24 C 13 21, 14 14, 20 12 Z" fill={t.wax} opacity="0.5" />
      <circle cx="20" cy="20" r="3" fill={t.trim} opacity="0.8" />
    </svg>
  );
}

/**
 * A torn / deckled paper edge — the source's signature transition between
 * sections. Drawn as a fixed, hand-authored path (not random) so it is stable
 * across renders, and stretched with preserveAspectRatio="none".
 * `flip` points the tear the other way for the bottom of a band.
 */
export function TornEdge({ t, flip = false, height = 14 }) {
  const d =
    "M0,10 C12,3 22,14 34,7 C46,1 54,12 66,6 C78,1 88,13 100,5 C112,0 121,11 133,6 " +
    "C145,1 154,12 166,7 C178,3 188,13 200,8 C212,3 221,12 233,7 C245,2 254,13 266,7 " +
    "C278,2 288,12 300,6 L300,16 L0,16 Z";
  return (
    <svg
      width="100%"
      height={height}
      viewBox="0 0 300 16"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ display: "block", transform: flip ? "scaleY(-1)" : undefined }}
    >
      <path d={d} fill={t.paper} />
    </svg>
  );
}

/** Gold-script section head with a rose between two rules. */
export function SectionTitle({ eyebrow, title, t, clipTextOk }) {
  return (
    <div style={{ textAlign: "center", marginBottom: 20 }}>
      {eyebrow && (
        <div className="sg-track" style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: t.theme.eyebrow, marginBottom: 8 }}>
          {eyebrow}
        </div>
      )}
      <h2
        className={clipTextOk ? "sg-grad" : "sg-grad-off"}
        style={{ fontFamily: "inherit", fontWeight: 900, fontSize: "clamp(22px,5.6vw,30px)", lineHeight: 1.35, margin: 0, paddingBlock: 4 }}
      >
        {title}
      </h2>
      <div aria-hidden="true" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 8 }}>
        <span style={{ width: 40, height: 1, background: t.rule }} />
        <Rose size={18} t={t} />
        <span style={{ width: 40, height: 1, background: t.rule }} />
      </div>
    </div>
  );
}

export function SgButton({ children, onClick, disabled, t, full, testid }) {
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
        color: "#fffdf6",
        fontWeight: 800, fontSize: 14, fontFamily: "inherit",
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

export { L };
