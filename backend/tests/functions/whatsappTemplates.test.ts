// Unit tests for the Meta template helpers (whatsappTemplates.ts): slot naming,
// the CREATE component builder (must match Meta v23.0 example shapes), and the
// content parser. The actual Graph API calls are integration concerns.
import { describe, it, expect } from "vitest";
import {
  INVITE_SLOTS,
  slotParts,
  templateNameForSlot,
  buttonBaseForSlot,
  buildCreateComponents,
  parseTemplateContent,
} from "../../functions/src/whatsappTemplates";

describe("slot helpers", () => {
  it("covers exactly the 4 invite slots", () => {
    expect(INVITE_SLOTS).toEqual(["physical_ar", "physical_he", "digital_ar", "digital_he"]);
  });
  it("splits a slot into type + locale", () => {
    expect(slotParts("digital_ar")).toEqual({ type: "digital", locale: "ar" });
    expect(slotParts("physical_he")).toEqual({ type: "physical", locale: "he" });
  });
  it("deterministic template name + button base per slot", () => {
    expect(templateNameForSlot("digital_ar")).toBe("dawa_invite_digital_ar");
    expect(buttonBaseForSlot("digital_ar")).toBe("https://dawa-aa793.web.app/d");
    expect(buttonBaseForSlot("physical_he")).toBe("https://dawa-aa793.web.app/invite");
  });
});

describe("buildCreateComponents", () => {
  it("BODY carries {{1}} + body_text example; URL button carries a single suffix var + full example URL", () => {
    const comps = buildCreateComponents("digital_ar", {
      bodyText: "مرحبا {{1}}، تمت دعوتك",
      buttonLabel: "افتح الدعوة",
      category: "MARKETING",
      exampleName: "سارة",
    }) as any[];

    const body = comps[0];
    expect(body.type).toBe("BODY");
    expect(body.text).toContain("{{1}}");
    expect(body.example).toEqual({ body_text: [["سارة"]] }); // array-of-arrays per Meta

    const buttons = comps[1];
    expect(buttons.type).toBe("BUTTONS");
    const btn = buttons.buttons[0];
    expect(btn.type).toBe("URL");
    expect(btn.text).toBe("افتح الدعوة");
    expect(btn.url).toBe("https://dawa-aa793.web.app/d/{{1}}"); // single suffix var at the end
    expect(btn.example).toEqual(["https://dawa-aa793.web.app/d/sami/abc123token"]); // flat array, full URL
  });

  it("physical slot uses the /invite base + single-segment example", () => {
    const comps = buildCreateComponents("physical_ar", {
      bodyText: "{{1}}", buttonLabel: "Open", category: "UTILITY",
    }) as any[];
    expect(comps[1].buttons[0].url).toBe("https://dawa-aa793.web.app/invite/{{1}}");
    expect(comps[1].buttons[0].example).toEqual(["https://dawa-aa793.web.app/invite/abc123token"]);
    expect(comps[0].example.body_text).toEqual([["Sara"]]); // default example name
  });
});

describe("parseTemplateContent", () => {
  it("pulls body text + URL button label back out of components", () => {
    const components = [
      { type: "BODY", text: "Hi {{1}}" },
      { type: "BUTTONS", buttons: [{ type: "URL", text: "Open invite", url: "https://x/d/{{1}}" }] },
    ];
    expect(parseTemplateContent(components)).toEqual({ bodyText: "Hi {{1}}", buttonLabel: "Open invite" });
  });
  it("is defensive about missing components", () => {
    expect(parseTemplateContent(undefined)).toEqual({ bodyText: "", buttonLabel: "" });
    expect(parseTemplateContent([{ type: "BODY", text: "only body" }])).toEqual({ bodyText: "only body", buttonLabel: "" });
  });
});
