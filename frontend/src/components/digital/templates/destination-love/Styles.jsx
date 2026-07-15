// Scoped stylesheet for the Destination Love template. Everything is namespaced
// under `.tpl-dl` and coloured through CSS custom properties the View sets on
// the root (so this string stays STATIC — no `${}` interpolation and no
// backticks in CSS comments, the template-literal build hazard that has broken
// InviteStyles.jsx before). Structure + motion live here; colour lives in vars.
export function DlStyles() {
  return <style>{DL_CSS}</style>;
}

const DL_CSS = `
.tpl-dl { --dl-ease: cubic-bezier(.22,.61,.36,1); }
.tpl-dl *, .tpl-dl *::before, .tpl-dl *::after { box-sizing: border-box; }

/* Arabic/Hebrew must never get positive letter-spacing (breaks joins). Only
   the Latin/numeric accents opt into tracking via .dl-track. */
.tpl-dl { letter-spacing: 0; }
.tpl-dl .dl-track { letter-spacing: .28em; }
.tpl-dl bdi { unicode-bidi: isolate; }

/* ── Entrance gating: content is held until the intro clears (is-opened). ── */
.tpl-dl .dl-reveal { opacity: 0; transform: translateY(26px); }
.tpl-dl.is-opened .dl-reveal { animation: dl-rise .9s var(--dl-ease) both; }
.tpl-dl.is-opened .dl-reveal.d1 { animation-delay: .05s; }
.tpl-dl.is-opened .dl-reveal.d2 { animation-delay: .18s; }
.tpl-dl.is-opened .dl-reveal.d3 { animation-delay: .32s; }
.tpl-dl.is-opened .dl-reveal.d4 { animation-delay: .46s; }
/* Below the fold: scroll-reveal takes over (JS adds .is-in). */
.tpl-dl .dl-scroll { opacity: 0; transform: translateY(30px); transition: opacity .7s var(--dl-ease), transform .7s var(--dl-ease); }
.tpl-dl .dl-scroll.is-in { opacity: 1; transform: none; }
@keyframes dl-rise { from { opacity: 0; transform: translateY(26px); } to { opacity: 1; transform: none; } }

/* ── Boarding-pass ticker marquee ──────────────────────────────────────── */
.tpl-dl .dl-ticker { position: relative; overflow: hidden; border-block: 1px solid var(--dl-accent-line); padding: 7px 0; }
.tpl-dl .dl-ticker-row { display: inline-flex; white-space: nowrap; will-change: transform; animation: dl-marquee 22s linear infinite; }
.tpl-dl .dl-ticker-row span { padding: 0 18px; font-size: 11px; font-weight: 800; color: var(--dl-accent); opacity: .7; }
@keyframes dl-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }

/* ── Tap cue (sealed intro) ───────────────────────────────────────────── */
.tpl-dl .dl-cue { animation: dl-cue 2.4s ease-in-out infinite; }
.tpl-dl .dl-cue--hot { animation-duration: 1.1s; }
@keyframes dl-cue { 0%,100% { opacity: .55; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-4px); } }

/* ── Plane flying a dashed path ───────────────────────────────────────── */
.tpl-dl .dl-path { stroke: var(--dl-dash); stroke-width: 1.6; stroke-dasharray: 3 7; fill: none; stroke-linecap: round; }
.tpl-dl .dl-plane-fly { offset-rotate: auto; animation: dl-fly 9s var(--dl-ease) infinite; }
@keyframes dl-fly { 0% { offset-distance: 0%; opacity: 0; } 8% { opacity: 1; } 92% { opacity: 1; } 100% { offset-distance: 100%; opacity: 0; } }

/* ── Stamp thud (intro reveal) ────────────────────────────────────────── */
@keyframes dl-stamp { 0% { opacity: 0; transform: scale(2.4) rotate(-18deg); } 60% { opacity: 1; transform: scale(.92) rotate(-11deg); } 75% { transform: scale(1.05) rotate(-11deg); } 100% { opacity: 1; transform: scale(1) rotate(-11deg); } }
.tpl-dl .dl-stamp-in { animation: dl-stamp .5s var(--dl-ease) both; }

/* ── Button shine sweep ───────────────────────────────────────────────── */
.tpl-dl .dl-btn { position: relative; overflow: hidden; }
.tpl-dl .dl-btn::after { content: ""; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,.35) 50%, transparent 70%); transform: translateX(-120%); animation: dl-shine 3.4s ease-in-out infinite; }
@keyframes dl-shine { 0%,55% { transform: translateX(-120%); } 80%,100% { transform: translateX(120%); } }

/* ── Floating dock + gentle float ─────────────────────────────────────── */
.tpl-dl .dl-float { animation: dl-float 5.5s ease-in-out infinite; }
@keyframes dl-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }

/* ── Countdown flip tiles ─────────────────────────────────────────────── */
.tpl-dl .dl-tile { position: relative; }
.tpl-dl .dl-tile::before { content: ""; position: absolute; inset-inline: 8%; top: 50%; height: 1px; background: var(--dl-card-border); }

/* ── Ambient sky (2D floor) ───────────────────────────────────────────── */
.tpl-dl .dl-sky { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.tpl-dl .dl-cloud { position: absolute; border-radius: 50%; filter: blur(28px); will-change: transform, opacity; }
.tpl-dl .dl-cloud.a { animation: dl-cloud-a 46s linear infinite; }
.tpl-dl .dl-cloud.b { animation: dl-cloud-b 62s linear infinite; }
@keyframes dl-cloud-a { 0% { transform: translateX(-14vw); } 100% { transform: translateX(114vw); } }
@keyframes dl-cloud-b { 0% { transform: translateX(114vw); } 100% { transform: translateX(-14vw); } }
.tpl-dl .dl-twinkle { position: absolute; border-radius: 50%; animation: dl-twinkle 3.4s ease-in-out infinite; }
@keyframes dl-twinkle { 0%,100% { opacity: .15; transform: scale(.7); } 50% { opacity: .9; transform: scale(1.1); } }

/* ── Section title underline flourish ─────────────────────────────────── */
.tpl-dl .dl-rule { display: flex; align-items: center; justify-content: center; gap: 8px; }
.tpl-dl .dl-rule i { display: block; height: 1px; width: 46px; background: linear-gradient(90deg, transparent, var(--dl-accent)); }
.tpl-dl .dl-rule i:last-child { transform: scaleX(-1); }
.tpl-dl .dl-rule b { width: 5px; height: 5px; border-radius: 50%; background: var(--dl-accent); }

/* Respect reduced motion: kill looping motion, keep everything readable. */
@media (prefers-reduced-motion: reduce) {
  .tpl-dl .dl-reveal, .tpl-dl.is-opened .dl-reveal { opacity: 1 !important; transform: none !important; animation: none !important; }
  .tpl-dl .dl-scroll { opacity: 1 !important; transform: none !important; transition: none !important; }
  .tpl-dl .dl-ticker-row, .tpl-dl .dl-plane-fly, .tpl-dl .dl-cue, .tpl-dl .dl-btn::after, .tpl-dl .dl-float,
  .tpl-dl .dl-cloud, .tpl-dl .dl-twinkle { animation: none !important; }
  .tpl-dl .dl-plane-fly { offset-distance: 62%; opacity: 1; }
}
`;
