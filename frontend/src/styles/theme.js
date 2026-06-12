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

// Role accent kit. Use `ROLE[user.role]` to get a consistent color/glow/icon
// triplet — every place that branches on role today copy-pastes these values.
export const ROLE = {
  groom:  { color: C.gold, glow: C.goldGlow, icon: "♥" },          // ♥
  driver: { color: C.blue, glow: C.blueGlow, icon: "🚗" },    // 🚗
  admin:  { color: C.red,  glow: C.redGlow,  icon: "🔒" },    // 🔒
};

// Repeated style fragments. Add only when the same object literal appears in
// 3+ files — otherwise it's noise.
export const S = {
  fieldLabel:   { marginBottom: 6, fontSize: 12, color: C.goldDim },
  sectionTitle: { fontSize: 21, fontWeight: 900, color: C.goldLight, marginBottom: 4 },
  sectionSub:   { fontSize: 13, color: C.dim, marginBottom: 20 },
};
