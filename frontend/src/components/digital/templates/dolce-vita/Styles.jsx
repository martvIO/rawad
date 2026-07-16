// Scoped CSS for Dolce Vita. Everything is namespaced under .tpl-dv so no other
// surface is touched. Colours arrive as CSS custom properties set on the root by
// the view, so a palette switch is a variable swap, not a re-render of rules.
//
// GOTCHA (cost a build break once): this is a JS template literal — a backtick
// or ${ inside the CSS, even in a comment, terminates the string. Keep CSS
// comments free of both.

export function DvStyles({ t }) {
  const css = `
.tpl-dv {
  --dv-paper: ${t.paper};
  --dv-paper-soft: ${t.paperSoft};
  --dv-ink: ${t.paperInk};
  --dv-ink-soft: ${t.paperInkSoft};
  --dv-wax: ${t.wax};
  --dv-foil: ${t.foil};
  --dv-foil-soft: ${t.foilSoft};
  --dv-rule: ${t.rule};
  --dv-trim: ${t.trim};
  --dv-sea: ${t.sea};
  --dv-sky-top: ${t.skyTop};
  --dv-sky-low: ${t.skyLow};
  --dv-bg: ${t.theme.bg};
  --dv-text: ${t.theme.text};
  --dv-text-soft: ${t.theme.textSoft};
  --dv-accent: ${t.theme.accent};
  --dv-accent-line: ${t.theme.accentLine};
  position: relative;
  background: var(--dv-bg);
  color: var(--dv-text);
  min-height: 100vh;
  overflow-x: hidden;
}

/* Arabic must never be letter-spaced — it breaks the cursive joins. Tracking is
   a Latin/Hebrew flourish only, so it is opt-in via .dv-track and cancelled for
   Arabic by the lang-scoped rule at the bottom. */
.tpl-dv .dv-track { letter-spacing: .18em; }

/* Ambient sky wash behind everything (the 2D floor; the 3D scene layers over). */
.tpl-dv .dv-sky {
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background:
    radial-gradient(120% 70% at 50% 0%, var(--dv-sky-top) 0%, transparent 60%),
    radial-gradient(120% 60% at 50% 100%, var(--dv-sky-low) 0%, transparent 55%),
    var(--dv-bg);
}
.tpl-dv .dv-content { position: relative; z-index: 1; }

/* ── The letter (hero + intro share this stationery look) ───────────────── */
.tpl-dv .dv-letter {
  background: var(--dv-paper);
  color: var(--dv-ink);
  border-radius: 6px;
  box-shadow: 0 30px 70px -34px rgba(0,0,0,.55);
  position: relative;
  padding: 30px 24px 26px;
}
/* A hairline inner rule, the way engraved stationery is framed. */
.tpl-dv .dv-letter::after {
  content: ""; position: absolute; inset: 9px;
  border: 1px solid var(--dv-rule); border-radius: 3px;
  pointer-events: none; opacity: .55;
}

/* ── Wax seal ───────────────────────────────────────────────────────────── */
.tpl-dv .dv-wax {
  width: 62px; height: 62px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: radial-gradient(circle at 34% 30%, color-mix(in srgb, var(--dv-wax) 78%, white), var(--dv-wax) 62%, color-mix(in srgb, var(--dv-wax) 70%, black) 100%);
  box-shadow: 0 6px 16px -6px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.28);
  color: var(--dv-foil-soft);
  font-size: 22px; line-height: 1;
}

/* ── Scratch-to-reveal date tiles (the signature) ───────────────────────── */
.tpl-dv .dv-scratch-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; max-width: 340px; margin-inline: auto; }
.tpl-dv .dv-scratch {
  position: relative; aspect-ratio: 1 / 1; border-radius: 10px; overflow: hidden;
  background: var(--dv-paper); color: var(--dv-ink);
  border: 1px solid var(--dv-rule);
  display: flex; align-items: center; justify-content: center;
  touch-action: none;
}
.tpl-dv .dv-scratch canvas { position: absolute; inset: 0; width: 100%; height: 100%; cursor: grab; }
.tpl-dv .dv-scratch-val { font-weight: 900; font-size: clamp(20px, 6vw, 26px); line-height: 1; }
.tpl-dv .dv-scratch-cap { font-size: 9px; font-weight: 800; text-transform: uppercase; color: var(--dv-ink-soft); margin-top: 6px; }
.tpl-dv .dv-scratch-hint { font-size: 12px; color: var(--dv-text-soft); text-align: center; margin-top: 12px; }

/* ── Reveal choreography ────────────────────────────────────────────────── */
.tpl-dv .dv-reveal { opacity: 0; transform: translateY(14px); }
.tpl-dv.is-opened .dv-reveal { animation: dv-rise .9s cubic-bezier(.2,.9,.3,1) both; }
.tpl-dv.is-opened .dv-reveal.d1 { animation-delay: .05s; }
.tpl-dv.is-opened .dv-reveal.d2 { animation-delay: .18s; }
.tpl-dv.is-opened .dv-reveal.d3 { animation-delay: .31s; }
.tpl-dv.is-opened .dv-reveal.d4 { animation-delay: .44s; }
@keyframes dv-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }

/* Scroll-reveal for below-the-fold sections. */
.tpl-dv .dv-scroll { opacity: 0; transform: translateY(18px); transition: opacity .8s ease, transform .8s cubic-bezier(.2,.9,.3,1); }
.tpl-dv .dv-scroll.is-in { opacity: 1; transform: none; }

/* Gold gradient headings — the same foil treatment the brand uses elsewhere. */
.tpl-dv .dv-grad {
  background: linear-gradient(135deg, var(--dv-accent), color-mix(in srgb, var(--dv-accent) 55%, white), var(--dv-accent));
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
}
.tpl-dv .dv-grad-off { color: var(--dv-accent); }

.tpl-dv .dv-tile { background: var(--dv-paper); color: var(--dv-ink); border: 1px solid var(--dv-rule); border-radius: 10px; }

/* Arabic: cancel every tracked treatment (see .dv-track above). */
.tpl-dv[lang="ar"] .dv-track,
.tpl-dv[lang="ar"] .dv-scratch-cap { letter-spacing: normal; }

@media (prefers-reduced-motion: reduce) {
  .tpl-dv .dv-reveal, .tpl-dv.is-opened .dv-reveal { animation: none !important; opacity: 1 !important; transform: none !important; }
  .tpl-dv .dv-scroll { opacity: 1 !important; transform: none !important; transition: none !important; }
}
`;
  return <style>{css}</style>;
}
