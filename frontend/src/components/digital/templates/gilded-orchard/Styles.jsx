// Scoped CSS for Gilded Orchard, namespaced under .tpl-go.
// GOTCHA: JS template literal — no backticks or ${ inside the CSS, even in
// comments, or the string terminates and the build breaks.

export function GoStyles({ t }) {
  const css = `
.tpl-go {
  --go-paper: ${t.paper};
  --go-paper-soft: ${t.paperSoft};
  --go-ink: ${t.paperInk};
  --go-ink-soft: ${t.paperInkSoft};
  --go-bulb: ${t.bulb};
  --go-bulb-glow: ${t.bulbGlow};
  --go-wire: ${t.wire};
  --go-vine: ${t.vine};
  --go-water: ${t.water};
  --go-trim: ${t.trim};
  --go-rule: ${t.rule};
  --go-bg: ${t.theme.bg};
  --go-text: ${t.theme.text};
  --go-text-soft: ${t.theme.textSoft};
  --go-accent: ${t.theme.accent};
  position: relative;
  background: var(--go-bg);
  color: var(--go-text);
  min-height: 100vh;
  overflow-x: hidden;
}

.tpl-go .go-track { letter-spacing: .18em; }

/* Warm lamplight pooling from above, and the dark orchard beyond. */
.tpl-go .go-night {
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background:
    radial-gradient(90% 42% at 50% 0%, color-mix(in srgb, var(--go-bulb-glow) 16%, transparent) 0%, transparent 62%),
    radial-gradient(70% 40% at 50% 100%, color-mix(in srgb, var(--go-water) 12%, transparent) 0%, transparent 60%);
}
.tpl-go .go-content { position: relative; z-index: 1; }

/* Vines climbing both page edges, behind the content. */
.tpl-go .go-vine-l { position: fixed; inset-inline-start: 0; bottom: 0; z-index: 0; pointer-events: none; }
.tpl-go .go-vine-r { position: fixed; inset-inline-end: 0; bottom: 0; z-index: 0; pointer-events: none; }

.tpl-go .go-card { background: var(--go-paper); color: var(--go-ink); border-radius: 4px; }

.tpl-go .go-reveal { opacity: 0; transform: translateY(14px); }
.tpl-go.is-opened .go-reveal { animation: go-rise .9s cubic-bezier(.2,.9,.3,1) both; }
.tpl-go.is-opened .go-reveal.d1 { animation-delay: .05s; }
.tpl-go.is-opened .go-reveal.d2 { animation-delay: .2s; }
.tpl-go.is-opened .go-reveal.d3 { animation-delay: .35s; }
@keyframes go-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }

.tpl-go .go-scroll { opacity: 0; transform: translateY(18px); transition: opacity .8s ease, transform .8s cubic-bezier(.2,.9,.3,1); }
.tpl-go .go-scroll.is-in { opacity: 1; transform: none; }

.tpl-go .go-grad {
  background: linear-gradient(135deg, var(--go-bulb-glow), var(--go-accent), var(--go-bulb-glow));
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
}
.tpl-go .go-grad-off { color: var(--go-accent); }

.tpl-go[lang="ar"] .go-track { letter-spacing: normal; }

@media (prefers-reduced-motion: reduce) {
  .tpl-go .go-reveal, .tpl-go.is-opened .go-reveal { animation: none !important; opacity: 1 !important; transform: none !important; }
  .tpl-go .go-scroll { opacity: 1 !important; transform: none !important; transition: none !important; }
}
`;
  return <style>{css}</style>;
}
