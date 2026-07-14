// Unit tests for the `templateId` branch of sanitizeMediaSettings (TASK-TPL-1
// template-registry). Unlike `envelope.style` (a free safe-slug — a cosmetic
// sub-scene that harmlessly falls back to the classic 3D scene), `templateId`
// picks WHICH STRUCTURAL COMPONENT TREE mounts, so it's a fixed enum: a
// mistyped/unknown value must be a hard, visible rejection, not a silent
// runtime fallback. Also asserts `templateId` is a design field (demotion +
// public projection) and that it round-trips PATCH semantics (undefined leaves
// the field untouched, not cleared).
import { describe, it, expect } from "vitest";
import { sanitizeMediaSettings } from "../../functions/src/api/routes/digital/sanitize";
import { DESIGN_FIELDS, TEMPLATE_IDS } from "../../functions/src/api/routes/digital/constants";

function ok(body: unknown) {
  const r = sanitizeMediaSettings(body);
  if (!r.ok) throw new Error(`expected ok, got error ${r.error}`);
  return r.value;
}

describe("sanitizeMediaSettings — templateId", () => {
  it("is a design field (demotion + public projection)", () => {
    expect(DESIGN_FIELDS.has("templateId")).toBe(true);
  });

  it("accepts every currently-registered template id", () => {
    for (const id of TEMPLATE_IDS) {
      expect(ok({ templateId: id }).templateId).toBe(id);
    }
  });

  it("rejects an unrecognized template id", () => {
    const r = sanitizeMediaSettings({ templateId: "not-a-real-template" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("invalid_template_id");
      expect(r.field).toBe("templateId");
    }
  });

  it("rejects a non-string template id", () => {
    const r = sanitizeMediaSettings({ templateId: 5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("invalid_template_id");
  });

  it("leaves the field untouched when omitted (partial PATCH semantics)", () => {
    const v = ok({ brideName: { ar: "س", he: "ש" } });
    expect(v.templateId).toBeUndefined();
  });
});
