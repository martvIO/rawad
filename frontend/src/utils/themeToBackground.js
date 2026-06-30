// Pure mapper: a digital-invitation theme (from digitalThemes.js) + the groom's
// per-design `background` overrides -> the normalized config the 2D ambience
// renderer (InviteAmbience) consumes. Mirrors themeToEnvelopePalette's "theme
// default, override wins only when valid" contract.
//
// All override slider values are 0..1 (pure data — the renderer maps them to
// px / vmin); colours are "#rrggbb". Theme defaults: fill ← theme.bg, circle
// colour ← theme.accent. `enabled` gates whether the public page swaps the 3D
// world for this custom background (see CelestialAmbience). No DOM/three import,
// so it stays trivially unit-testable.

const HEX6_RE = /^#[0-9a-fA-F]{6}$/;
const isHex6 = (v) => typeof v === "string" && HEX6_RE.test(v);

function hexToRgb(hex) {
  let h = (typeof hex === "string" ? hex : "").trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 || /[^0-9a-f]/i.test(h)) return [0, 0, 0];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
function rgbToHex([r, g, b]) {
  const c = (v) => {
    const s = Math.round(v < 0 ? 0 : v > 255 ? 255 : v).toString(16);
    return s.length === 1 ? "0" + s : s;
  };
  return `#${c(r)}${c(g)}${c(b)}`;
}
// Darken a hex toward black by t (0..1) — used for the default gradient endpoint.
function darken(hex, t) {
  const k = clamp01(t);
  return rgbToHex(hexToRgb(hex).map((v) => v * (1 - k)));
}
// Clamp a number into [min,max]; non-finite → fallback.
function clampNum(v, min, max, fallback) {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return v < min ? min : v > max ? max : v;
}
function clampInt(v, min, max, fallback) {
  const n = clampNum(v, min, max, fallback);
  return Math.round(n);
}

// overrides = {
//   enabled?, color?, gradient?, gradientFrom?, gradientTo?,
//   image?: { url, storagePath, kind } | null, imageOverlay?,   // 0..1
//   circleCount? (0..6), circleColor?, circleSize?, circleOpacity?, circleSoftness?, circleMotion?,
//   petals?, sparkles?
// }
export function resolveBackground(theme, overrides) {
  const o = overrides && typeof overrides === "object" ? overrides : {};

  const color = isHex6(o.color) ? o.color : (theme?.bg || "#07070a");
  const gradient = o.gradient === true;
  const gradFrom = isHex6(o.gradientFrom) ? o.gradientFrom : color;
  const gradTo = isHex6(o.gradientTo) ? o.gradientTo : darken(color, 0.45);
  const fill = gradient
    ? `linear-gradient(180deg, ${gradFrom} 0%, ${gradTo} 100%)`
    : color;

  const image =
    o.image && typeof o.image === "object" && typeof o.image.url === "string"
      ? { url: o.image.url }
      : null;

  return {
    enabled: o.enabled === true,
    fill,
    color,
    gradient,
    gradientFrom: gradFrom,
    gradientTo: gradTo,
    image,
    imageOverlay: clampNum(o.imageOverlay, 0, 1, 0.45),
    circles: {
      count: clampInt(o.circleCount, 0, 6, 3),
      color: isHex6(o.circleColor) ? o.circleColor : (theme?.accent || "#d4a07a"),
      size: clampNum(o.circleSize, 0, 1, 0.5),
      opacity: clampNum(o.circleOpacity, 0, 1, 0.18),
      softness: clampNum(o.circleSoftness, 0, 1, 0.6),
      motion: o.circleMotion !== false,
    },
    petals: o.petals !== false,
    sparkles: o.sparkles !== false,
  };
}

// Exported for unit tests.
export const __test = { isHex6, hexToRgb, rgbToHex, darken, clampNum, clampInt };
