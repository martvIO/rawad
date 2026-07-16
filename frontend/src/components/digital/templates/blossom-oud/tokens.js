// Blossom & Oud motif tokens — the colours the standard palette does not carry:
// the ivory card, the gold arch/arabesque, the wax seal, the blossom.
// Owner rule (2026-07-16): brand GROUND + ONE in-brand accent; the source
// contributes the arch/arabesque language, never its colour identity.
import { getDigitalTheme } from "../../../../styles/digitalThemes.js";

const MOTIFS = {
  blossomOud: {
    paper: "#fffbf8", paperSoft: "#f3e3de", paperInk: "#3a2723", paperInkSoft: "#7d5a54",
    wax: "#b3232a", trim: "#c4a458", trimSoft: "#e6d093", blossom: "#c98f8a",
    rule: "rgba(196,164,88,.5)",
  },
  blossomOudNight: {
    paper: "#f8eeec", paperSoft: "#e2cfcc", paperInk: "#2a1c1b", paperInkSoft: "#6b4d4a",
    wax: "#b3232a", trim: "#c9a84c", trimSoft: "#f5e6b8", blossom: "#e6a3a3",
    rule: "rgba(201,168,76,.5)",
  },
  blossomOudGold: {
    paper: "#fffef9", paperSoft: "#f2e9d2", paperInk: "#3a3122", paperInkSoft: "#75643f",
    wax: "#b3232a", trim: "#c4a458", trimSoft: "#e6d093", blossom: "#d8b48a",
    rule: "rgba(196,164,88,.5)",
  },
};

function lum(hex) {
  const h = (hex || "").replace("#", "");
  if (h.length !== 6) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Unknown/uncurated keys fall back to the native motifs — a stray themeColor
 *  can never paint undefined colours. */
export function boTokens(themeColor) {
  const theme = getDigitalTheme(themeColor);
  const motifs = MOTIFS[themeColor] || MOTIFS.blossomOud;
  return {
    ...motifs,
    theme,
    accent: theme.accent, // convenience mirror
    isLight: lum(theme.bg) > 0.5,
    maxW: 440,
  };
}
