// Minimal theme → solid hex map for wallet passes + the monogram PNG.
//
// The backend cannot import the frontend `digitalThemes.js` (browser ESM with
// many tokens), so we duplicate just the three hexes a pass needs per theme —
// background, primary text, accent — copied verbatim from digitalThemes.js.
// Same approach as the ACCENTS map in digitalOgImage.ts. Keep in sync if the
// palette list changes (15 palettes: 5 dark/white + 10 light luxe).

export interface ThemeHex {
  bg: string;
  text: string;
  accent: string;
}

const THEME_HEX: Record<string, ThemeHex> = {
  gold:      { bg: "#07070a", text: "#fff3c0", accent: "#d4a07a" },
  rose:      { bg: "#1a0d12", text: "#fde6e3", accent: "#e6a3a3" },
  blue:      { bg: "#070a14", text: "#e6efff", accent: "#8fb8e0" },
  emerald:   { bg: "#071210", text: "#e6fff0", accent: "#7ad4a0" },
  white:     { bg: "#f8f6f0", text: "#2a2218", accent: "#a07840" },
  champagne: { bg: "#f7f1e6", text: "#332a1c", accent: "#b8945f" },
  blush:     { bg: "#fbf1ef", text: "#3a2a28", accent: "#cf9085" },
  sage:      { bg: "#edf1e8", text: "#2c3322", accent: "#7f8c5e" },
  dustyblue: { bg: "#eceff4", text: "#262d36", accent: "#6f88a6" },
  lavender:  { bg: "#f1ecf6", text: "#2e2838", accent: "#8d7bab" },
  pearl:     { bg: "#f2f1ee", text: "#2c2a25", accent: "#998f7c" },
  peach:     { bg: "#fbefe6", text: "#3a2c22", accent: "#d08a63" },
  mint:      { bg: "#e8f3ed", text: "#22332c", accent: "#56a385" },
  mauve:     { bg: "#f4ecf0", text: "#352a30", accent: "#a47490" },
  ivorygold: { bg: "#faf5e7", text: "#332d1a", accent: "#c4a458" },
};

const FALLBACK: ThemeHex = THEME_HEX.gold;

/** Resolve a design `themeColor` key to its {bg,text,accent} hexes (gold fallback). */
export function getThemeHex(themeColor?: string | null): ThemeHex {
  return (themeColor && THEME_HEX[themeColor]) || FALLBACK;
}
