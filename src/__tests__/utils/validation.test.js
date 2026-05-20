// Unit tests for form-field validators.
import { describe, it, expect } from "vitest";
import { validateName } from "../../utils/validation.js";

const t = (key) => key;

describe("validateName", () => {
  it("rejects a single-word name", () => {
    expect(validateName("Ahmad", t)).toBe("name_invalid_words");
  });

  it("accepts a two-word name", () => {
    expect(validateName("Ahmad Khalil", t)).toBeNull();
  });

  it("accepts a name with three or more words", () => {
    expect(validateName("Ahmad Khalil Mansour", t)).toBeNull();
  });

  it("collapses extra whitespace between words", () => {
    expect(validateName("  Ahmad   Khalil  ", t)).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(validateName("", t)).toBe("name_invalid_words");
  });

  it("rejects a whitespace-only string", () => {
    expect(validateName("    ", t)).toBe("name_invalid_words");
  });

  it("accepts a two-word Arabic name", () => {
    expect(validateName("محمد أحمد", t)).toBeNull();
  });

  it("accepts a two-word Hebrew name", () => {
    expect(validateName("דוד כהן", t)).toBeNull();
  });

  it("rejects a single Arabic word", () => {
    expect(validateName("محمد", t)).toBe("name_invalid_words");
  });
});
