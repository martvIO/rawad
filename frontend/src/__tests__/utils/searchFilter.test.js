// Unit tests for the reusable list search/filter helper. Covers query
// normalization (Arabic-Indic digits, diacritics, case), token-AND substring
// matching, phone-aware matching by canonical form, accessor + localized fields,
// and the standalone filterList convenience.
import { describe, it, expect } from "vitest";
import {
  normalizeForSearch,
  matchesQuery,
  filterList,
} from "../../utils/searchFilter.js";

describe("normalizeForSearch", () => {
  it("lowercases and trims", () => {
    expect(normalizeForSearch("  Rawad  ")).toBe("rawad");
  });

  it("converts Arabic-Indic digits to ASCII", () => {
    expect(normalizeForSearch("٠٥٢٤٢٦")).toBe("052426");
  });

  it("converts Persian digits to ASCII", () => {
    expect(normalizeForSearch("۰۵۲")).toBe("052");
  });

  it("strips Arabic tashkeel and folds alef variants", () => {
    // أحمد (with hamza) folds to احمد
    expect(normalizeForSearch("أحمد")).toBe("احمد");
  });

  it("returns empty string for null/undefined", () => {
    expect(normalizeForSearch(null)).toBe("");
    expect(normalizeForSearch(undefined)).toBe("");
  });
});

describe("matchesQuery — text", () => {
  const guest = { name: "رواد حجير", area: "حيفا", phone: "0524264094" };

  it("matches an empty query (no filtering)", () => {
    expect(matchesQuery(guest, "", { fields: ["name"] })).toBe(true);
    expect(matchesQuery(guest, "   ", { fields: ["name"] })).toBe(true);
  });

  it("matches a substring of a text field", () => {
    expect(matchesQuery(guest, "رواد", { fields: ["name", "area"] })).toBe(true);
  });

  it("matches across multiple fields (name + area)", () => {
    expect(matchesQuery(guest, "حجير حيفا", { fields: ["name", "area"] })).toBe(true);
  });

  it("requires ALL tokens to match (token-AND)", () => {
    expect(matchesQuery(guest, "رواد طبريا", { fields: ["name", "area"] })).toBe(false);
  });

  it("does not match when the term is absent", () => {
    expect(matchesQuery(guest, "سامي", { fields: ["name", "area"] })).toBe(false);
  });

  it("folds diacritics in both query and data", () => {
    const g = { name: "أحمد" };
    expect(matchesQuery(g, "احمد", { fields: ["name"] })).toBe(true);
  });
});

describe("matchesQuery — phone", () => {
  const guest = { name: "رواد", phone: "0524264094" };
  const opts = { fields: ["name"], phoneFields: ["phone"] };

  it("matches a full local number against a stored number", () => {
    expect(matchesQuery(guest, "0524264094", opts)).toBe(true);
  });

  it("matches a partial number by canonical substring", () => {
    expect(matchesQuery(guest, "264094", opts)).toBe(true);
  });

  it("matches when query uses the +972 country code", () => {
    expect(matchesQuery(guest, "+972524264094", opts)).toBe(true);
  });

  it("matches an Arabic-Indic digit query", () => {
    expect(matchesQuery(guest, "٠٥٢٤٢٦٤٠٩٤", opts)).toBe(true);
  });

  it("does not match a different number", () => {
    expect(matchesQuery(guest, "0590000000", opts)).toBe(false);
  });

  it("matches a mixed name + phone query", () => {
    expect(matchesQuery(guest, "رواد 264094", opts)).toBe(true);
  });
});

describe("matchesQuery — accessor + localized + array fields", () => {
  it("supports accessor field functions", () => {
    const item = { status: "delivered" };
    expect(matchesQuery(item, "deliver", { fields: [(i) => i.status] })).toBe(true);
  });

  it("resolves localized {ar,he} fields by lang", () => {
    const design = { title: { ar: "حفل الزفاف", he: "חתונה" } };
    expect(matchesQuery(design, "זפ", { fields: ["title"], lang: "he" })).toBe(false);
    expect(matchesQuery(design, "חתונה", { fields: ["title"], lang: "he" })).toBe(true);
    expect(matchesQuery(design, "الزفاف", { fields: ["title"], lang: "ar" })).toBe(true);
  });

  it("searches array-valued fields (e.g. ranks)", () => {
    const guest = { name: "رواد", ranks: ["عائلة العريس", "أصدقاء"] };
    expect(matchesQuery(guest, "أصدقاء", { fields: ["name", (g) => g.ranks] })).toBe(true);
  });
});

describe("filterList", () => {
  const guests = [
    { name: "رواد حجير", phone: "0524264094" },
    { name: "سامي خوري", phone: "0590000000" },
    { name: "أحمد علي", phone: "0521111111" },
  ];

  it("returns all items for an empty query", () => {
    expect(filterList(guests, "", { fields: ["name"] })).toHaveLength(3);
  });

  it("filters by name", () => {
    const out = filterList(guests, "سامي", { fields: ["name"], phoneFields: ["phone"] });
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("سامي خوري");
  });

  it("filters by phone fragment", () => {
    const out = filterList(guests, "111111", { fields: ["name"], phoneFields: ["phone"] });
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("أحمد علي");
  });

  it("returns empty when nothing matches", () => {
    expect(filterList(guests, "زززز", { fields: ["name"] })).toHaveLength(0);
  });
});
