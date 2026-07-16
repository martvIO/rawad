// Dolce Vita motif tokens — the colours the standard digitalThemes palette does
// not carry: the ivory letter paper, the wax seal, the scratch-off foil, and the
// ink that sits on each. Mirrors destination-love/tokens.js in shape and intent.
//
// Owner rule (2026-07-16): the GROUND stays in the brand family (ivory-gold /
// near-black) and the template owns ONE accent — here the in-brand blue. The
// source design contributes the stationery/scratch language, never its colours.
import { getDigitalTheme } from "../../../../styles/digitalThemes.js";

// `paper` = the ivory letter card, `paperInk` = text on it, `wax` = the seal,
// `foil` = the scratch-off coating, `rule` = hairline dividers/edges.
const MOTIFS = {
  dolceVita: {
    paper: "#fffdf8", paperSoft: "#f2ece0", paperInk: "#22303f", paperInkSoft: "#5d7286",
    wax: "#b3232a", foil: "#c9b48a", foilSoft: "#e4d7bb", rule: "rgba(111,147,184,.45)",
    trim: "#c4a458", sea: "#6f93b8", skyTop: "#eaf1f8", skyLow: "#fdf6e9",
  },
  dolceVitaNotte: {
    paper: "#f9f6f0", paperSoft: "#e6dfd2", paperInk: "#1a2230", paperInkSoft: "#5a6b82",
    wax: "#b3232a", foil: "#5d7286", foilSoft: "#8fa6bd", rule: "rgba(143,184,224,.45)",
    trim: "#c9a84c", sea: "#8fb8e0", skyTop: "#0a0e1a", skyLow: "#141c2e",
  },
  dolceVitaLimone: {
    paper: "#fffef9", paperSoft: "#f5edd6", paperInk: "#332d1a", paperInkSoft: "#6e5f33",
    wax: "#b3232a", foil: "#d9c48c", foilSoft: "#f0e3bf", rule: "rgba(196,164,88,.45)",
    trim: "#c4a458", sea: "#c4a458", skyTop: "#fdf8e6", skyLow: "#fffdf5",
  },
};

/** Relative luminance of #rrggbb → decide light-vs-dark treatments. */
function lum(hex) {
  const h = (hex || "").replace("#", "");
  if (h.length !== 6) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Resolve the full token bundle for a theme key. Unknown/uncurated keys fall
 * back to the native palette's motifs so a stray themeColor can never render an
 * undefined colour (the destination-love bug that shipped once already).
 */
export function dvTokens(themeColor) {
  const theme = getDigitalTheme(themeColor);
  const motifs = MOTIFS[themeColor] || MOTIFS.dolceVita;
  return {
    ...motifs,
    theme,
    // Convenience mirror — sections read t.accent directly.
    accent: theme.accent,
    isLight: lum(theme.bg) > 0.5,
    maxW: 460,
  };
}
