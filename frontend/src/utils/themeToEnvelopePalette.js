// Pure mapper: a digital-invitation theme (from digitalThemes.js) -> the
// premium 3D envelope's PHYSICAL palette. The envelope reads WHITE by default
// and recolors per theme: each theme drives the matte cardstock (`paper`), the
// glossy wax seal (`wax`), the cream invitation card (`cardPaper`), and the
// dark calligraphy ink (`cardInk`).
//
// The metallic filigree (`foil` + `foilBright`) is ALWAYS gold — white+gold is
// the luxury constant, so the arabesque flap, the gold دعوة seal emblem, the
// hairline edges and the satin-ribbon sheen stay literal metallic gold on every
// theme (the user's choice); only the paper/wax/card recolor.
//
// The other key job here is CONTRAST SAFETY: the card always stays light and the
// ink always stays dark (clamped luminance bands) so the baked Arabic/Hebrew
// calligraphy is legible on light themes (white, champagne, blush, …) AND dark
// themes (gold, blue, …) alike. No `three` import — kept trivially unit-testable
// and tree-shakeable; the engine converts these hex strings to THREE.Color.

function hexToRgb(hex) {
  if (typeof hex !== "string") return [0.5, 0.5, 0.5];
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 || /[^0-9a-f]/i.test(h)) return [0.5, 0.5, 0.5];
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

function rgbToHex([r, g, b]) {
  const c = (v) => {
    const s = Math.round(clamp01(v) * 255).toString(16);
    return s.length === 1 ? "0" + s : s;
  };
  return `#${c(r)}${c(g)}${c(b)}`;
}

function luminance([r, g, b]) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Linear blend of two [r,g,b] arrays (t=0 → a, t=1 → b).
function mix(a, b, t) {
  const k = clamp01(t);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

// Push a colour's luminance into a [min,max] band while preserving its hue,
// by scaling all channels toward/away from black (luminance is linear in rgb).
// A near-black colour (lum→0) is lifted toward neutral by adding a small floor
// first so scaling has a hue to work with.
function clampLum(rgb, min, max) {
  let [r, g, b] = rgb;
  let L = luminance([r, g, b]);
  if (L < 1e-4) {
    // Hueless black → nudge to neutral grey at the band's lower edge.
    return [min, min, min];
  }
  if (L < min) {
    const k = min / L;
    [r, g, b] = [r * k, g * k, b * k];
  } else if (L > max) {
    const k = max / L;
    [r, g, b] = [r * k, g * k, b * k];
  }
  return [clamp01(r), clamp01(g), clamp01(b)];
}

const WHITE = [1, 1, 1];
const IVORY = hexToRgb("#f9f6f0");
const NEAR_BLACK = hexToRgb("#0a0a0d");
const ESPRESSO = hexToRgb("#241405");

// Metallic gold, fixed for ALL themes — the white+gold luxury constant.
// `foil` = the filigree/edge gold; `foilBright` = the catch-light highlight that
// drives the two-tone foil shimmer + the gold sparks in the reveal bursts.
const FOIL = "#caa14e";
const FOIL_BRIGHT = "#f5e4ab";

export function themeToEnvelopePalette(theme) {
  const accent = hexToRgb(theme?.accent);
  const bg = hexToRgb(theme?.bg);
  const isLight = luminance(bg) > 0.5;

  // Filigree is always gold (see header) — independent of the theme accent.
  const foil = FOIL;
  const foilBright = FOIL_BRIGHT;

  // Matte cardstock — follows the theme's lightness so the envelope truly
  // recolors. White/light themes → a soft accent-tinted ivory "stationery" that
  // reads white (the default look). Dark themes → a DEEP JEWEL TONE (not flat
  // black): pull toward the accent hue and lift the band so it reads as
  // emerald/sapphire/oxblood/espresso rather than near-black.
  const paper = isLight
    ? rgbToHex(clampLum(mix(WHITE, accent, 0.18), 0.74, 0.90))
    : rgbToHex(clampLum(mix(bg, accent, 0.34), 0.05, 0.17));

  // Glossy wax seal — a rich JEWEL TONE of the accent on every theme (gold→amber/
  // bronze, rose→oxblood, emerald→forest, blue→sapphire) so the gold-foil emblem
  // pops and the disc reads as COLOURED sealing-wax (never a black puck). Kept a
  // touch darker/more saturated than light paper so the seal stands off the body.
  const wax = rgbToHex(clampLum(mix(accent, NEAR_BLACK, 0.34), 0.12, 0.34));

  // The cream invitation card — ALWAYS light (faint accent wash over ivory) so
  // the dark calligraphy stays legible regardless of theme.
  const cardPaper = rgbToHex(clampLum(mix(IVORY, accent, 0.06), 0.86, 0.985));

  // Calligraphy ink — a dark espresso pulled toward the accent's hue, clamped
  // dark for guaranteed contrast against the cream card.
  const cardInk = rgbToHex(clampLum(mix(accent, ESPRESSO, 0.62), 0.05, 0.24));

  return { foil, foilBright, paper, wax, cardPaper, cardInk, isLight };
}

// Exported for unit tests.
export const __test = { hexToRgb, rgbToHex, luminance, mix, clampLum };
