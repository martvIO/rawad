// Unit tests for the frontend TEMPLATE_REGISTRY (TASK-TPL-1). The most
// important test here is the fallback guarantee: an already-sent invite link's
// designSnapshot.templateId must NEVER fail to render, even if it's undefined
// (a legacy design minted before this field existed), empty, or an unrecognized
// value (e.g. a template later renamed/removed from the registry).
import { describe, it, expect } from "vitest";
import { TEMPLATE_REGISTRY, TEMPLATE_IDS, getTemplate } from "../../../../components/digital/templates/registry.js";
import { TEMPLATES as SHARED_TEMPLATES, DIGITAL_TEMPLATE_KEYS } from "@dawa/core/data/digitalTemplates.js";
import { DigitalInvitationView } from "../../../../components/digital/DigitalInvitationView.jsx";

describe("TEMPLATE_REGISTRY", () => {
  it("classic wraps the unmodified DigitalInvitationView", () => {
    expect(TEMPLATE_REGISTRY.classic.Component).toBe(DigitalInvitationView);
  });

  it("getTemplate resolves every registered id to its own Component", () => {
    for (const id of TEMPLATE_IDS) {
      expect(getTemplate(id).Component).toBe(TEMPLATE_REGISTRY[id].Component);
    }
  });

  it("falls back to classic for undefined / empty / unrecognized ids", () => {
    const classic = TEMPLATE_REGISTRY.classic;
    expect(getTemplate(undefined)).toBe(classic);
    expect(getTemplate("")).toBe(classic);
    expect(getTemplate("bogus-template-id")).toBe(classic);
    expect(getTemplate(null)).toBe(classic);
  });

  it("stays in sync with the shared digitalTemplates.js metadata (id set)", () => {
    expect(new Set(TEMPLATE_IDS)).toEqual(new Set(DIGITAL_TEMPLATE_KEYS));
    for (const id of TEMPLATE_IDS) {
      expect(SHARED_TEMPLATES[id]).toBeDefined();
    }
  });
});
