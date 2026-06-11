// Guards the GSAP CDN pinning: a version bump without recomputed SRI hashes
// (or a non-CSP-allowed CDN host) would silently break every animated surface
// in production — the browser refuses the script and pages render static.
import { describe, it, expect } from "vitest";
import { GSAP } from "../../config/index.js";

describe("GSAP CDN config", () => {
  it("pins the same version in VERSION and both URLs", () => {
    expect(GSAP.CORE_URL).toContain(`gsap@${GSAP.VERSION}/`);
    expect(GSAP.ST_URL).toContain(`gsap@${GSAP.VERSION}/`);
  });

  it("serves from unpkg.com (the CSP script-src allowlisted CDN)", () => {
    expect(GSAP.CORE_URL.startsWith("https://unpkg.com/")).toBe(true);
    expect(GSAP.ST_URL.startsWith("https://unpkg.com/")).toBe(true);
  });

  it("has real sha384 SRI hashes, not placeholders", () => {
    for (const sri of [GSAP.CORE_SRI, GSAP.ST_SRI]) {
      expect(sri).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/);
      expect(sri.toLowerCase()).not.toContain("todo");
      expect(sri.toLowerCase()).not.toContain("placeholder");
    }
    expect(GSAP.CORE_SRI).not.toBe(GSAP.ST_SRI);
  });
});
