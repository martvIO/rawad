// The guaranteed 2D ambient floor for Destination Love — a soft dawn/dusk sky
// wash with slowly drifting clouds and a few twinkles. Pure CSS/DOM, so it
// paints instantly and also serves as the Suspense placeholder under the lazy
// three.js scene. Colours come from the CSS vars the View set on `.tpl-dl`,
// plus the motif tones passed in `t` (from dlTokens).
import { useMemo } from "react";

const CLOUDS = [
  { cls: "a", top: "12%", size: 220, o: 0.10, delay: "0s" },
  { cls: "b", top: "34%", size: 300, o: 0.08, delay: "-18s" },
  { cls: "a", top: "62%", size: 180, o: 0.07, delay: "-30s" },
  { cls: "b", top: "80%", size: 260, o: 0.06, delay: "-46s" },
];

export function Ambience2D({ t, fixed = true }) {
  // A stable scatter of twinkles (no Math.random in render dependency — seed by
  // index so SSR/CSR match and it never re-lays-out on re-render).
  const twinkles = useMemo(
    () => Array.from({ length: 22 }, (_, i) => ({
      left: `${(i * 41) % 100}%`,
      top: `${(i * 27 + 7) % 100}%`,
      size: 2 + (i % 3),
      delay: `${(i % 7) * 0.5}s`,
    })),
    [],
  );
  return (
    <div
      className="dl-sky"
      aria-hidden="true"
      style={{
        position: fixed ? "fixed" : "absolute",
        background: `radial-gradient(120% 80% at 50% -10%, ${t.sceneHaze} 0%, ${t.theme.bg} 60%)`,
      }}
    >
      {twinkles.map((tw, i) => (
        <span
          key={i}
          className="dl-twinkle"
          style={{ left: tw.left, top: tw.top, width: tw.size, height: tw.size, background: t.theme.sparkle, boxShadow: `0 0 6px ${t.theme.sparkleGlow}`, animationDelay: tw.delay }}
        />
      ))}
      {CLOUDS.map((c, i) => (
        <span
          key={i}
          className={`dl-cloud ${c.cls}`}
          style={{ top: c.top, width: c.size, height: c.size * 0.5, background: t.isLight ? "#ffffff" : t.secondary, opacity: c.o, animationDelay: c.delay }}
        />
      ))}
    </div>
  );
}
