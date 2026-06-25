// The generated signup password must ALWAYS satisfy the server's strong-password
// policy (it's set straight into Firebase Auth, then the groom is forced to
// change it). Run many samples to catch a generator that can occasionally emit a
// non-conforming password.
import { describe, it, expect } from "vitest";
import { generateStrongPassword } from "../../functions/src/passwordGen";
import { isStrongPassword } from "../../functions/src/helpers";

describe("generateStrongPassword", () => {
  it("always produces a 16-char password that passes isStrongPassword", () => {
    for (let i = 0; i < 500; i++) {
      const pw = generateStrongPassword();
      expect(pw).toHaveLength(16);
      expect(isStrongPassword(pw)).toBe(true);
    }
  });

  it("includes a symbol (strict superset of the policy) and no look-alikes", () => {
    for (let i = 0; i < 200; i++) {
      const pw = generateStrongPassword();
      expect(/[!@#$%^&*\-_=+]/.test(pw)).toBe(true);
      expect(/[0O1lI]/.test(pw)).toBe(false); // ambiguous chars omitted
    }
  });

  it("does not repeat (CSPRNG, not a constant)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(generateStrongPassword());
    expect(seen.size).toBe(100);
  });
});
