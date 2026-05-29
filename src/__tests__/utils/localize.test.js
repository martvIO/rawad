import { describe, it, expect } from "vitest";
import { localize, localizeItems, localizeList, hasContent } from "../../utils/localize.js";

describe("localize", () => {
  it("returns a legacy plain string as-is for either language", () => {
    expect(localize("كريم", "ar")).toBe("كريم");
    expect(localize("كريم", "he")).toBe("كريم");
  });

  it("picks the requested language from a localized object", () => {
    const v = { ar: "كريم", he: "כרים" };
    expect(localize(v, "ar")).toBe("كريم");
    expect(localize(v, "he")).toBe("כרים");
  });

  it("falls back to the other language when the requested one is empty", () => {
    expect(localize({ ar: "كريم" }, "he")).toBe("كريم"); // Hebrew missing → Arabic
    expect(localize({ he: "כרים" }, "ar")).toBe("כרים"); // Arabic missing → Hebrew
    expect(localize({ ar: "كريم", he: "" }, "he")).toBe("كريم");
  });

  it("returns empty string for null/undefined", () => {
    expect(localize(null, "ar")).toBe("");
    expect(localize(undefined, "he")).toBe("");
    expect(localize({}, "ar")).toBe("");
  });
});

describe("localizeItems", () => {
  it("resolves named keys per item and preserves other keys", () => {
    const items = [
      { icon: "✦", title: { ar: "اللقاء", he: "המפגש" }, body: { ar: "نص", he: "טקסט" } },
    ];
    const out = localizeItems(items, ["title", "body"], "he");
    expect(out[0]).toEqual({ icon: "✦", title: "המפגש", body: "טקסט" });
  });

  it("handles legacy string leaves and missing arrays", () => {
    expect(localizeItems(undefined, ["title"], "ar")).toEqual([]);
    const out = localizeItems([{ title: "legacy" }], ["title"], "he");
    expect(out[0].title).toBe("legacy");
  });
});

describe("localizeList", () => {
  it("maps a mixed string/object list to display strings", () => {
    const list = ["لحم", { ar: "دجاج", he: "עוף" }];
    expect(localizeList(list, "he")).toEqual(["لحم", "עוף"]);
    expect(localizeList(null, "ar")).toEqual([]);
  });
});

describe("hasContent", () => {
  it("detects content in strings and localized objects", () => {
    expect(hasContent("x")).toBe(true);
    expect(hasContent("   ")).toBe(false);
    expect(hasContent({ ar: "كريم" })).toBe(true);
    expect(hasContent({ ar: "", he: "" })).toBe(false);
    expect(hasContent(null)).toBe(false);
    expect(hasContent(undefined)).toBe(false);
  });
});
