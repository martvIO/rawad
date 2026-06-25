// Unit tests for the pure theme -> celestial shader-uniform mapper. The
// load-bearing behaviour is the dark/light branch (≈11 of 15 themes are light,
// where additive glow would be invisible) and the petal-gradient hex parsing.
import { describe, it, expect } from "vitest";
import { themeToUniforms, __test } from "../../utils/themeToUniforms.js";
import { getDigitalTheme } from "../../styles/digitalThemes.js";

const { hexToRgb, luminance, petalStops } = __test;

describe("hexToRgb", () => {
  it("parses #rrggbb to 0..1 floats", () => {
    expect(hexToRgb("#ffffff")).toEqual([1, 1, 1]);
    expect(hexToRgb("#000000")).toEqual([0, 0, 0]);
  });

  it("expands #rgb shorthand", () => {
    expect(hexToRgb("#fff")).toEqual([1, 1, 1]);
  });

  it("falls back to white on garbage instead of throwing", () => {
    expect(hexToRgb("not-a-hex")).toEqual([1, 1, 1]);
    expect(hexToRgb(undefined)).toEqual([1, 1, 1]);
    // A radial-gradient string must NOT be fed to THREE.Color — guard returns white.
    expect(hexToRgb("radial-gradient(circle, #fff 0%, #000 80%)")).toEqual([1, 1, 1]);
  });
});

describe("luminance / dark-vs-light classification", () => {
  it("treats a near-black background as dark and a cream background as light", () => {
    expect(themeToUniforms(getDigitalTheme("gold")).isLight).toBe(false);
    expect(themeToUniforms(getDigitalTheme("champagne")).isLight).toBe(true);
    expect(themeToUniforms(getDigitalTheme("white")).isLight).toBe(true);
  });

  it("luminance of pure white > 0.5 and pure black < 0.5", () => {
    expect(luminance([1, 1, 1])).toBeGreaterThan(0.5);
    expect(luminance([0, 0, 0])).toBeLessThan(0.5);
  });
});

describe("petalStops", () => {
  it("extracts the two inner hex stops from a radial-gradient string", () => {
    const theme = { petal: "radial-gradient(circle at 30% 30%, #f4d4c4 0%, #c98a78 80%)", accent: "#000000", sparkleGlow: "#111111" };
    expect(petalStops(theme)).toEqual([hexToRgb("#f4d4c4"), hexToRgb("#c98a78")]);
  });

  it("falls back to accent/glow when petal is not a parseable gradient", () => {
    const theme = { petal: "", accent: "#abcdef", sparkleGlow: "#123456" };
    expect(petalStops(theme)).toEqual([hexToRgb("#abcdef"), hexToRgb("#123456")]);
  });
});

describe("themeToUniforms", () => {
  it("emits plain [r,g,b] arrays (no THREE dependency) for every shipped theme", () => {
    for (const key of ["gold", "rose", "blue", "emerald", "white", "champagne", "blush", "sage", "lavender", "ivorygold"]) {
      const u = themeToUniforms(getDigitalTheme(key));
      for (const field of ["bg", "core", "glow", "accent", "deep", "mono", "bloomA", "bloomB"]) {
        expect(Array.isArray(u[field]), `${key}.${field}`).toBe(true);
        expect(u[field]).toHaveLength(3);
        u[field].forEach((c) => {
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(1);
        });
      }
      expect(typeof u.isLight).toBe("boolean");
    }
  });

  it("on dark themes the core is the bright sparkle; on light themes it is the deeper accent", () => {
    const dark = themeToUniforms(getDigitalTheme("gold"));
    // gold sparkle #fff3c0 is brighter than its deepest gradient stop.
    expect(luminance(dark.core)).toBeGreaterThan(luminance(dark.deep) - 0.01);

    const light = themeToUniforms(getDigitalTheme("champagne"));
    // champagne core uses the deep stop, so it is darker than the raw sparkle.
    expect(luminance(light.core)).toBeLessThan(0.8);
  });
});
