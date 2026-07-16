// Scoped CSS for Sacred Garden, namespaced under .tpl-sg. Colours arrive as CSS
// custom properties set here, so a palette switch is a variable swap.
//
// GOTCHA: this is a JS template literal — a backtick or ${ inside the CSS (even
// in a comment) terminates the string and breaks the build. Keep CSS comments
// free of both.

export function SgStyles({ t }) {
  const css = `
.tpl-sg {
  --sg-paper: ${t.paper};
  --sg-paper-soft: ${t.paperSoft};
  --sg-ink: ${t.paperInk};
  --sg-ink-soft: ${t.paperInkSoft};
  --sg-wax: ${t.wax};
  --sg-trim: ${t.trim};
  --sg-leaf: ${t.leaf};
  --sg-leaf-soft: ${t.leafSoft};
  --sg-rose: ${t.rose};
  --sg-rule: ${t.rule};
  --sg-bg: ${t.theme.bg};
  --sg-text: ${t.theme.text};
  --sg-text-soft: ${t.theme.textSoft};
  --sg-accent: ${t.theme.accent};
  position: relative;
  background: var(--sg-bg);
  color: var(--sg-text);
  min-height: 100vh;
  overflow-x: hidden;
}

/* Arabic must never be letter-spaced (it breaks the cursive joins). Tracking is
   opt-in via .sg-track and cancelled for Arabic at the bottom of this sheet. */
.tpl-sg .sg-track { letter-spacing: .18em; }

/* A paper band: the section sits on cream with torn edges above and below. */
.tpl-sg .sg-band { background: var(--sg-paper); color: var(--sg-ink); position: relative; }

.tpl-sg .sg-card {
  background: var(--sg-paper);
  color: var(--sg-ink);
  border: 1px solid var(--sg-rule);
  border-radius: 4px;
  position: relative;
}
/* Engraved hairline, the way bordered stationery is framed. */
.tpl-sg .sg-card::after {
  content: ""; position: absolute; inset: 6px;
  border: 1px solid var(--sg-rule); opacity: .45; border-radius: 2px;
  pointer-events: none;
}

/* Wax seal, stamped with the couple's monogram. */
.tpl-sg .sg-wax {
  width: 74px; height: 74px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: radial-gradient(circle at 34% 30%, color-mix(in srgb, var(--sg-wax) 76%, white), var(--sg-wax) 60%, color-mix(in srgb, var(--sg-wax) 62%, black) 100%);
  box-shadow: 0 8px 20px -7px rgba(0,0,0,.62), inset 0 1px 0 rgba(255,255,255,.3);
  color: color-mix(in srgb, var(--sg-trim) 82%, white);
  font-weight: 900; font-size: 17px; letter-spacing: .04em;
}
/* The scalloped rim of a real wax blob. */
.tpl-sg .sg-wax::before {
  content: ""; position: absolute; width: 84px; height: 84px; border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--sg-wax) 88%, black) 62%, transparent 63%);
  opacity: .55; z-index: -1;
  -webkit-mask: radial-gradient(circle, #000 60%, transparent 61%);
}

/* Drifting petals — pure CSS, no canvas, so they cost nothing on a weak phone. */
.tpl-sg .sg-petals { position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
.tpl-sg .sg-petal {
  position: absolute; top: -6%;
  width: 10px; height: 10px; border-radius: 60% 0 60% 0;
  background: var(--sg-rose); opacity: .5;
  animation: sg-fall linear infinite;
}
@keyframes sg-fall {
  0%   { transform: translateY(-10vh) translateX(0) rotate(0deg); opacity: 0; }
  10%  { opacity: .5; }
  100% { transform: translateY(112vh) translateX(28px) rotate(320deg); opacity: 0; }
}

.tpl-sg .sg-content { position: relative; z-index: 1; }

/* Reveal choreography. */
.tpl-sg .sg-reveal { opacity: 0; transform: translateY(14px); }
.tpl-sg.is-opened .sg-reveal { animation: sg-rise .9s cubic-bezier(.2,.9,.3,1) both; }
.tpl-sg.is-opened .sg-reveal.d1 { animation-delay: .05s; }
.tpl-sg.is-opened .sg-reveal.d2 { animation-delay: .2s; }
.tpl-sg.is-opened .sg-reveal.d3 { animation-delay: .35s; }
@keyframes sg-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }

.tpl-sg .sg-scroll { opacity: 0; transform: translateY(18px); transition: opacity .8s ease, transform .8s cubic-bezier(.2,.9,.3,1); }
.tpl-sg .sg-scroll.is-in { opacity: 1; transform: none; }

/* Gold script headings. */
.tpl-sg .sg-grad {
  background: linear-gradient(135deg, var(--sg-trim), color-mix(in srgb, var(--sg-trim) 52%, white), var(--sg-trim));
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
}
.tpl-sg .sg-grad-off { color: var(--sg-trim); }

/* The dotted schedule spine. */
.tpl-sg .sg-spine { border-inline-start: 2px dotted var(--sg-rule); }

.tpl-sg[lang="ar"] .sg-track { letter-spacing: normal; }

@media (prefers-reduced-motion: reduce) {
  .tpl-sg .sg-petals { display: none; }
  .tpl-sg .sg-reveal, .tpl-sg.is-opened .sg-reveal { animation: none !important; opacity: 1 !important; transform: none !important; }
  .tpl-sg .sg-scroll { opacity: 1 !important; transform: none !important; transition: none !important; }
}
`;
  return <style>{css}</style>;
}
