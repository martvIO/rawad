// Unit tests for the custom-background branch of sanitizeMediaSettings: hex-colour
// validation, slider clamping (clamp, never reject), int rounding of circleCount,
// boolean coercion, empty-string "unset" semantics, the reset cases, and the
// security rule that the server-managed `image` is ALWAYS stripped from client
// input. Also asserts `background` is a design field (demotes an approved design +
// reaches the public read).
import { describe, it, expect } from "vitest";
import { sanitizeMediaSettings } from "../../functions/src/api/routes/digital/sanitize";
import { DESIGN_FIELDS } from "../../functions/src/api/routes/digital/constants";

function ok(body: unknown) {
  const r = sanitizeMediaSettings(body);
  if (!r.ok) throw new Error(`expected ok, got error ${r.error}`);
  return r.value;
}

describe("sanitizeMediaSettings — custom background", () => {
  it("is a design field (demotion + public projection)", () => {
    expect(DESIGN_FIELDS.has("background")).toBe(true);
  });

  it("accepts a full valid background and round-trips only valid keys", () => {
    const v = ok({
      background: {
        enabled: true,
        color: "#0B1020", gradient: true, gradientFrom: "#0B1020", gradientTo: "#000000",
        imageOverlay: 0.4,
        circleCount: 4, circleColor: "#CAA14E", circleSize: 0.6, circleOpacity: 0.2, circleSoftness: 0.7,
        circleMotion: false, petals: true, sparkles: false,
      },
    });
    expect(v.background).toEqual({
      enabled: true,
      color: "#0b1020", gradient: true, gradientFrom: "#0b1020", gradientTo: "#000000",
      imageOverlay: 0.4,
      circleCount: 4, circleColor: "#caa14e", circleSize: 0.6, circleOpacity: 0.2, circleSoftness: 0.7,
      circleMotion: false, petals: true, sparkles: false,
    });
  });

  it("lowercases hex colours", () => {
    expect(ok({ background: { circleColor: "#CAA14E" } }).background).toEqual({ circleColor: "#caa14e" });
  });

  it("rejects a malformed hex colour", () => {
    for (const bad of ["red", "#fff", "#12345g", "caa14e"]) {
      const r = sanitizeMediaSettings({ background: { color: bad } });
      expect(r.ok, `bad=${bad}`).toBe(false);
      if (!r.ok) expect(r.error).toBe("invalid_background_color");
    }
  });

  it("drops an empty-string colour (unset that override)", () => {
    expect(ok({ background: { color: "", circleColor: "#caa14e" } }).background).toEqual({ circleColor: "#caa14e" });
  });

  it("clamps + rounds circleCount, clamps the unit sliders", () => {
    expect(ok({ background: { circleCount: 99 } }).background).toEqual({ circleCount: 6 });
    expect(ok({ background: { circleCount: -3 } }).background).toEqual({ circleCount: 0 });
    expect(ok({ background: { circleCount: 2.7 } }).background).toEqual({ circleCount: 3 }); // rounded
    expect(ok({ background: { circleSize: 5 } }).background).toEqual({ circleSize: 1 });
    expect(ok({ background: { circleOpacity: -1 } }).background).toEqual({ circleOpacity: 0 });
    expect(ok({ background: { imageOverlay: 9 } }).background).toEqual({ imageOverlay: 1 });
  });

  it("coerces booleans and rejects a non-boolean toggle", () => {
    expect(ok({ background: { enabled: true, petals: false } }).background).toEqual({ enabled: true, petals: false });
    const r = sanitizeMediaSettings({ background: { enabled: "yes" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("invalid_toggle");
  });

  it("strips a client-supplied image (server-managed only)", () => {
    const v = ok({
      background: {
        enabled: true,
        image: { url: "https://evil/x.jpg", storagePath: "digitalMedia/attacker/x" },
      },
    });
    expect(v.background).toEqual({ enabled: true });
    expect((v.background as Record<string, unknown>).image).toBeUndefined();
  });

  it("treats {} and null as a reset to defaults", () => {
    expect(ok({ background: {} }).background).toEqual({});
    expect(ok({ background: null }).background).toEqual({});
  });

  it("rejects a non-object background", () => {
    const r = sanitizeMediaSettings({ background: 5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("invalid_background");
  });
});
