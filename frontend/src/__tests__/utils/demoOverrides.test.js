import { describe, it, expect } from "vitest";
import { applyDemoOverrides, resolveDemoTemplateId } from "../../utils/demoOverrides.js";

// Minimal URLSearchParams-like shim over a plain object for terse test setup.
const sp = (obj) => new URLSearchParams(obj);

describe("applyDemoOverrides", () => {
  it("returns the base unchanged when there are no params", () => {
    const base = { templateId: "classic", themeColor: "gold", fontFamily: "amiri", weddingDate: 111 };
    const out = applyDemoOverrides(base, sp({}));
    expect(out).toEqual(base);
    expect(out).not.toBe(base); // new object
  });

  it("ignores an unknown ?template and keeps the base template", () => {
    const base = { templateId: "classic", themeColor: "gold" };
    const out = applyDemoOverrides(base, sp({ template: "not-a-template" }));
    expect(out.templateId).toBe("classic");
    expect(out.themeColor).toBe("gold");
  });

  it("switches template and resets presentation to the template defaults", () => {
    const base = { templateId: "classic", themeColor: "gold", fontFamily: "amiri", envelopeEnabled: true, envelope: { sealStar: true } };
    const out = applyDemoOverrides(base, sp({ template: "destination-love" }));
    expect(out.templateId).toBe("destination-love");
    expect(out.themeColor).toBe("voyage"); // destination-love default
    expect(out.fontFamily).toBe("aref");
    expect(out.envelopeEnabled).toBe(false); // bespoke default
    expect(out.envelope.style).toBe("classic");
    expect(out.envelope.sealStar).toBe(true); // pre-existing envelope keys preserved
  });

  it("does not reset presentation when ?template equals the base template", () => {
    const base = { templateId: "destination-love", themeColor: "voyageSand", fontFamily: "amiri" };
    const out = applyDemoOverrides(base, sp({ template: "destination-love" }));
    expect(out.themeColor).toBe("voyageSand"); // untouched, no reset
    expect(out.fontFamily).toBe("amiri");
  });

  it("applies a valid ?theme for a curated template only when it is in the curated list", () => {
    const base = { templateId: "classic" };
    // switch to bespoke, then request one of its curated palettes → applied
    const good = applyDemoOverrides(base, sp({ template: "destination-love", theme: "voyageAzure" }));
    expect(good.themeColor).toBe("voyageAzure");
    // request a global-but-not-curated palette → ignored, template default stands
    const bad = applyDemoOverrides(base, sp({ template: "destination-love", theme: "gold" }));
    expect(bad.themeColor).toBe("voyage");
  });

  it("accepts any valid global ?theme for classic (uncurated)", () => {
    const base = { templateId: "classic", themeColor: "gold" };
    const out = applyDemoOverrides(base, sp({ theme: "emerald" }));
    expect(out.themeColor).toBe("emerald");
  });

  it("ignores an unknown ?theme", () => {
    const base = { templateId: "classic", themeColor: "gold" };
    const out = applyDemoOverrides(base, sp({ theme: "chartreuse-of-doom" }));
    expect(out.themeColor).toBe("gold");
  });

  it("applies a valid ?font and ignores an unknown one", () => {
    const base = { templateId: "classic", fontFamily: "amiri" };
    expect(applyDemoOverrides(base, sp({ font: "aref" })).fontFamily).toBe("aref");
    expect(applyDemoOverrides(base, sp({ font: "comic-sans" })).fontFamily).toBe("amiri");
  });

  it("parses a valid ?date to an epoch and ignores an unparseable one", () => {
    const base = { templateId: "classic", weddingDate: 111 };
    const out = applyDemoOverrides(base, sp({ date: "2027-01-01" }));
    expect(out.weddingDate).toBe(new Date("2027-01-01").getTime());
    expect(applyDemoOverrides(base, sp({ date: "not-a-date" })).weddingDate).toBe(111);
  });

  it("does not read ?name (guest name is handled on tokenRec, not the design)", () => {
    const base = { templateId: "classic", brideName: "ليلى" };
    const out = applyDemoOverrides(base, sp({ name: "Someone" }));
    expect(out.brideName).toBe("ليلى");
    expect(out).not.toHaveProperty("guestName");
  });

  it("tolerates a null base", () => {
    const out = applyDemoOverrides(null, sp({ theme: "emerald" }));
    expect(out.themeColor).toBe("emerald");
  });
});

describe("resolveDemoTemplateId", () => {
  it("returns a valid ?template", () => {
    expect(resolveDemoTemplateId({ templateId: "classic" }, sp({ template: "destination-love" }))).toBe("destination-love");
  });
  it("falls back to the base templateId for an unknown ?template", () => {
    expect(resolveDemoTemplateId({ templateId: "classic" }, sp({ template: "nope" }))).toBe("classic");
  });
  it("returns undefined when neither is present", () => {
    expect(resolveDemoTemplateId({}, sp({}))).toBeUndefined();
  });
});
