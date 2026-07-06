// Unit tests for the bulk-guest paste parser — the pure validation/dedup/
// normalization behind bulk import. The server re-validates, but this drives
// the preview table and the add loop.
import { describe, it, expect } from "vitest";
import { parseGuestLines, toLocalIL } from "../../utils/bulkGuests.js";

describe("toLocalIL", () => {
  it("normalizes common IL formats to 0XXXXXXXXX", () => {
    expect(toLocalIL("0524264094")).toBe("0524264094");
    expect(toLocalIL("524264094")).toBe("0524264094");
    expect(toLocalIL("+972 52-426-4094")).toBe("0524264094");
    expect(toLocalIL("972524264094")).toBe("0524264094");
  });
  it("rejects implausible numbers", () => {
    expect(toLocalIL("123")).toBeNull();
    expect(toLocalIL("")).toBeNull();
    expect(toLocalIL("05242640941234")).toBeNull();
  });
  it("converts Arabic-Indic / Persian digits (contacts import in-market)", () => {
    expect(toLocalIL("٠٥٢٤٢٦٤٠٩٤")).toBe("0524264094"); // Arabic-Indic
    expect(toLocalIL("۰۵۲۴۲۶۴۰۹۴")).toBe("0524264094"); // Persian
    expect(toLocalIL("٥٢٤٢٦٤٠٩٤")).toBe("0524264094"); // no leading zero
  });
});

describe("parseGuestLines", () => {
  it("parses 'Name, Phone' lines and normalizes the phone", () => {
    const { rows, stats } = parseGuestLines("رواد حجير, 0524264094\nسارة علي, 050-111-2233");
    expect(stats.total).toBe(2);
    expect(stats.valid).toBe(2);
    expect(rows[0]).toMatchObject({ name: "رواد حجير", phone: "0524264094", valid: true, error: "" });
    expect(rows[1].phone).toBe("0501112233");
  });

  it("accepts tab-separated input and ignores blank lines", () => {
    const { stats } = parseGuestLines("رواد حجير\t0524264094\n\n   \n");
    expect(stats.total).toBe(1);
    expect(stats.valid).toBe(1);
  });

  it("flags a single-word name", () => {
    const { rows, stats } = parseGuestLines("رواد, 0524264094");
    expect(rows[0].error).toBe("name");
    expect(stats.invalid).toBe(1);
  });

  it("flags an implausible phone", () => {
    expect(parseGuestLines("رواد حجير, 123").rows[0].error).toBe("phone");
  });

  it("flags duplicates within the paste and against existing", () => {
    const existing = new Set([toLocalIL("0501112233")]);
    const { rows, stats } = parseGuestLines(
      "سارة علي, 0501112233\nرواد حجير, 0524264094\nرواد حجير, 052-426-4094",
      existing,
    );
    expect(rows[0].error).toBe("duplicate");
    expect(rows[1].error).toBe("");
    expect(rows[2].error).toBe("duplicate");
    expect(stats.duplicate).toBe(2);
    expect(stats.valid).toBe(1);
  });
});
