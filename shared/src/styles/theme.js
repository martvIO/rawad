// Design tokens for inline-style usage. The CSS in GlobalStyle.jsx keeps its
// own literal hex values (template-string CSS can't read JS constants without
// rebuilding the stylesheet model) — by design, this file and GlobalStyle.jsx
// are the only two places allowed to define the palette.

export const C = {
  bg:        "#07070a",
  gold:      "#c9a84c",
  goldLight: "#f5e6b8",
  goldDim:   "#a09070",
  // Secondary/hint text. Bumped from #7a6a4a (~3.8:1 on #07070a — failed WCAG AA
  // for normal text) to #8a7a58 (~4.8:1) so muted copy stays legible. Keep the
  // matching literals in GlobalStyle.jsx (.field-hint, .section-label, .nav-tab)
  // in sync with this value.
  dim:       "#8a7a58",
  blue:      "#4b9fd4",
  red:       "#d47a4b",
  goldGlow:  "rgba(201,168,76,.15)",
  blueGlow:  "rgba(75,159,212,.15)",
  redGlow:   "rgba(212,80,58,.15)",
};

// ── Scales ────────────────────────────────────────────────────────────────
// Foundation tokens so spacing/type/elevation stop being ad-hoc inline literals.
// Values were chosen to MATCH the literals already in the codebase, so adopting
// a token in a component never shifts the rendered layout — this is a refactor
// aid, not a redesign. Migrate components opportunistically; nothing is forced.

// Spacing scale (px) — 4px base.
export const space = {
  0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 28,
  8: 32, 9: 40, 10: 48, 11: 56, 12: 64, 14: 80,
};

// Border-radius scale (px) — names map to the existing 8/10/12/14/18/20 usages.
export const radius = {
  sm: 8, md: 10, lg: 12, xl: 14, "2xl": 18, pill: 20, round: 9999,
};

// Type scale. Display headings use clamp() per-component; these are the body/UI
// steps already in use (11–28px), plus the weight ramp the palette relies on.
export const type = {
  xs: 11, sm: 12, base: 13, md: 14, lg: 15, xl: 16,
  "2xl": 18, "3xl": 22, "4xl": 28,
  weight: { regular: 400, medium: 600, semibold: 700, bold: 800, black: 900 },
};

// Elevation — shadows tuned for the dark theme; mirror the GlobalStyle button/
// card/modal treatments so inline surfaces can match the utility classes.
export const shadow = {
  sm:        "0 2px 10px rgba(0,0,0,.25)",
  gold:      "0 2px 10px rgba(201,168,76,.18)",
  goldHover: "0 10px 30px rgba(201,168,76,.45)",
  card:      "0 10px 30px rgba(0,0,0,.35)",
  modal:     "0 18px 60px rgba(0,0,0,.5)",
  pop:       "0 18px 50px rgba(0,0,0,.55)",
};

// Z-index scale — keep the handful of existing layers consistent and ordered.
export const z = {
  base: 1, dropdown: 60, header: 100, toast: 999, modal: 1500,
};
