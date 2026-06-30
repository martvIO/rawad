// Pure mapper: a digital-invitation theme (from digitalThemes.js) -> the
// premium 3D envelope's PHYSICAL palette. The envelope reads WHITE by default
// and recolors per theme: each theme drives the matte cardstock (`paper`), the
// cream invitation card (`cardPaper`), and the dark calligraphy ink (`cardInk`).
// The wax seal (`wax`) defaults to a fixed creamy-white (theme-independent).
//
// `resolveEnvelopePalette(theme, overrides)` layers the groom's per-design
// envelope overrides (any subset of paper/wax/foil/cardPaper/cardInk + star
// options) ON TOP of the theme defaults — an override wins only when it is a
// valid value; otherwise the theme default stands. This is the function the
// renderer + editor preview call; `themeToEnvelopePalette` stays the pure base.
//
// The metallic filigree (`foil` + `foilBright`) is gold by default — white+gold
// is the luxury constant, so the arabesque, the gold دعوة seal emblem, the
// hairline edges and the satin-ribbon sheen stay metallic gold on every theme
// unless the groom overrides the foil colour (then `foilBright` is auto-derived).
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
const ESPRESSO = hexToRgb("#241405");

// Metallic gold, fixed for ALL themes — the white+gold luxury constant.
// `foil` = the filigree/edge gold; `foilBright` = the catch-light highlight that
// drives the two-tone foil shimmer + the gold sparks in the reveal bursts.
const FOIL = "#caa14e";
const FOIL_BRIGHT = "#f5e4ab";

// Creamy-white sealing wax, fixed for ALL themes by default (the groom can
// override it per design). Replaces the old theme-derived jewel-tone seal so the
// centre disc reads as ivory wax with the gold دعوة emblem stamped on top.
const CREAM_WAX = "#f4ece0";

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

  // Glossy wax seal — a fixed creamy-white on every theme by default (the groom
  // can override it per design via `resolveEnvelopePalette`). Reads as ivory
  // sealing-wax with the gold-foil دعوة emblem stamped on top.
  const wax = CREAM_WAX;

  // The cream invitation card — ALWAYS light (faint accent wash over ivory) so
  // the dark calligraphy stays legible regardless of theme.
  const cardPaper = rgbToHex(clampLum(mix(IVORY, accent, 0.06), 0.86, 0.985));

  // Calligraphy ink — a dark espresso pulled toward the accent's hue, clamped
  // dark for guaranteed contrast against the cream card.
  const cardInk = rgbToHex(clampLum(mix(accent, ESPRESSO, 0.62), 0.05, 0.24));

  return { foil, foilBright, paper, wax, cardPaper, cardInk, isLight };
}

const HEX6_RE = /^#[0-9a-fA-F]{6}$/;
const isHex6 = (v) => typeof v === "string" && HEX6_RE.test(v);

// Lighten a hex toward white by `t` (0..1) — used to auto-derive the bright foil
// catch-light from a groom-chosen foil colour.
function lighten(hex, t) {
  return rgbToHex(mix(hexToRgb(hex), WHITE, clamp01(t)));
}

// Clamp a value into [min,max]; non-finite → `fallback` (which may be undefined).
function clampNum(v, min, max, fallback) {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return v < min ? min : v > max ? max : v;
}

// Resolve the FINAL envelope palette + star options the 3D mesh consumes:
// theme defaults from `themeToEnvelopePalette`, with the groom's per-design
// `overrides` layered on top (only valid values win). Star options ride on the
// same object so the whole envelope config flows through one prop.
//   overrides = {
//     paper?, wax?, foil?, cardPaper?, cardInk?   // "#rrggbb" colour overrides
//     stars?: boolean        // arabesque across flap + shell (default ON)
//     starDensity?: number   // 1..4 tiling frequency (default 2)
//     starIntensity?: number // 0..1 opacity (default null → mesh per-surface)
//   }
export function resolveEnvelopePalette(theme, overrides) {
  const base = themeToEnvelopePalette(theme);
  const o = overrides && typeof overrides === "object" ? overrides : {};
  const pick = (k) => (isHex6(o[k]) ? o[k] : base[k]);

  const foil = pick("foil");
  // Keep the theme's tuned bright when foil is the default; derive a lighter
  // catch-light from the chosen foil when the groom overrides it.
  const foilBright = foil === base.foil ? base.foilBright : lighten(foil, 0.45);

  return {
    ...base,
    paper: pick("paper"),
    wax: pick("wax"),
    cardPaper: pick("cardPaper"),
    cardInk: pick("cardInk"),
    foil,
    foilBright,
    starsEnabled: o.stars !== false,
    starDensity: clampNum(o.starDensity, 1, 4, 2),
    starIntensity: clampNum(o.starIntensity, 0, 1, null),
  };
}

// Exported for unit tests.
export const __test = { hexToRgb, rgbToHex, luminance, mix, clampLum, lighten, clampNum, isHex6 };
