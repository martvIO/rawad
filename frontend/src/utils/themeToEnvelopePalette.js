// Pure mapper: a digital-invitation theme (from digitalThemes.js) -> the
// premium 3D envelope's PHYSICAL palette. The envelope "fully recolors" per
// theme (the user's choice), so every theme drives the matte cardstock
// (`paper`), the glossy wax seal (`wax`), the metallic filigree (`foil` +
// `foilBright`), the cream invitation card (`cardPaper`), and the dark
// calligraphy ink (`cardInk`).
//
// The single most important job here is CONTRAST SAFETY: the card always stays
// light and the ink always stays dark (clamped luminance bands) so the baked
// Arabic/Hebrew calligraphy is legible on light themes (champagne, blush, …)
// AND dark themes (gold, blue, …) alike. No `three` import — kept trivially
// unit-testable and tree-shakeable; the engine converts these hex strings to
// THREE.Color.

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

export function themeToEnvelopePalette(theme) {
  const accent = hexToRgb(theme?.accent);
  const grad = Array.isArray(theme?.gradientStops) ? theme.gradientStops : [];
  const bright = hexToRgb(grad[0] || theme?.sparkleGlow || theme?.accent);
  const bg = hexToRgb(theme?.bg);
  const isLight = luminance(bg) > 0.5;

  // Metallic filigree: the accent itself, plus a brighter catch-light highlight.
  // Lighten `bright` toward white BEFORE clamping so the highlight never collapses
  // to equal `foil` on themes where gradientStops[0] === accent (champagne, blush,
  // pearl, peach, mint, ivorygold) — otherwise the two-tone foil shimmer + sparks
  // go flat single-tone.
  const foil = rgbToHex(clampLum(accent, 0.16, 0.74));
  const foilBright = rgbToHex(clampLum(mix(bright, WHITE, 0.3), 0.62, 0.96));

  // Matte cardstock — follows the theme's lightness so the envelope truly
  // recolors. Dark themes → a deep accent-tinted near-black; light themes → a
  // soft accent-tinted "blush/champagne" cardstock.
  const paper = isLight
    ? rgbToHex(clampLum(mix(WHITE, accent, 0.18), 0.74, 0.90))
    : rgbToHex(clampLum(mix(bg, accent, 0.12), 0.02, 0.10));

  // Glossy wax seal — a deep tone of the accent on every theme so the clearcoat
  // gloss always reads via specular (never washed out), light theme or dark.
  const wax = rgbToHex(clampLum(mix(accent, NEAR_BLACK, 0.6), 0.03, 0.17));

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
