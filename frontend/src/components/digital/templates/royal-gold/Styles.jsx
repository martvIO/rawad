// Scoped CSS for Royal Gold, namespaced under .tpl-rg.
// GOTCHA: this is a JS template literal — no backticks and no dollar-brace
// sequences inside the CSS, even in comments, or the string terminates early and
// the build breaks.

export function RgStyles({ t }) {
  const css = `
.tpl-rg {
  --rg-band: ${t.band};
  --rg-band-ink: ${t.bandInk};
  --rg-wine: ${t.wine};
  --rg-frame: ${t.frame};
  --rg-rule: ${t.rule};
  --rg-bg: ${t.theme.bg};
  --rg-text: ${t.theme.text};
  position: relative;
  background: var(--rg-bg);
  color: var(--rg-text);
  min-height: 100vh;
  overflow-x: hidden;
}

/* A cream band torn out of the wine wall — the source's signature alternation. */
.tpl-rg .rg-band { background: var(--rg-band); color: var(--rg-band-ink); }

/* Tracking is a Latin-only affordance. Arabic is cursive: spacing the letters
   severs the joins and renders the word as disconnected glyphs, so the
   lang-scoped rule below cancels it. */
.tpl-rg .rg-track { letter-spacing: .18em; }
.tpl-rg[lang="ar"] .rg-track { letter-spacing: normal; }

.tpl-rg .rg-reveal { opacity: 0; transform: translateY(14px); }
.tpl-rg.is-opened .rg-reveal { animation: rg-rise .9s cubic-bezier(.2,.9,.3,1) both; }
.tpl-rg.is-opened .rg-reveal.d1 { animation-delay: .05s; }
.tpl-rg.is-opened .rg-reveal.d2 { animation-delay: .2s; }
.tpl-rg.is-opened .rg-reveal.d3 { animation-delay: .35s; }
@keyframes rg-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }

.tpl-rg .rg-scroll { opacity: 0; transform: translateY(18px); transition: opacity .8s ease, transform .8s cubic-bezier(.2,.9,.3,1); }
.tpl-rg .rg-scroll.is-in { opacity: 1; transform: none; }

@media (prefers-reduced-motion: reduce) {
  .tpl-rg .rg-reveal, .tpl-rg.is-opened .rg-reveal { animation: none !important; opacity: 1 !important; transform: none !important; }
  .tpl-rg .rg-scroll { opacity: 1 !important; transform: none !important; transition: none !important; }
}
`;
  return <style>{css}</style>;
}
