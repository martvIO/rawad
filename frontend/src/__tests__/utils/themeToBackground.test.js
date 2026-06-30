// Unit tests for the pure theme + overrides -> custom-background config mapper.
// Load-bearing behaviour: defaults derive from the theme (fill ← bg, circle
// colour ← accent), `enabled` defaults OFF, overrides win only when valid, the
// 0..1 sliders + 0..6 count clamp, gradient builds a CSS string, and a malformed
// image is dropped.
import { describe, it, expect } from "vitest";
import { resolveBackground, __test } from "../../utils/themeToBackground.js";
import { getDigitalTheme, DIGITAL_THEME_KEYS } from "../../styles/digitalThemes.js";

const { isHex6, darken, clampInt } = __test;

describe("resolveBackground — defaults", () => {
  it("derives fill from theme.bg and circle colour from theme.accent for every theme", () => {
    for (const key of DIGITAL_THEME_KEYS) {
      const theme = getDigitalTheme(key);
      const bg = resolveBackground(theme, {});
      expect(bg.enabled, `enabled default for ${key}`).toBe(false);
      expect(bg.color, `fill for ${key}`).toBe(theme.bg);
      expect(bg.fill).toBe(theme.bg); // solid (no gradient) → fill === color
      expect(bg.circles.color, `circle colour for ${key}`).toBe(theme.accent);
      expect(bg.image).toBeNull();
      expect(bg.petals).toBe(true);
      expect(bg.sparkles).toBe(true);
      expect(bg.circles.motion).toBe(true);
    }
  });

  it("uses sensible circle defaults", () => {
    const bg = resolveBackground(getDigitalTheme("gold"), {});
    expect(bg.circles.count).toBe(3);
    expect(bg.circles.size).toBeCloseTo(0.5);
    expect(bg.circles.opacity).toBeCloseTo(0.18);
    expect(bg.circles.softness).toBeCloseTo(0.6);
    expect(bg.imageOverlay).toBeCloseTo(0.45);
  });
});

describe("resolveBackground — overrides win only when valid", () => {
  const theme = getDigitalTheme("gold");

  it("honours enabled + valid colour overrides", () => {
    const bg = resolveBackground(theme, { enabled: true, color: "#112233", circleColor: "#abcdef" });
    expect(bg.enabled).toBe(true);
    expect(bg.color).toBe("#112233");
    expect(bg.circles.color).toBe("#abcdef");
  });

  it("falls back to theme defaults for a malformed colour", () => {
    const bg = resolveBackground(theme, { color: "not-a-hex" });
    expect(bg.color).toBe(theme.bg);
  });

  it("builds a CSS gradient string when gradient is enabled", () => {
    const bg = resolveBackground(theme, { gradient: true, gradientFrom: "#000000", gradientTo: "#ffffff" });
    expect(bg.fill).toBe("linear-gradient(180deg, #000000 0%, #ffffff 100%)");
  });

  it("clamps the sliders and the circle count", () => {
    expect(resolveBackground(theme, { circleCount: 99 }).circles.count).toBe(6);
    expect(resolveBackground(theme, { circleCount: -5 }).circles.count).toBe(0);
    expect(resolveBackground(theme, { circleSize: 9 }).circles.size).toBe(1);
    expect(resolveBackground(theme, { circleOpacity: -1 }).circles.opacity).toBe(0);
    expect(resolveBackground(theme, { imageOverlay: 9 }).imageOverlay).toBe(1);
  });

  it("accepts a well-formed image and drops a malformed one", () => {
    expect(resolveBackground(theme, { image: { url: "https://x/y.jpg", storagePath: "p" } }).image).toEqual({ url: "https://x/y.jpg" });
    expect(resolveBackground(theme, { image: { storagePath: "p" } }).image).toBeNull();
    expect(resolveBackground(theme, { image: null }).image).toBeNull();
  });

  it("motion / petals / sparkles default on, off only when explicitly false", () => {
    expect(resolveBackground(theme, { circleMotion: false, petals: false, sparkles: false }))
      .toMatchObject({ petals: false, sparkles: false, circles: { motion: false } });
  });
});

describe("resolveBackground — helpers", () => {
  it("isHex6 validates 6-digit hex only", () => {
    expect(isHex6("#caa14e")).toBe(true);
    expect(isHex6("#fff")).toBe(false);
    expect(isHex6("caa14e")).toBe(false);
  });
  it("darken pulls toward black", () => {
    expect(darken("#ffffff", 0)).toBe("#ffffff");
    expect(darken("#ffffff", 1)).toBe("#000000");
    expect(darken("#ffffff", 0.5)).toBe("#808080");
  });
  it("clampInt rounds and clamps", () => {
    expect(clampInt(2.7, 0, 6, 3)).toBe(3);
    expect(clampInt(99, 0, 6, 3)).toBe(6);
    expect(clampInt("x", 0, 6, 3)).toBe(3);
  });
});
