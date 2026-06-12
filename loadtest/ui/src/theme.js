// Self-contained palette + spacing tokens for the load-test dashboard.
// Colors are loosely borrowed from frontend/src/styles/theme.js (the gold/blue
// accent family) but this file intentionally has NO imports from frontend/ —
// the dashboard is a standalone local tool.

export const C = {
  // surfaces
  bg: "#0c0d12",
  panel: "#15171f",
  panelAlt: "#1c1f29",
  border: "#2a2e3a",
  borderLight: "#3a3f4d",

  // text
  text: "#e6e8ee",
  textDim: "#9aa0ad",
  textFaint: "#5f6573",

  // accents
  gold: "#c9a84c",
  goldLight: "#f5e6b8",
  blue: "#4b9fd4",
  green: "#4caf6e",
  red: "#d4543a",
  orange: "#d49a4b",
  purple: "#9a7ad4",

  // glows / translucent fills
  goldGlow: "rgba(201,168,76,.15)",
  blueGlow: "rgba(75,159,212,.15)",
  greenGlow: "rgba(76,175,110,.15)",
  redGlow: "rgba(212,84,58,.15)",
};

export const SP = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
};

export const FONT = {
  mono: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
};

// Reusable inline-style fragments.
export const card = {
  background: C.panel,
  border: `1px solid ${C.border}`,
  borderRadius: RADIUS.lg,
  padding: SP.lg,
};

export const input = {
  background: C.bg,
  border: `1px solid ${C.border}`,
  borderRadius: RADIUS.sm,
  color: C.text,
  padding: "6px 8px",
  fontSize: 13,
  fontFamily: FONT.sans,
  outline: "none",
};

export const label = {
  display: "block",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: C.textDim,
  marginBottom: 4,
};

export function button(variant = "default") {
  const base = {
    border: "1px solid transparent",
    borderRadius: RADIUS.sm,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: FONT.sans,
    transition: "filter .12s ease",
  };
  const variants = {
    default: { background: C.panelAlt, color: C.text, borderColor: C.border },
    primary: { background: C.gold, color: "#1a1500", borderColor: C.gold },
    danger: { background: C.red, color: "#fff", borderColor: C.red },
    ghost: { background: "transparent", color: C.textDim, borderColor: C.border },
    blue: { background: C.blue, color: "#001016", borderColor: C.blue },
  };
  return { ...base, ...(variants[variant] || variants.default) };
}

export function chip(kind = "neutral") {
  const map = {
    pass: { background: C.greenGlow, color: C.green, border: C.green },
    fail: { background: C.redGlow, color: C.red, border: C.red },
    warn: { background: "rgba(212,154,75,.15)", color: C.orange, border: C.orange },
    info: { background: C.blueGlow, color: C.blue, border: C.blue },
    neutral: { background: C.panelAlt, color: C.textDim, border: C.border },
  };
  const c = map[kind] || map.neutral;
  return {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    background: c.background,
    color: c.color,
    border: `1px solid ${c.border}`,
  };
}
