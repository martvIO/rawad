// Scoped CSS for Lumen, namespaced under .tpl-lm. The whole design is type and
// space, so this sheet is mostly rhythm: generous section padding, a wide serif
// capital scale, and one hairline.
// GOTCHA: JS template literal — no backticks or ${ inside the CSS, even in
// comments, or the string terminates and the build breaks.

export function LmStyles({ t }) {
  const css = `
.tpl-lm {
  --lm-paper: ${t.paper};
  --lm-paper-soft: ${t.paperSoft};
  --lm-ink: ${t.paperInk};
  --lm-ink-soft: ${t.paperInkSoft};
  --lm-seal: ${t.seal};
  --lm-bg: ${t.theme.bg};
  --lm-text: ${t.theme.text};
  --lm-text-soft: ${t.theme.textSoft};
  --lm-accent: ${t.theme.accent};
  --lm-line: ${t.theme.accentLine};
  position: relative;
  background: var(--lm-bg);
  color: var(--lm-text);
  min-height: 100vh;
  overflow-x: hidden;
}

/* The signature: wide serif capitals. Latin/Hebrew only — the lang-scoped rule
   at the bottom cancels the tracking for Arabic, which must never be spaced. */
.tpl-lm .lm-cap {
  font-family: 'Amiri','Frank Ruhl Libre',serif;
  text-transform: uppercase;
  letter-spacing: .26em;
  font-weight: 700;
}

/* Generous, quiet rhythm — the space IS the design. */
.tpl-lm .lm-sec { padding: clamp(46px, 11vw, 78px) 24px; }
.tpl-lm .lm-rule { height: 1px; background: var(--lm-line); border: 0; margin: 0; }
.tpl-lm .lm-panel { background: var(--lm-paper-soft); border-radius: 18px; }

.tpl-lm .lm-reveal { opacity: 0; transform: translateY(10px); }
.tpl-lm.is-opened .lm-reveal { animation: lm-rise 1s cubic-bezier(.2,.9,.3,1) both; }
.tpl-lm.is-opened .lm-reveal.d1 { animation-delay: .06s; }
.tpl-lm.is-opened .lm-reveal.d2 { animation-delay: .22s; }
@keyframes lm-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

.tpl-lm .lm-scroll { opacity: 0; transform: translateY(14px); transition: opacity 1s ease, transform 1s cubic-bezier(.2,.9,.3,1); }
.tpl-lm .lm-scroll.is-in { opacity: 1; transform: none; }

/* Arabic: never spaced (it breaks the cursive joins), and it carries its own
   serif rather than the Latin display face. */
.tpl-lm[lang="ar"] .lm-cap { letter-spacing: normal; text-transform: none; font-family: inherit; }

@media (prefers-reduced-motion: reduce) {
  .tpl-lm .lm-reveal, .tpl-lm.is-opened .lm-reveal { animation: none !important; opacity: 1 !important; transform: none !important; }
  .tpl-lm .lm-scroll { opacity: 1 !important; transform: none !important; transition: none !important; }
}
`;
  return <style>{css}</style>;
}
