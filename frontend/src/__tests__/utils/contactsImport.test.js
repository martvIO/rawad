// Unit tests for the contacts-file parsers behind "import from contacts".
// parseVcards / parseDelimited are pure; contactsFileToText wraps them with a
// FileReader (browser-only) and is exercised via the Playwright flow instead.
import { describe, it, expect } from "vitest";
import { parseVcards, parseDelimited } from "../../utils/contactsImport.js";

describe("parseVcards", () => {
  it("extracts FN + a mobile TEL from a vCard 3.0 card", () => {
    const vcf = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:رواد حجير",
      "TEL;TYPE=HOME:03-1234567",
      "TEL;TYPE=CELL:+972 52-426-4094",
      "END:VCARD",
    ].join("\r\n");
    const rows = parseVcards(vcf);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("رواد حجير");
    // Prefers the CELL number over the HOME number.
    expect(rows[0].phone).toContain("52-426-4094");
  });

  it("parses multiple cards and builds a name from N when FN is absent", () => {
    const vcf = [
      "BEGIN:VCARD\nVERSION:2.1\nN:علي;سارة;;;\nTEL:0501112233\nEND:VCARD",
      "BEGIN:VCARD\nVERSION:3.0\nFN:محمد أحمد\nTEL;TYPE=IPHONE:0524264094\nEND:VCARD",
    ].join("\n");
    const rows = parseVcards(vcf);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe("سارة علي"); // First Last from N:Last;First
    expect(rows[1].name).toBe("محمد أحمد");
  });

  it("unfolds a continuation line", () => {
    const vcf = "BEGIN:VCARD\nFN:محمد\n  أحمد\nTEL:0524264094\nEND:VCARD";
    const rows = parseVcards(vcf);
    expect(rows[0].name).toBe("محمد أحمد");
  });

  it("skips a card with no phone", () => {
    const vcf = "BEGIN:VCARD\nFN:بدون رقم\nEND:VCARD";
    expect(parseVcards(vcf)).toHaveLength(0);
  });
});

describe("parseDelimited", () => {
  it("parses a CSV with a header and ignores an email column", () => {
    const csv = [
      "Name,Phone,Email",
      "رواد حجير,0524264094,rawad@example.com",
      "سارة علي,050-111-2233,sara@example.com",
    ].join("\n");
    const rows = parseDelimited(csv);
    expect(rows).toHaveLength(2); // header skipped
    expect(rows[0]).toEqual({ name: "رواد حجير", phone: "0524264094" });
    expect(rows[1].phone).toBe("050-111-2233"); // not the email, even though it has digits
  });

  it("honours quoted fields containing commas", () => {
    const csv = '"حجير, رواد",0524264094';
    const rows = parseDelimited(csv);
    expect(rows[0].name).toBe("حجير, رواد");
    expect(rows[0].phone).toBe("0524264094");
  });

  it("accepts tab-separated rows and drops rows without a phone", () => {
    const tsv = "رواد حجير\t0524264094\nبلا رقم\tnotaphone";
    const rows = parseDelimited(tsv);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("رواد حجير");
  });
});
