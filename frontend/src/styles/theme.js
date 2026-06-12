// Design tokens for inline-style usage. The CSS in GlobalStyle.jsx keeps its
// own literal hex values (template-string CSS can't read JS constants without
// rebuilding the stylesheet model) — by design, this file and GlobalStyle.jsx
// are the only two places allowed to define the palette.

export const C = {
  bg:        "#07070a",
  gold:      "#c9a84c",
  goldLight: "#f5e6b8",
  goldDim:   "#a09070",
  dim:       "#7a6a4a",
  blue:      "#4b9fd4",
  red:       "#d47a4b",
  goldGlow:  "rgba(201,168,76,.15)",
  blueGlow:  "rgba(75,159,212,.15)",
  redGlow:   "rgba(212,80,58,.15)",
};
