// Sacred Garden motif tokens — the colours the standard palette does not carry:
// the cream paper, the deep-red wax seal, the botanical greens and the gold
// script trim. Mirrors destination-love/tokens.js in shape and intent.
//
// Owner rule (2026-07-16): brand GROUND + ONE in-brand accent per template. The
// source contributes the garden/stationery language, never its colour identity —
// so the wax stays the brand's wax-red and the trim the brand's gold.
import { getDigitalTheme } from "../../../../styles/digitalThemes.js";

const MOTIFS = {
  sacredGarden: {
    paper: "#fffdf6", paperSoft: "#efe8d5", paperInk: "#2f3323", paperInkSoft: "#636b4c",
    wax: "#b3232a", trim: "#c4a458", leaf: "#7f8c5e", leafSoft: "#a3ad83", rose: "#d9a9a2",
    rule: "rgba(127,140,94,.4)",
  },
  sacredGardenNight: {
    paper: "#f7f4ea", paperSoft: "#e0dccd", paperInk: "#23281f", paperInkSoft: "#5a6350",
    wax: "#b3232a", trim: "#c9a84c", leaf: "#7ad4a0", leafSoft: "#a9e6c6", rose: "#e0b3ad",
    rule: "rgba(122,212,160,.4)",
  },
  sacredGardenRose: {
    paper: "#fffcfa", paperSoft: "#f5e4de", paperInk: "#3d2b28", paperInkSoft: "#7a5a54",
    wax: "#b3232a", trim: "#c4a458", leaf: "#8f9a72", leafSoft: "#b3bc98", rose: "#cf9085",
    rule: "rgba(207,144,133,.4)",
  },
};

function lum(hex) {
  const h = (hex || "").replace("#", "");
  if (h.length !== 6) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Unknown/uncurated keys fall back to the native motifs, so a stray themeColor
 *  can never paint undefined colours. */
export function sgTokens(themeColor) {
  const theme = getDigitalTheme(themeColor);
  const motifs = MOTIFS[themeColor] || MOTIFS.sacredGarden;
  return {
    ...motifs,
    theme,
    accent: theme.accent, // convenience mirror — sections read t.accent
    isLight: lum(theme.bg) > 0.5,
    maxW: 460,
  };
}
