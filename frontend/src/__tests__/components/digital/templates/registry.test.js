// Unit tests for the frontend TEMPLATE_REGISTRY (TASK-TPL-1). The most
// important test here is the fallback guarantee: an already-sent invite link's
// designSnapshot.templateId must NEVER fail to render, even if it's undefined
// (a legacy design minted before this field existed), empty, or an unrecognized
// value (e.g. a template later renamed/removed from the registry).
import { describe, it, expect } from "vitest";
import { TEMPLATE_REGISTRY, TEMPLATE_IDS, getTemplate } from "../../../../components/digital/templates/registry.js";
import { TEMPLATES as SHARED_TEMPLATES, DIGITAL_TEMPLATE_KEYS, getTemplateThemeKeys } from "@dawa/core/data/digitalTemplates.js";
import { DIGITAL_THEME_KEYS } from "../../../../styles/digitalThemes.js";
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

// Invariants every BESPOKE template must satisfy so the editor's curated theme
// picker and hidden-3D-controls logic stay correct. These iterate the current
// template set, so they hold trivially at classic-only and start enforcing the
// moment a bespoke template is registered.
describe("bespoke template invariants", () => {
  const bespokeEntries = DIGITAL_TEMPLATE_KEYS
    .map((id) => [id, SHARED_TEMPLATES[id]])
    .filter(([, t]) => t?.bespoke);

  it("every curated theme key is a real digitalThemes palette", () => {
    for (const [id] of bespokeEntries) {
      const keys = getTemplateThemeKeys(id);
      expect(Array.isArray(keys) && keys.length).toBeTruthy();
      for (const k of keys) expect(DIGITAL_THEME_KEYS).toContain(k);
    }
  });

  it("the native palette (themes[0]) is the template's default themeColor", () => {
    for (const [id, t] of bespokeEntries) {
      expect(t.defaults.themeColor).toBe(getTemplateThemeKeys(id)[0]);
    }
  });

  it("bespoke templates default envelopeEnabled to false (their intro is the sealed-tap, not the 3D envelope)", () => {
    for (const [, t] of bespokeEntries) {
      expect(t.defaults.envelopeEnabled).toBe(false);
    }
  });

  it("classic opts out of curation (full theme list) and is not bespoke", () => {
    expect(getTemplateThemeKeys("classic")).toBeNull();
    expect(SHARED_TEMPLATES.classic.bespoke).toBeFalsy();
  });
});
