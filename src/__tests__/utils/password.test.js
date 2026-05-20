// Unit tests for password-strength evaluation. Mirrors isStrongPassword in
// functions/src/helpers.ts — keep both in lock-step.
import { describe, it, expect } from "vitest";
import { PASSWORD_RULES, evaluatePassword, isStrongPassword } from "../../utils/password.js";

describe("PASSWORD_RULES", () => {
  it("defines the four documented rules in order", () => {
    expect(PASSWORD_RULES.map((r) => r.id)).toEqual([
      "min_length", "uppercase", "lowercase", "number",
    ]);
  });
});

describe("evaluatePassword", () => {
  it("marks every rule passed for a strong password", () => {
    const result = evaluatePassword("Abcd1234");
    expect(result).toEqual([
      { id: "min_length", passed: true },
      { id: "uppercase", passed: true },
      { id: "lowercase", passed: true },
      { id: "number", passed: true },
    ]);
  });

  it("reports each failing rule individually", () => {
    const byId = Object.fromEntries(
      evaluatePassword("abc").map((r) => [r.id, r.passed]),
    );
    expect(byId.min_length).toBe(false);
    expect(byId.uppercase).toBe(false);
    expect(byId.lowercase).toBe(true);
    expect(byId.number).toBe(false);
  });

  it("does not throw for null and reports all rules failed", () => {
    const result = evaluatePassword(null);
    expect(result.every((r) => r.passed === false)).toBe(true);
  });

  it("does not throw for an empty string", () => {
    const result = evaluatePassword("");
    expect(result.every((r) => r.passed === false)).toBe(true);
  });
});

describe("isStrongPassword", () => {
  it("accepts a password meeting all four rules", () => {
    expect(isStrongPassword("Abcd1234")).toBe(true);
  });

  it("accepts a password at the minimum length boundary (8 chars)", () => {
    expect(isStrongPassword("Abcdfg12")).toBe(true);
  });

  it("rejects a password one character below the minimum length", () => {
    expect(isStrongPassword("Abcdf12")).toBe(false);
  });

  it("rejects a password with no uppercase letter", () => {
    expect(isStrongPassword("abcd1234")).toBe(false);
  });

  it("rejects a password with no lowercase letter", () => {
    expect(isStrongPassword("ABCD1234")).toBe(false);
  });

  it("rejects a password with no digit", () => {
    expect(isStrongPassword("Abcdefgh")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isStrongPassword("")).toBe(false);
  });

  it("rejects null", () => {
    expect(isStrongPassword(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isStrongPassword(undefined)).toBe(false);
  });

  it("rejects a non-string value", () => {
    expect(isStrongPassword(12345678)).toBe(false);
  });
});
