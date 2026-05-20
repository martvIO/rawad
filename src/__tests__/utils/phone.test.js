// Unit tests for phone-number formatting, dialer links, and validation.
import { describe, it, expect } from "vitest";
import { toIntlPhone, telLink, isPlaceholderPhone, validatePhone } from "../../utils/phone.js";

// validatePhone takes a translator; an identity function makes the returned
// error keys assertable directly.
const t = (key) => key;

describe("toIntlPhone", () => {
  it("converts a local 0-prefixed number to 972 form", () => {
    expect(toIntlPhone("0501234567")).toBe("972501234567");
  });

  it("passes through a number already in 972 form", () => {
    expect(toIntlPhone("972501234567")).toBe("972501234567");
  });

  it("passes through a number already in 970 form", () => {
    expect(toIntlPhone("970591234567")).toBe("970591234567");
  });

  it("strips the + from an E.164 number", () => {
    expect(toIntlPhone("+972501234567")).toBe("972501234567");
  });

  it("strips formatting characters", () => {
    expect(toIntlPhone("050-123-4567")).toBe("972501234567");
  });

  it("returns empty string for empty input", () => {
    expect(toIntlPhone("")).toBe("");
  });

  it("returns empty string for null", () => {
    expect(toIntlPhone(null)).toBe("");
  });

  it("returns empty string when there are no digits", () => {
    expect(toIntlPhone("abc")).toBe("");
  });

  it("leaves a non-Israeli international number unchanged", () => {
    expect(toIntlPhone("201234567")).toBe("201234567");
  });
});

describe("telLink", () => {
  it("builds a tel: URL", () => {
    expect(telLink("0501234567")).toBe("tel:0501234567");
  });

  it("strips whitespace from the number", () => {
    expect(telLink("050 123 4567")).toBe("tel:0501234567");
  });

  it("keeps the + prefix for E.164 numbers", () => {
    expect(telLink("+972501234567")).toBe("tel:+972501234567");
  });

  it("returns a bare tel: for null input", () => {
    expect(telLink(null)).toBe("tel:");
  });
});

describe("isPlaceholderPhone", () => {
  it("returns true for a generated +1202555 placeholder", () => {
    expect(isPlaceholderPhone("+12025551234")).toBe(true);
  });

  it("returns false for a real Israeli number", () => {
    expect(isPlaceholderPhone("+972501234567")).toBe(false);
  });

  it("returns false for a non-string value", () => {
    expect(isPlaceholderPhone(12025551234)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isPlaceholderPhone(null)).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isPlaceholderPhone("")).toBe(false);
  });
});

describe("validatePhone", () => {
  describe("E.164 format", () => {
    it("accepts a valid E.164 number", () => {
      expect(validatePhone("+972501234567", t)).toBeNull();
    });

    it("accepts an E.164 number with formatting characters", () => {
      expect(validatePhone("+972 50-123-4567", t)).toBeNull();
    });

    it("accepts the minimum length (8 digits)", () => {
      expect(validatePhone("+12345678", t)).toBeNull();
    });

    it("accepts the maximum length (15 digits)", () => {
      expect(validatePhone("+123456789012345", t)).toBeNull();
    });

    it("rejects an E.164 number that is too short", () => {
      expect(validatePhone("+1234567", t)).toBe("phone_invalid_short");
    });

    it("rejects an E.164 number that is too long", () => {
      expect(validatePhone("+1234567890123456", t)).toBe("phone_invalid_extra");
    });

    it("rejects non-digit characters after the +", () => {
      expect(validatePhone("+9725012ab567", t)).toBe("phone_invalid_digits");
    });
  });

  describe("legacy 10-digit local format", () => {
    it("accepts exactly 10 digits", () => {
      expect(validatePhone("0501234567", t)).toBeNull();
    });

    it("accepts 10 digits with formatting characters", () => {
      expect(validatePhone("050-123-4567", t)).toBeNull();
    });

    it("rejects non-digit characters", () => {
      expect(validatePhone("05012ab567", t)).toBe("phone_invalid_digits");
    });

    it("reports how many digits are missing (singular)", () => {
      expect(validatePhone("050123456", t)).toBe("phone_invalid_short 1 phone_invalid_digit_label");
    });

    it("reports how many digits are missing (plural)", () => {
      expect(validatePhone("0501234", t)).toBe("phone_invalid_short 3 phone_invalid_digits_label");
    });

    it("reports how many extra digits there are (singular)", () => {
      expect(validatePhone("05012345678", t)).toBe("phone_invalid_extra 1 phone_invalid_digit_label");
    });

    it("reports how many extra digits there are (plural)", () => {
      expect(validatePhone("050123456789", t)).toBe("phone_invalid_extra 2 phone_invalid_digits_label");
    });
  });

  describe("empty input", () => {
    it("rejects an empty string", () => {
      expect(validatePhone("", t)).toBe("phone_invalid_short");
    });

    it("rejects null", () => {
      expect(validatePhone(null, t)).toBe("phone_invalid_short");
    });

    it("rejects a whitespace-only string", () => {
      expect(validatePhone("   ", t)).toBe("phone_invalid_short");
    });
  });
});
