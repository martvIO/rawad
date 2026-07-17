// Royal Gold motif tokens — the wine wall, the cream bands, the gold frames.
//
// `wine` is the deep accent the bands are torn out of, NOT the page ground
// (that stays theme.bg, a near-black wine so this template sits beside the rest
// of the catalogue). On the ivory variant the roles invert: the wall goes cream
// and the bands go wine, which is why every consumer reads these tokens instead
// of hard-coding a colour.
import { getDigitalTheme } from "../../../../styles/digitalThemes.js";

const MOTIFS = {
  royalGold: {
    band: "#fdf8f0", bandSoft: "#efe4d2", bandInk: "#2e1219", bandInkSoft: "#7a4a54",
    wine: "#5e0f22", frame: "#c9a84c", frameSoft: "#e3c375", rose: "#f7ecd9",
    rule: "rgba(201,168,76,.4)",
  },
  royalGoldNoir: {
    band: "#fdfaf2", bandSoft: "#efe8d6", bandInk: "#22201a", bandInkSoft: "#6b6350",
    wine: "#17171b", frame: "#e3c375", frameSoft: "#f7ecd9", rose: "#faf3e2",
    rule: "rgba(227,195,117,.4)",
  },
  royalGoldIvory: {
    band: "#8f2439", bandSoft: "#6b1729", bandInk: "#faf4ea", bandInkSoft: "#eccfd4",
    wine: "#faf4ea", frame: "#a3823a", frameSoft: "#c9a84c", rose: "#8f2439",
    rule: "rgba(143,36,57,.35)",
  },
};

/** Unknown/uncurated keys fall back to the native motifs. */
export function rgTokens(themeColor) {
  const theme = getDigitalTheme(themeColor);
  return {
    ...(MOTIFS[themeColor] || MOTIFS.royalGold),
    theme,
    accent: theme.accent,
    maxW: 440,
  };
}
