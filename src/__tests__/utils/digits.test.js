// Unit tests for Arabic-Indic → Western digit normalization.
import { describe, it, expect } from "vitest";
import { toWesternDigits, westernizeDeep, PRESERVE_KEYS } from "../../utils/digits.js";

describe("toWesternDigits", () => {
  it("converts Arabic-Indic digits to Western", () => {
    expect(toWesternDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
  });

  it("converts Extended Arabic-Indic (Persian) digits to Western", () => {
    expect(toWesternDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
  });

  it("leaves Arabic letters and punctuation untouched", () => {
    expect(toWesternDigits("صيف ٢٠٢٣")).toBe("صيف 2023");
    expect(toWesternDigits("١٥–٢٠ دقيقة")).toBe("15–20 دقيقة");
  });

  it("leaves already-Western strings unchanged", () => {
    expect(toWesternDigits("Haifa, Main St, 12")).toBe("Haifa, Main St, 12");
  });

  it("handles mixed Arabic and Western digits", () => {
    expect(toWesternDigits("شارع النبي ٨٦")).toBe("شارع النبي 86");
  });

  it("is stable across repeated calls (global regex lastIndex not leaked)", () => {
    expect(toWesternDigits("٧:٠٠")).toBe("7:00");
    expect(toWesternDigits("٧:٠٠")).toBe("7:00");
    expect(toWesternDigits("٨:٣٠")).toBe("8:30");
  });

  it("returns non-strings unchanged", () => {
    expect(toWesternDigits(42)).toBe(42);
    expect(toWesternDigits(null)).toBe(null);
    expect(toWesternDigits(undefined)).toBe(undefined);
  });

  it("returns the empty string unchanged", () => {
    expect(toWesternDigits("")).toBe("");
  });
});

describe("westernizeDeep", () => {
  it("converts strings nested in objects and arrays", () => {
    const input = {
      name: "أحمد",
      phone: "٠٥٠١٢٣٤٥٦٧",
      story: [{ when: "صيف ٢٠٢٣" }, { when: "خريف ٢٠٢٤" }],
    };
    expect(westernizeDeep(input)).toEqual({
      name: "أحمد",
      phone: "0501234567",
      story: [{ when: "صيف 2023" }, { when: "خريف 2024" }],
    });
  });

  it("preserves password fields verbatim", () => {
    const input = { username: "user٢", password: "٢٠٢٣secret", newPassword: "pass۹" };
    const out = westernizeDeep(input);
    expect(out.username).toBe("user2");
    expect(out.password).toBe("٢٠٢٣secret");
    expect(out.newPassword).toBe("pass۹");
  });

  it("does not mutate the input object", () => {
    const input = { phone: "٠٥٠" };
    westernizeDeep(input);
    expect(input.phone).toBe("٠٥٠");
  });

  it("leaves numbers, booleans, and null intact", () => {
    expect(westernizeDeep({ n: 5, ok: true, x: null })).toEqual({ n: 5, ok: true, x: null });
  });

  it("exposes the preserved keys", () => {
    expect(PRESERVE_KEYS.has("password")).toBe(true);
    expect(PRESERVE_KEYS.has("confirmPassword")).toBe(true);
  });
});
