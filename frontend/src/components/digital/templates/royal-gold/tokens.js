// Royal Gold motif tokens — the wine wall, the cream bands, the gold frames.
//
// `wine` is the deep accent the bands are torn out of, NOT the page ground
// (that stays theme.bg, a near-black wine so this template sits beside the rest
// of the catalogue). On the ivory variant the roles invert: the wall goes cream
// and the bands go wine, which is why every consumer reads these tokens instead
// of hard-coding a colour.
import { getDigitalTheme } from "../../../../styles/digitalThemes.js";

// `frame` is the ORNAMENT gold — picture frames, the wax seal, diamonds, rules.
// It is decorative and carries no contrast requirement, so it stays bright.
// `frameInk` is the gold used for TEXT on the wall (the intro cue, the hero
// eyebrow, the guest name) and must clear WCAG 1.4.3's 4.5:1 against theme.bg.
// On the two dark grounds the ornament gold already clears it easily, so the two
// are the same colour; on ivory the wall is cream and the bright gold measured
// 3.3:1, so frameInk drops lightness alone (hue 41°/sat ~48% held) — the same
// gold, deeper on cream.
// The ivory value is set by the CUE, not by the eyebrow: the intro cue renders
// at opacity .85, and that blend over cream is what has to clear 4.5:1. #7f642d
// measured 5.1:1 at full opacity but only 3.78:1 once blended — so the token is
// #685224, which clears both (6.80:1 full, 4.77:1 blended). Checking the token
// alone would have shipped a failure. Guarded by royalGoldView.test.jsx.
// `onFrame` is the ink that sits ON the gold (the wall button's label). It is
// NOT bandInk: on ivory the band is wine so bandInk is cream, and cream on gold
// measured 3.3:1. This dark ink clears 4.5:1 on all three golds
// (7.55 / 10.13 / 4.78).
const MOTIFS = {
  royalGold: {
    band: "#fdf8f0", bandSoft: "#efe4d2", bandInk: "#2e1219", bandInkSoft: "#7a4a54",
    wine: "#5e0f22", frame: "#c9a84c", frameSoft: "#e3c375", rose: "#f7ecd9",
    rule: "rgba(201,168,76,.4)", frameInk: "#c9a84c", onFrame: "#2e1219",
  },
  royalGoldNoir: {
    band: "#fdfaf2", bandSoft: "#efe8d6", bandInk: "#22201a", bandInkSoft: "#6b6350",
    wine: "#17171b", frame: "#e3c375", frameSoft: "#f7ecd9", rose: "#faf3e2",
    rule: "rgba(227,195,117,.4)", frameInk: "#e3c375", onFrame: "#2e1219",
  },
  royalGoldIvory: {
    band: "#8f2439", bandSoft: "#6b1729", bandInk: "#faf4ea", bandInkSoft: "#eccfd4",
    wine: "#faf4ea", frame: "#a3823a", frameSoft: "#c9a84c", rose: "#8f2439",
    rule: "rgba(143,36,57,.35)", frameInk: "#685224", onFrame: "#2e1219",
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
