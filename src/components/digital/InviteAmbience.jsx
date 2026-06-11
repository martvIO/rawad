// Ambient atmosphere — slow-drifting aurora blobs, falling petals, and
// twinkling sparkles. Pure CSS loops; positions are randomized once per mount.
import { useMemo } from "react";

export function Ambience({ theme, fixed }) {
  const petals = useMemo(() => Array.from({ length: 18 }, () => ({
    left: Math.random() * 100,
    dur: 15 + Math.random() * 14,
    delay: Math.random() * 18,
    size: 11 + Math.random() * 9,
  })), []);
  const sparkles = useMemo(() => Array.from({ length: 34 }, () => ({
    top: Math.random() * 100,
    left: Math.random() * 100,
    dur: 2.4 + Math.random() * 3.2,
    delay: Math.random() * 5,
    size: 1.5 + Math.random() * 2.4,
  })), []);
  const pos = fixed ? "fixed" : "absolute";
  const blob = `radial-gradient(circle, ${theme.accent} 0%, transparent 68%)`;
  return (
    <>
      {/* Living aurora — slow-drifting soft gold light gives the whole page depth */}
      <div className="dawa-inv-aurora" style={{ position: pos }} aria-hidden="true">
        <span className="dawa-inv-aurora-blob a1" style={{ background: blob }} />
        <span className="dawa-inv-aurora-blob a2" style={{ background: blob }} />
        <span className="dawa-inv-aurora-blob a3" style={{ background: blob }} />
      </div>
      <div className="dawa-inv-petals" style={{ position: pos }} aria-hidden="true">
        {petals.map((p, i) => (
          <span key={i} className="dawa-inv-petal" style={{ left: `${p.left}%`, width: p.size, height: p.size, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`, background: theme.petal }} />
        ))}
      </div>
      <div className="dawa-inv-sparkles" style={{ position: pos }} aria-hidden="true">
        {sparkles.map((s, i) => (
          <span key={i} className="dawa-inv-sparkle" style={{ top: `${s.top}%`, left: `${s.left}%`, width: s.size, height: s.size, animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s`, background: theme.sparkle, boxShadow: `0 0 ${(4 + s.size * 2.5).toFixed(0)}px ${theme.sparkleGlow}` }} />
        ))}
      </div>
    </>
  );
}
