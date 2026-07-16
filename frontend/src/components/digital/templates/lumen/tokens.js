// Lumen motif tokens. There is almost nothing to carry — that is the point. Just
// the paper, the ink, the seal and the hairline.
import { getDigitalTheme } from "../../../../styles/digitalThemes.js";

const MOTIFS = {
  lumen:     { paper: "#f7f5f1", paperSoft: "#e4e0d8", paperInk: "#33322e", paperInkSoft: "#6f6d66", seal: "#b8945f", sealInk: "#2f2a1c" },
  lumenNoir: { paper: "#14140f", paperSoft: "#1e1e17", paperInk: "#eeeae0", paperInkSoft: "#a7a49b", seal: "#d6bd93", sealInk: "#2a2418" },
  lumenSnow: { paper: "#ffffff", paperSoft: "#f0ede6", paperInk: "#2e2d2a", paperInkSoft: "#6f6d66", seal: "#a89272", sealInk: "#332c1f" },
};

function lum(hex) {
  const h = (hex || "").replace("#", "");
  if (h.length !== 6) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Unknown/uncurated keys fall back to the native motifs. */
export function lmTokens(themeColor) {
  const theme = getDigitalTheme(themeColor);
  const motifs = MOTIFS[themeColor] || MOTIFS.lumen;
  return {
    ...motifs,
    theme,
    accent: theme.accent,
    isLight: lum(theme.bg) > 0.5,
    maxW: 440,
  };
}
