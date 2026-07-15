// Destination Love design tokens. Takes the design's themeColor (one of the
// curated `voyage*` palettes) and returns the base digitalThemes object PLUS
// the template's own motif colours (the boarding-pass panel, the flight-path
// dash, the stamp, the sage/sky/terracotta secondary) that the standard theme
// object doesn't carry. Keyed by `theme.key` so each curated recolor variant
// gets its own designed motif set. Pure — no React, safe to call in render.
import { getDigitalTheme } from "../../../../styles/digitalThemes.js";

// Per-palette motif colours. `panel` = the cream/ivory boarding-pass card,
// `panelInk` = text on it, `stamp` = the "invited" ink stamp, `dash` = the
// dashed flight-path stroke, `secondary`/`sky` = travel accents.
const MOTIF = {
  voyage: {
    secondary: "#9bb7a1", sky: "#7ebbfa", ring: "#c9a86a",
    panel: "#f3ece4", panelSoft: "#e7ddcf", panelInk: "#2a2620", panelInkSoft: "#6b6152",
    stamp: "#b04a3f", dash: "rgba(201,168,106,.55)", sceneTop: "#241f18", sceneHaze: "#3a2f22",
  },
  voyageAzure: {
    secondary: "#9cc0e8", sky: "#8fb8e0", ring: "#9cc0e8",
    panel: "#eef3fb", panelSoft: "#dbe6f5", panelInk: "#1a2230", panelInkSoft: "#5a6b82",
    stamp: "#c56a5a", dash: "rgba(156,192,232,.55)", sceneTop: "#161d2b", sceneHaze: "#22304a",
  },
  voyageSand: {
    secondary: "#c98a5e", sky: "#4a9e97", ring: "#2f6d5f",
    panel: "#fffdf7", panelSoft: "#f1e8d7", panelInk: "#2a2620", panelInkSoft: "#6b6152",
    stamp: "#c0492f", dash: "rgba(47,109,95,.5)", sceneTop: "#eadfc8", sceneHaze: "#f2e7d2",
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
    isLight: isLightBg(theme.bg),
    // Shared geometry so every section lines up.
    maxW: 460,
    pad: 22,
    radius: 20,
  };
}
