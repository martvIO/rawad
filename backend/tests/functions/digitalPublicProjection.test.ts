// @vitest-environment node
//
// projectPublicDoc is the projection applied to the demo design at "Publish to
// demo" (demo.routes.ts) AND to the per-groom public read (public.routes.ts).
// It is the security boundary that keeps design-workflow metadata out of the
// unauthenticated payload, so it's worth locking down directly.
import { describe, it, expect } from "vitest";
import { projectPublicDoc } from "../../functions/src/api/routes/digital/project";
import { PUBLIC_DESIGN_FIELDS, DESIGN_FIELDS } from "../../functions/src/api/routes/digital/constants";

describe("projectPublicDoc — demo publish / public read projection", () => {
  it("keeps guest-facing design fields", () => {
    const out = projectPublicDoc({
      themeColor: "rose",
      fontFamily: "amiri",
      brideName: { ar: "ليلى", he: "לילה" },
      weddingDate: 123,
      media: [{ url: "u", kind: "image", storagePath: "p", order: 0 }],
      envelope: { wax: "#f4ece0", stars: true },
      envelopeEnabled: true,
    })!;
    expect(out.themeColor).toBe("rose");
    expect(out.fontFamily).toBe("amiri");
    expect(out.brideName).toEqual({ ar: "ليلى", he: "לילה" });
    expect(out.weddingDate).toBe(123);
    expect(out.media).toHaveLength(1);
    // The envelope customization (other feature) must reach the public demo.
    expect(out.envelope).toEqual({ wax: "#f4ece0", stars: true });
  });

  it("strips design-workflow metadata (never leaks to a tokenless caller)", () => {
    const out = projectPublicDoc({
      themeColor: "gold",
      designStatus: "approved",
      designRejectionNote: "secret reviewer note",
      designApprovedAt: 999,
      designSubmittedAt: 888,
      defaultDesignId: "xyz",
    })!;
    expect(out.themeColor).toBe("gold");
    expect(out.designStatus).toBeUndefined();
    expect(out.designRejectionNote).toBeUndefined();
    expect(out.designApprovedAt).toBeUndefined();
    expect(out.designSubmittedAt).toBeUndefined();
    expect(out.defaultDesignId).toBeUndefined();
  });

  it("folds a legacy single background into media[]", () => {
    const out = projectPublicDoc({ backgroundUrl: "https://x/y.jpg", backgroundType: "image" })!;
    expect(Array.isArray(out.media)).toBe(true);
    expect((out.media as unknown[]).length).toBe(1);
  });

  it("returns null for an absent doc", () => {
    expect(projectPublicDoc(undefined)).toBeNull();
  });

  it("PUBLIC_DESIGN_FIELDS is a superset of DESIGN_FIELDS (editable → publishable)", () => {
    for (const k of DESIGN_FIELDS) expect(PUBLIC_DESIGN_FIELDS.has(k)).toBe(true);
    // and includes the media arrays the demo renders
    expect(PUBLIC_DESIGN_FIELDS.has("media")).toBe(true);
    expect(PUBLIC_DESIGN_FIELDS.has("heroMedia")).toBe(true);
    // workflow metadata must NOT be publishable
    expect(PUBLIC_DESIGN_FIELDS.has("designStatus")).toBe(false);
  });
});
