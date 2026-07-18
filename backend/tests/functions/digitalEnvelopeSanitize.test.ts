// Unit tests for the 3D-envelope override branch of sanitizeMediaSettings:
// hex-colour validation, star-slider clamping (clamp, never reject), empty-string
// "unset" semantics, and the reset cases. Also asserts `envelope` is a design
// field (so editing it demotes an approved design + reaches the public read).
import { describe, it, expect } from "vitest";
import { sanitizeMediaSettings } from "../../functions/src/api/routes/digital/sanitize";
import { DESIGN_FIELDS } from "../../functions/src/api/routes/digital/constants";

function ok(body: unknown) {
  const r = sanitizeMediaSettings(body);
  if (!r.ok) throw new Error(`expected ok, got error ${r.error}`);
  return r.value;
}

describe("sanitizeMediaSettings — envelope overrides", () => {
  it("is a design field (demotion + public projection)", () => {
    expect(DESIGN_FIELDS.has("envelope")).toBe(true);
  });

  it("accepts a full valid envelope and round-trips only valid keys", () => {
    const v = ok({
      envelope: {
        paper: "#2A211A", wax: "#F4ECE0", foil: "#caa14e",
        cardPaper: "#f9f6f0", cardInk: "#3a2412",
        stars: true, starDensity: 3, starIntensity: 0.5, sealStar: true,
      },
    });
    expect(v.envelope).toEqual({
      paper: "#2a211a", wax: "#f4ece0", foil: "#caa14e",
      cardPaper: "#f9f6f0", cardInk: "#3a2412",
      stars: true, starDensity: 3, starIntensity: 0.5, sealStar: true,
    });
  });

  it("lowercases hex colours", () => {
    expect(ok({ envelope: { foil: "#CAA14E" } }).envelope).toEqual({ foil: "#caa14e" });
  });

  it("rejects a malformed hex colour", () => {
    for (const bad of ["red", "#fff", "#12345g", "caa14e"]) {
      const r = sanitizeMediaSettings({ envelope: { foil: bad } });
      expect(r.ok, `bad=${bad}`).toBe(false);
      if (!r.ok) expect(r.error).toBe("invalid_envelope_color");
    }
  });

  it("drops an empty-string colour (unset that override)", () => {
    expect(ok({ envelope: { foil: "", wax: "#f4ece0" } }).envelope).toEqual({ wax: "#f4ece0" });
  });

  it("clamps star sliders rather than rejecting them", () => {
    expect(ok({ envelope: { starDensity: 99 } }).envelope).toEqual({ starDensity: 4 });
    expect(ok({ envelope: { starDensity: -3 } }).envelope).toEqual({ starDensity: 1 });
    expect(ok({ envelope: { starDensity: 2.7 } }).envelope).toEqual({ starDensity: 3 }); // rounded
    expect(ok({ envelope: { starIntensity: 5 } }).envelope).toEqual({ starIntensity: 1 });
    expect(ok({ envelope: { starIntensity: -1 } }).envelope).toEqual({ starIntensity: 0 });
  });

  it("rejects a non-boolean stars toggle", () => {
    const r = sanitizeMediaSettings({ envelope: { stars: "yes" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("invalid_toggle");
  });

  it("persists the sealStar toggle and rejects a non-boolean value", () => {
    expect(ok({ envelope: { sealStar: true } }).envelope).toEqual({ sealStar: true });
    expect(ok({ envelope: { sealStar: false } }).envelope).toEqual({ sealStar: false });
    expect(ok({ envelope: {} }).envelope).toEqual({}); // absent → unset (default OFF)
    const r = sanitizeMediaSettings({ envelope: { sealStar: "yes" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("invalid_toggle");
  });

  it("accepts the bloom opening style slug", () => {
    expect(ok({ envelope: { style: "bloom" } }).envelope).toEqual({ style: "bloom" });
    expect(ok({ envelope: { style: "classic" } }).envelope).toEqual({ style: "classic" });
  });

  it("accepts + lowercases the bloom-only glow and snow colours", () => {
    expect(ok({ envelope: { glow: "#FFCF9A", snow: "#ECD2D3" } }).envelope)
      .toEqual({ glow: "#ffcf9a", snow: "#ecd2d3" });
  });

  it("rejects a malformed glow/snow colour", () => {
    for (const key of ["glow", "snow"]) {
      const r = sanitizeMediaSettings({ envelope: { [key]: "pink" } });
      expect(r.ok, key).toBe(false);
      if (!r.ok) expect(r.error).toBe("invalid_envelope_color");
    }
  });

  it("round-trips a full bloom design (style + all colour picks)", () => {
    const v = ok({
      envelope: {
        style: "bloom", paper: "#f7e7e8", wax: "#8a2230", foil: "#c98a90",
        glow: "#ffcf9a", snow: "#ecd2d3",
      },
    });
    expect(v.envelope).toEqual({
      style: "bloom", paper: "#f7e7e8", wax: "#8a2230", foil: "#c98a90",
      glow: "#ffcf9a", snow: "#ecd2d3",
    });
  });

  it("treats {} and null as a reset to defaults", () => {
    expect(ok({ envelope: {} }).envelope).toEqual({});
    expect(ok({ envelope: null }).envelope).toEqual({});
  });

  it("rejects a non-object envelope", () => {
    const r = sanitizeMediaSettings({ envelope: 5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("invalid_envelope");
  });
});
