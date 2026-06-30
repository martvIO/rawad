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
        stars: true, starDensity: 3, starIntensity: 0.5,
      },
    });
    expect(v.envelope).toEqual({
      paper: "#2a211a", wax: "#f4ece0", foil: "#caa14e",
      cardPaper: "#f9f6f0", cardInk: "#3a2412",
      stars: true, starDensity: 3, starIntensity: 0.5,
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
