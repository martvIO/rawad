import { useMemo } from "react";

const PETAL_COUNT = 18;
const SPARKLE_COUNT = 34;

// Edge anchors for the custom-background circles. Each circle's CENTRE is pinned
// exactly onto a screen edge point (4 corners + 4 edge-midpoints) via translate,
// so half (or, at corners, three-quarters) sits off-screen and the visible glow
// hugs the border while the CENTRE of the screen stays clear at any size — the
// closest a circle centre gets to the viewport centre is half a viewport
// dimension, and the gradient fades out well before reaching it. Physical
// left/right (not logical) keeps the symmetric framing identical in RTL/LTR.
// The anchor owns position + centring transform (of its OWN definite cqmin size);
// the inner blob owns the drift animation transform, so the two never fight.
const EDGE_ANCHORS = [
  { top: "0", left: "0", transform: "translate(-50%, -50%)" },     // top-left corner
  { bottom: "0", right: "0", transform: "translate(50%, 50%)" },   // bottom-right corner
  { top: "0", right: "0", transform: "translate(50%, -50%)" },     // top-right corner
  { bottom: "0", left: "0", transform: "translate(-50%, 50%)" },   // bottom-left corner
  { top: "50%", left: "0", transform: "translate(-50%, -50%)" },   // mid-left edge
  { top: "50%", right: "0", transform: "translate(50%, -50%)" },   // mid-right edge
  { top: "0", left: "50%", transform: "translate(-50%, -50%)" },   // top-centre edge
  { bottom: "0", left: "50%", transform: "translate(-50%, 50%)" }, // bottom-centre edge
];

// ── Ambient backdrop ─────────────────────────────────────────────────────────
// Default (no `background`): the theme-driven aurora blobs + petals + sparkles —
// the guaranteed 2D floor behind the invitation (and the WebGL Suspense
// placeholder). When a resolved `background` config is passed (groom's custom
// background, see resolveBackground), it renders that instead: a solid/gradient
// fill (or image + dim overlay) with edge-only decorative circles, keeping the
// petals/sparkles per their toggles.
function Ambience({ theme, fixed, background = null }) {
  const pos = fixed ? "fixed" : "absolute";
  const petals = useMemo(() => Array.from({ length: PETAL_COUNT }, () => ({
    left: Math.random() * 100,
    dur: 15 + Math.random() * 14,
    delay: Math.random() * 18,
    size: 11 + Math.random() * 9,
  })), []);
  const sparkles = useMemo(() => Array.from({ length: SPARKLE_COUNT }, () => ({
    top: Math.random() * 100,
    left: Math.random() * 100,
    dur: 2.4 + Math.random() * 3.2,
    delay: Math.random() * 5,
    size: 1.5 + Math.random() * 2.4,
  })), []);

  const Petals = (
    <div className="dawa-inv-petals" style={{ position: pos }} aria-hidden="true">
      {petals.map((p, i) => (
        <span key={i} className="dawa-inv-petal" style={{ left: `${p.left}%`, width: p.size, height: p.size, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`, background: theme.petal }} />
      ))}
    </div>
  );
  const Sparkles = (
    <div className="dawa-inv-sparkles" style={{ position: pos }} aria-hidden="true">
      {sparkles.map((s, i) => (
        <span key={i} className="dawa-inv-sparkle" style={{ top: `${s.top}%`, left: `${s.left}%`, width: s.size, height: s.size, animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s`, background: theme.sparkle, boxShadow: `0 0 ${(4 + s.size * 2.5).toFixed(0)}px ${theme.sparkleGlow}` }} />
      ))}
    </div>
  );

  // ── Custom background (groom-designed) ──────────────────────────────────────
  if (background) {
    const c = background.circles;
    const diaNum = Math.round(40 + c.size * 80); // 0..1 → 40..120 (× 1cqmin/1vmin in CSS)
    const blur = Math.round(c.softness * 120); // 0..1 → 0..120 px
    const blob = `radial-gradient(circle, ${c.color} 0%, transparent 66%)`;
    return (
      <>
        {/* Fill / image / overlay / circles share the aurora container (fixed,
            inset:0, z-index:0, overflow:hidden) → clipped to the viewport and
            painted BEHIND the content, exactly like the WebGL world. `is-custom`
            makes it a size query container so the cqmin-sized circles scale to it. */}
        <div className="dawa-inv-aurora is-custom" style={{ position: pos }} aria-hidden="true">
          <span style={{ position: "absolute", inset: 0, background: background.fill }} />
          {background.image && (
            <span style={{ position: "absolute", inset: 0, backgroundImage: `url("${background.image.url}")`, backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" }} />
          )}
          {background.image && background.imageOverlay > 0 && (
            <span style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${background.imageOverlay})` }} />
          )}
          {Array.from({ length: c.count }).map((_, i) => (
            <span key={i} className="dawa-inv-bgcircle-anchor" style={{ "--bgdia": diaNum, ...EDGE_ANCHORS[i % EDGE_ANCHORS.length] }}>
              <span
                className="dawa-inv-bgcircle"
                style={{
                  background: blob,
                  filter: blur ? `blur(${blur}px)` : "none",
                  opacity: c.opacity,
                  animation: c.motion ? `dawa-inv-drift${(i % 3) + 1} ${24 + (i % 4) * 4}s ease-in-out infinite` : "none",
                  animationDelay: `${-i * 2.5}s`,
                }}
              />
            </span>
          ))}
        </div>
        {background.petals && Petals}
        {background.sparkles && Sparkles}
      </>
    );
  }

  // ── Default theme ambience (unchanged) ──────────────────────────────────────
  const blob = `radial-gradient(circle, ${theme.accent} 0%, transparent 68%)`;
  return (
    <>
      {/* Living aurora — slow-drifting soft gold light gives the whole page depth */}
      <div className="dawa-inv-aurora" style={{ position: pos }} aria-hidden="true">
        <span className="dawa-inv-aurora-blob a1" style={{ background: blob }} />
        <span className="dawa-inv-aurora-blob a2" style={{ background: blob }} />
        <span className="dawa-inv-aurora-blob a3" style={{ background: blob }} />
      </div>
      {Petals}
      {Sparkles}
    </>
  );
}

export { Ambience };
