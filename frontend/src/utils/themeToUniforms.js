// Pure mapper: a digital-invitation theme object (from digitalThemes.js) ->
// a flat set of colour/flag values the celestial WebGL world feeds into its
// shaders. Kept free of any `three` import so it stays trivially unit-testable
// and tree-shakeable (the engine converts these [r,g,b] arrays to THREE.Color).
//
// The single most important thing this file decides is dark-vs-light: ~11 of
// the 15 themes have *light* backgrounds, where additive-blended glow is
// invisible. `isLight` flips the engine to normal blending + darker motes.

function hexToRgb(hex) {
  if (typeof hex !== "string") return [1, 1, 1];
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 || /[^0-9a-f]/i.test(h)) return [1, 1, 1];
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function luminance([r, g, b]) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// theme.petal is a `radial-gradient(...)` *string*, not a hex — pull the two
// inner stop colours out, falling back to accent/glow if the parse fails.
function petalStops(theme) {
  const found = typeof theme?.petal === "string" ? theme.petal.match(/#([0-9a-f]{3,6})/gi) : null;
  if (found && found.length >= 2) return [hexToRgb(found[0]), hexToRgb(found[1])];
  return [hexToRgb(theme?.accent), hexToRgb(theme?.sparkleGlow)];
}

// `starfield` (optional) is the groom/admin per-design override for the background
// stars: { color?: "#rrggbb", size?: number, opacity?: number }. When a field is
// set it overrides the theme baseline; unset fields fall back to the theme.
export function themeToUniforms(theme, starfield) {
  const bg = hexToRgb(theme?.bg);
  const isLight = luminance(bg) > 0.5;
  const gradient = Array.isArray(theme?.gradientStops) ? theme.gradientStops : [];
  const mono = Array.isArray(theme?.monoStops) ? theme.monoStops : [];
  const [bloomA, bloomB] = petalStops(theme);

  // On dark themes the particle CORE is the bright sparkle and the halo is the
  // softer glow (additive). On light themes we invert the read: the core is the
  // deeper accent so motes are visible against the pale background.
  const sparkle = hexToRgb(theme?.sparkle);
  const accent = hexToRgb(theme?.accent);
  const glow = hexToRgb(theme?.sparkleGlow);
  const deep = hexToRgb(gradient[2] || theme?.accent);

  // Per-design starfield overrides. A custom colour paints BOTH the core + halo;
  // size / opacity are shader multipliers (default 1 = theme baseline).
  const sf = starfield && typeof starfield === "object" ? starfield : null;
  const sfColor = sf && typeof sf.color === "string" ? hexToRgb(sf.color) : null;

  return {
    isLight,
    bg,
    core: sfColor || (isLight ? deep : sparkle),
    glow: sfColor || (isLight ? accent : glow),
    starSize: sf && typeof sf.size === "number" ? sf.size : 1,
    starOpacity: sf && typeof sf.opacity === "number" ? sf.opacity : 1,
    // Scroll-driven entrance-speed multiplier (JS camera-travel scale, not a
    // shader uniform). 1 = baseline; the engine reads it in the camera loop.
    starSpeed: sf && typeof sf.speed === "number" ? sf.speed : 1,
    accent,
    deep,
    mono: hexToRgb(mono[1] || mono[0] || theme?.accent),
    bloomA,
    bloomB,
  };
}

// Exported for unit tests.
export const __test = { hexToRgb, luminance, petalStops };
