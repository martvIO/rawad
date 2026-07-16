// Gilded Orchard motif tokens — the orchard's own colours: the strung bulbs, the
// lit fountain, the vine silhouettes, the cream card. Palette lifted from the
// 2026-07-15 scaffold (started for this very design before it was parked).
import { getDigitalTheme } from "../../../../styles/digitalThemes.js";

const MOTIFS = {
  gildedOrchard: {
    paper: "#fdf6e9", paperSoft: "#efe2c8", paperInk: "#2b2718", paperInkSoft: "#6b6142",
    bulb: "#ffd76a", bulbGlow: "#ffe9b0", wire: "rgba(201,168,76,.5)",
    vine: "#16203a", water: "#c9a84c", trim: "#c9a84c",
    rule: "rgba(201,168,76,.35)",
  },
  gildedOrchardDusk: {
    paper: "#fdf8ec", paperSoft: "#efe6cf", paperInk: "#2b2718", paperInkSoft: "#6b6142",
    bulb: "#ffd76a", bulbGlow: "#ffe9b0", wire: "rgba(227,195,117,.5)",
    vine: "#141410", water: "#e3c375", trim: "#e3c375",
    rule: "rgba(227,195,117,.35)",
  },
  gildedOrchardDawn: {
    paper: "#fffdf6", paperSoft: "#f0e8d2", paperInk: "#2d2a1c", paperInkSoft: "#6b6142",
    bulb: "#e0b84a", bulbGlow: "#f2dc9a", wire: "rgba(163,130,58,.45)",
    vine: "#c9bb92", water: "#a3823a", trim: "#a3823a",
    rule: "rgba(163,130,58,.35)",
  },
};

function lum(hex) {
  const h = (hex || "").replace("#", "");
  if (h.length !== 6) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Unknown/uncurated keys fall back to the native motifs. */
export function goTokens(themeColor) {
  const theme = getDigitalTheme(themeColor);
  const motifs = MOTIFS[themeColor] || MOTIFS.gildedOrchard;
  return {
    ...motifs,
    theme,
    accent: theme.accent,
    isLight: lum(theme.bg) > 0.5,
    maxW: 440,
  };
}
