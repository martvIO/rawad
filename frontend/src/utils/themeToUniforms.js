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

export function themeToUniforms(theme) {
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

  return {
    isLight,
    bg,
    core: isLight ? deep : sparkle,
    glow: isLight ? accent : glow,
    accent,
    deep,
    mono: hexToRgb(mono[1] || mono[0] || theme?.accent),
    bloomA,
    bloomB,
  };
}

// Exported for unit tests.
export const __test = { hexToRgb, luminance, petalStops };
