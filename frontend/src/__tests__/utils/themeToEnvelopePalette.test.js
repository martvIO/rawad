// Unit tests for the pure theme -> 3D-envelope palette mapper and the override
// resolver. Load-bearing behaviour: the wax seal is a FIXED creamy-white on every
// theme (the locked product decision), gold foil stays the white+gold constant
// unless overridden (then foilBright is auto-derived), card stays light + ink
// stays dark for legibility, and groom overrides win only when valid.
import { describe, it, expect } from "vitest";
import { themeToEnvelopePalette, resolveEnvelopePalette, __test } from "../../utils/themeToEnvelopePalette.js";
import { getDigitalTheme, DIGITAL_THEME_KEYS } from "../../styles/digitalThemes.js";

const { luminance, hexToRgb, isHex6, clampNum, lighten } = __test;

const CREAM_WAX = "#f4ece0";
const FOIL = "#caa14e";
const FOIL_BRIGHT = "#f5e4ab";

describe("themeToEnvelopePalette — wax seal is fixed creamy-white", () => {
  it("returns the creamy-white seal for EVERY theme", () => {
    for (const key of DIGITAL_THEME_KEYS) {
      const pal = themeToEnvelopePalette(getDigitalTheme(key));
      expect(pal.wax, `wax for ${key}`).toBe(CREAM_WAX);
    }
  });

  it("keeps the gold foil constant for every theme", () => {
    for (const key of DIGITAL_THEME_KEYS) {
      const pal = themeToEnvelopePalette(getDigitalTheme(key));
      expect(pal.foil).toBe(FOIL);
      expect(pal.foilBright).toBe(FOIL_BRIGHT);
    }
  });

  it("keeps the card light and the ink dark on every theme (legibility)", () => {
    for (const key of DIGITAL_THEME_KEYS) {
      const pal = themeToEnvelopePalette(getDigitalTheme(key));
      expect(luminance(hexToRgb(pal.cardPaper)), `card lum ${key}`).toBeGreaterThan(0.6);
      expect(luminance(hexToRgb(pal.cardInk)), `ink lum ${key}`).toBeLessThan(0.3);
    }
  });
});

describe("resolveEnvelopePalette — overrides + star options", () => {
  const theme = getDigitalTheme("gold");
  const base = themeToEnvelopePalette(theme);

  it("with no overrides returns the base palette + default star options", () => {
    const r = resolveEnvelopePalette(theme, null);
    expect(r.paper).toBe(base.paper);
    expect(r.wax).toBe(base.wax);
    expect(r.foil).toBe(base.foil);
    expect(r.foilBright).toBe(base.foilBright);
    expect(r.starsEnabled).toBe(true);
    expect(r.starDensity).toBe(2);
    expect(r.starIntensity).toBe(null);
  });

  it("applies a valid colour override and leaves others at the default", () => {
    const r = resolveEnvelopePalette(theme, { wax: "#112233" });
    expect(r.wax).toBe("#112233");
    expect(r.paper).toBe(base.paper);
  });

  it("overriding foil cascades and auto-derives a lightened foilBright", () => {
    const r = resolveEnvelopePalette(theme, { foil: "#112233" });
    expect(r.foil).toBe("#112233");
    expect(r.foilBright).toBe(lighten("#112233", 0.45));
    expect(r.foilBright).not.toBe(base.foilBright);
  });

  it("ignores an invalid hex override and falls back to the default", () => {
    expect(resolveEnvelopePalette(theme, { wax: "red" }).wax).toBe(base.wax);
    expect(resolveEnvelopePalette(theme, { wax: "#fff" }).wax).toBe(base.wax);
    expect(resolveEnvelopePalette(theme, { foil: "#12345g" }).foil).toBe(base.foil);
  });

  it("honors stars:false and clamps out-of-range star sliders", () => {
    expect(resolveEnvelopePalette(theme, { stars: false }).starsEnabled).toBe(false);
    expect(resolveEnvelopePalette(theme, { starDensity: 99 }).starDensity).toBe(4);
    expect(resolveEnvelopePalette(theme, { starDensity: -5 }).starDensity).toBe(1);
    expect(resolveEnvelopePalette(theme, { starIntensity: 5 }).starIntensity).toBe(1);
    expect(resolveEnvelopePalette(theme, { starIntensity: -1 }).starIntensity).toBe(0);
  });
});

describe("helpers", () => {
  it("isHex6 only accepts #rrggbb", () => {
    expect(isHex6("#aabbcc")).toBe(true);
    expect(isHex6("#ABC123")).toBe(true);
    expect(isHex6("#abc")).toBe(false);
    expect(isHex6("aabbcc")).toBe(false);
    expect(isHex6(42)).toBe(false);
  });

  it("clampNum clamps in-band and falls back to default on non-finite", () => {
    expect(clampNum(3, 1, 4, 2)).toBe(3);
    expect(clampNum(9, 1, 4, 2)).toBe(4);
    expect(clampNum(-9, 1, 4, 2)).toBe(1);
    expect(clampNum("x", 1, 4, 2)).toBe(2);
    expect(clampNum(undefined, 0, 1, null)).toBe(null);
  });
});
