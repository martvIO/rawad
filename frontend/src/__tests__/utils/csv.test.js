// Unit tests for the CSV builder (the pure part of guest-list export).
import { describe, it, expect } from "vitest";
import { csvCell, toCsv } from "../../utils/csv.js";

describe("csvCell", () => {
  it("leaves plain values unquoted", () => {
    expect(csvCell("رواد")).toBe("رواد");
    expect(csvCell(5)).toBe("5");
  });
  it("quotes and escapes cells with comma/quote/newline", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });
  it("renders null/undefined as empty", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
});

describe("toCsv", () => {
  it("joins headers + rows with CRLF", () => {
    const csv = toCsv(["Name", "Phone"], [["رواد حجير", "0524264094"], ["a,b", "1"]]);
    expect(csv).toBe('Name,Phone\r\nرواد حجير,0524264094\r\n"a,b",1');
  });
  it("returns just the header when there are no rows", () => {
    expect(toCsv(["Name", "Phone"], [])).toBe("Name,Phone");
  });
});
