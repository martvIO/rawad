// Destination Love design tokens. Takes the design's themeColor (one of the
// curated `voyage*` palettes) and returns the base digitalThemes object PLUS
// the template's own motif colours (the boarding-pass panel, the flight-path
// dash, the stamp, the sage/sky/terracotta secondary) that the standard theme
// object doesn't carry. Keyed by `theme.key` so each curated recolor variant
// gets its own designed motif set. Pure — no React, safe to call in render.
import { getDigitalTheme } from "../../../../styles/digitalThemes.js";

// Per-palette motif colours. `panel` = the cream/ivory boarding-pass card,
// `panelInk` = text on it, `stamp` = the "invited" ink stamp, `dash` = the
// dashed flight-path stroke, `secondary` = the plane/solid-accent tone,
// `onSecondary` = ink that sits on `secondary` fills. Owner rule (2026-07-15):
// motifs stay inside the WEBSITE's luxury identity — brand-gold family accents,
// classic-envelope cream paper (#f9f6f0), wax-seal red (#b3232a) for the stamp —
// the source design never contributes its color identity.
const MOTIF = {
  voyage: {
    secondary: "#c9a84c", onSecondary: "#2a1c06", sky: "#8fb8e0", ring: "#c9a84c",
    panel: "#f9f6f0", panelSoft: "#efe6d4", panelInk: "#2a2412", panelInkSoft: "#6e5f33",
    stamp: "#b3232a", dash: "rgba(201,168,76,.55)", sceneTop: "#0d0c08", sceneHaze: "#1c160a",
  },
  voyageAzure: {
    secondary: "#8fb8e0", onSecondary: "#101826", sky: "#b8d0f0", ring: "#c9a84c",
    panel: "#f5f7fb", panelSoft: "#dfe7f2", panelInk: "#1a2230", panelInkSoft: "#5a6b82",
    stamp: "#b3232a", dash: "rgba(143,184,224,.5)", sceneTop: "#0a0e1a", sceneHaze: "#111a30",
  },
  voyageSand: {
    secondary: "#c4a458", onSecondary: "#2a1c06", sky: "#ddc488", ring: "#9c8040",
    panel: "#fffdf7", panelSoft: "#f0e8d2", panelInk: "#332d1a", panelInkSoft: "#6e5f33",
    stamp: "#b3232a", dash: "rgba(156,128,64,.5)", sceneTop: "#f2ead6", sceneHaze: "#f5eeda",
  },
};

// Relative luminance of a #rrggbb string → decide light-vs-dark treatments
// (e.g. voyageSand is a light palette). Falls back to "dark" on parse failure.
function isLightBg(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6;
}

export function dlTokens(themeColor) {
  const theme = getDigitalTheme(themeColor);
  const motif = MOTIF[theme.key] || MOTIF.voyage;
  return {
    theme,
    ...motif,
    // Top-level convenience mirror — sections/parts read `t.accent` for labels
    // and eyebrows (previously undefined, silently falling back to inherited
    // color; now the real theme accent).
    accent: theme.accent,
    isLight: isLightBg(theme.bg),
    // Shared geometry so every section lines up.
    maxW: 460,
    pad: 22,
    radius: 20,
  };
}
