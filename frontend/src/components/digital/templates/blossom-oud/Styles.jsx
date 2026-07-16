// Scoped CSS for Blossom & Oud, namespaced under .tpl-bo.
// GOTCHA: JS template literal — no backticks or ${ inside the CSS, even in
// comments, or the string terminates and the build breaks.

export function BoStyles({ t }) {
  const css = `
.tpl-bo {
  --bo-paper: ${t.paper};
  --bo-paper-soft: ${t.paperSoft};
  --bo-ink: ${t.paperInk};
  --bo-ink-soft: ${t.paperInkSoft};
  --bo-wax: ${t.wax};
  --bo-trim: ${t.trim};
  --bo-trim-soft: ${t.trimSoft};
  --bo-blossom: ${t.blossom};
  --bo-rule: ${t.rule};
  --bo-bg: ${t.theme.bg};
  --bo-text: ${t.theme.text};
  --bo-text-soft: ${t.theme.textSoft};
  --bo-accent: ${t.theme.accent};
  position: relative;
  background: var(--bo-bg);
  color: var(--bo-text);
  min-height: 100vh;
  overflow-x: hidden;
}

.tpl-bo .bo-track { letter-spacing: .18em; }

/* Soft oud-smoke wash behind everything. */
.tpl-bo .bo-haze {
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background:
    radial-gradient(110% 60% at 50% 0%, var(--bo-paper-soft) 0%, transparent 58%),
    radial-gradient(90% 50% at 50% 100%, var(--bo-paper-soft) 0%, transparent 55%);
  opacity: .7;
}
.tpl-bo .bo-content { position: relative; z-index: 1; }

.tpl-bo .bo-card {
  background: var(--bo-paper); color: var(--bo-ink);
  border: 1px solid var(--bo-rule); border-radius: 4px;
}

/* Wax seal with the couple's monogram. */
.tpl-bo .bo-wax {
  width: 76px; height: 76px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: radial-gradient(circle at 34% 30%, color-mix(in srgb, var(--bo-trim) 88%, white), var(--bo-trim) 58%, color-mix(in srgb, var(--bo-trim) 58%, black) 100%);
  box-shadow: 0 8px 20px -7px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.35);
  color: #4a3a14; font-weight: 900; font-size: 17px;
}

.tpl-bo .bo-reveal { opacity: 0; transform: translateY(14px); }
.tpl-bo.is-opened .bo-reveal { animation: bo-rise .9s cubic-bezier(.2,.9,.3,1) both; }
.tpl-bo.is-opened .bo-reveal.d1 { animation-delay: .05s; }
.tpl-bo.is-opened .bo-reveal.d2 { animation-delay: .2s; }
@keyframes bo-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }

.tpl-bo .bo-scroll { opacity: 0; transform: translateY(18px); transition: opacity .8s ease, transform .8s cubic-bezier(.2,.9,.3,1); }
.tpl-bo .bo-scroll.is-in { opacity: 1; transform: none; }

.tpl-bo .bo-grad {
  background: linear-gradient(135deg, var(--bo-trim), var(--bo-trim-soft), var(--bo-trim));
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
}
.tpl-bo .bo-grad-off { color: var(--bo-trim); }

.tpl-bo[lang="ar"] .bo-track { letter-spacing: normal; }

@media (prefers-reduced-motion: reduce) {
  .tpl-bo .bo-reveal, .tpl-bo.is-opened .bo-reveal { animation: none !important; opacity: 1 !important; transform: none !important; }
  .tpl-bo .bo-scroll { opacity: 1 !important; transform: none !important; transition: none !important; }
}
`;
  return <style>{css}</style>;
}
