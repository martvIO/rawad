// Unit tests for the server-side validation/authorization helpers. Pure logic
// — no emulator needed. assertAdmin throws the real firebase-functions
// HttpsError, so `.code` is asserted directly.
import { describe, it, expect } from "vitest";
import {
  getClaims,
  assertAdmin,
  isUsername,
  isE164,
  isRole,
  isFiniteInRange,
  normalisePhoneForMatching,
  isStrongPassword,
  normalisePhone,
  phoneIndexKey,
  syntheticEmail,
} from "../../functions/src/helpers";

// Capture a thrown value so its `.code` / `.message` can be asserted.
function grabError(fn: () => unknown): any {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return null;
}

describe("getClaims", () => {
  it("returns an empty object when there is no auth", () => {
    expect(getClaims({} as any)).toEqual({});
  });

  it("returns an empty object when auth has no token", () => {
    expect(getClaims({ auth: { uid: "u1" } } as any)).toEqual({});
  });

  it("extracts the claim object from the auth token", () => {
    const req = { auth: { uid: "u1", token: { role: "admin", username: "boss" } } };
    expect(getClaims(req as any)).toEqual({ role: "admin", username: "boss" });
  });
});

describe("assertAdmin", () => {
  it("throws unauthenticated when there is no auth", () => {
    const err = grabError(() => assertAdmin({} as any));
    expect(err).toBeTruthy();
    expect(err.code).toBe("unauthenticated");
  });

  it("throws permission-denied for a non-admin role", () => {
    const req = { auth: { uid: "u1", token: { role: "groom" } } };
    const err = grabError(() => assertAdmin(req as any));
    expect(err).toBeTruthy();
    expect(err.code).toBe("permission-denied");
  });

  it("throws permission-denied when the role claim is missing", () => {
    const req = { auth: { uid: "u1", token: {} } };
    expect(grabError(() => assertAdmin(req as any)).code).toBe("permission-denied");
  });

  it("returns the caller uid for an admin", () => {
    const req = { auth: { uid: "admin-uid", token: { role: "admin" } } };
    expect(assertAdmin(req as any)).toBe("admin-uid");
  });
});

describe("isUsername", () => {
  it("accepts a minimal two-character username", () => {
    expect(isUsername("ab")).toBe(true);
  });

  it("accepts allowed punctuation (dot, underscore, dash)", () => {
    expect(isUsername("user.name_1-2")).toBe(true);
  });

  it("accepts a 60-character username", () => {
    expect(isUsername("a".repeat(60))).toBe(true);
  });

  it("rejects a single character", () => {
    expect(isUsername("a")).toBe(false);
  });

  it("rejects a 61-character username", () => {
    expect(isUsername("a".repeat(61))).toBe(false);
  });

  it("rejects whitespace", () => {
    expect(isUsername("user name")).toBe(false);
  });

  it("rejects non-Latin characters", () => {
    expect(isUsername("مستخدم")).toBe(false);
  });

  it("rejects a non-string value", () => {
    expect(isUsername(12345)).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isUsername("")).toBe(false);
  });
});

describe("isE164", () => {
  it("accepts a valid Israeli E.164 number", () => {
    expect(isE164("+972501234567")).toBe(true);
  });

  it("accepts the minimum length (7 digits)", () => {
    expect(isE164("+1234567")).toBe(true);
  });

  it("accepts the maximum length (15 digits)", () => {
    expect(isE164("+1" + "2".repeat(13))).toBe(true);
  });

  it("rejects a number that is too short", () => {
    expect(isE164("+123456")).toBe(false);
  });

  it("rejects a number that is too long (16 digits)", () => {
    expect(isE164("+1" + "2".repeat(15))).toBe(false);
  });

  it("rejects a leading zero after the +", () => {
    expect(isE164("+0123456789")).toBe(false);
  });

  it("rejects a number without the + prefix", () => {
    expect(isE164("972501234567")).toBe(false);
  });

  it("rejects non-digit characters", () => {
    expect(isE164("+97250abc12")).toBe(false);
  });

  it("rejects a non-string value", () => {
    expect(isE164(972501234567)).toBe(false);
  });
});

describe("isRole", () => {
  it("accepts the three valid roles", () => {
    expect(isRole("groom")).toBe(true);
    expect(isRole("driver")).toBe(true);
    expect(isRole("admin")).toBe(true);
  });

  it("rejects a capitalized role", () => {
    expect(isRole("Admin")).toBe(false);
  });

  it("rejects an unknown role", () => {
    expect(isRole("superuser")).toBe(false);
  });

  it("rejects null and undefined", () => {
    expect(isRole(null)).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});

describe("isFiniteInRange", () => {
  it("accepts a value inside the range", () => {
    expect(isFiniteInRange(50, 0, 90)).toBe(true);
  });

  it("accepts the inclusive lower bound", () => {
    expect(isFiniteInRange(0, 0, 90)).toBe(true);
  });

  it("accepts the inclusive upper bound", () => {
    expect(isFiniteInRange(90, 0, 90)).toBe(true);
  });

  it("accepts a negative coordinate within range", () => {
    expect(isFiniteInRange(-33.86, -90, 90)).toBe(true);
  });

  it("rejects a value below the range", () => {
    expect(isFiniteInRange(-1, 0, 90)).toBe(false);
  });

  it("rejects a value above the range", () => {
    expect(isFiniteInRange(91, 0, 90)).toBe(false);
  });

  it("rejects NaN", () => {
    expect(isFiniteInRange(NaN, 0, 90)).toBe(false);
  });

  it("rejects Infinity", () => {
    expect(isFiniteInRange(Infinity, 0, 90)).toBe(false);
  });

  it("rejects a numeric string", () => {
    expect(isFiniteInRange("50", 0, 90)).toBe(false);
  });
});

describe("normalisePhoneForMatching", () => {
  it("strips the +972 country code", () => {
    expect(normalisePhoneForMatching("+972501234567")).toBe("501234567");
  });

  it("strips a national leading zero", () => {
    expect(normalisePhoneForMatching("0501234567")).toBe("501234567");
  });

  it("strips the 00972 international prefix", () => {
    expect(normalisePhoneForMatching("00972501234567")).toBe("501234567");
  });

  it("strips the +970 Palestinian code", () => {
    expect(normalisePhoneForMatching("+970591234567")).toBe("591234567");
  });

  it("returns empty string for a non-string value", () => {
    expect(normalisePhoneForMatching(12345 as any)).toBe("");
  });

  it("returns empty string when there are no digits", () => {
    expect(normalisePhoneForMatching("abc")).toBe("");
  });

  it("agrees with the client normalizer on equivalent forms", () => {
    const forms = ["+972501234567", "972501234567", "00972501234567", "0501234567"];
    expect(new Set(forms.map(normalisePhoneForMatching)).size).toBe(1);
  });
});

describe("isStrongPassword", () => {
  it("accepts a password meeting every rule", () => {
    expect(isStrongPassword("Abcd1234")).toBe(true);
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(isStrongPassword("Abcd12")).toBe(false);
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

  it("rejects a non-string value", () => {
    expect(isStrongPassword(null)).toBe(false);
  });
});

describe("normalisePhone", () => {
  it("converts a local 0-prefixed number to E.164", () => {
    expect(normalisePhone("0501234567")).toBe("+972501234567");
  });

  it("adds the + to a bare 972 number", () => {
    expect(normalisePhone("972501234567")).toBe("+972501234567");
  });

  it("adds the + to a bare 970 number", () => {
    expect(normalisePhone("970591234567")).toBe("+970591234567");
  });

  it("keeps an already-E.164 number", () => {
    expect(normalisePhone("+972501234567")).toBe("+972501234567");
  });

  it("assumes an unknown 7-15 digit number is already international", () => {
    expect(normalisePhone("1234567")).toBe("+1234567");
  });

  it("returns null for a number that is too short", () => {
    expect(normalisePhone("123456")).toBeNull();
  });

  it("returns null for a number that is too long", () => {
    expect(normalisePhone("1234567890123456")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(normalisePhone("")).toBeNull();
  });

  it("returns null for a non-string value", () => {
    expect(normalisePhone(123 as any)).toBeNull();
  });
});

describe("phoneIndexKey", () => {
  it("strips the + from an E.164 number", () => {
    expect(phoneIndexKey("+972501234567")).toBe("972501234567");
  });

  it("strips all non-digit characters", () => {
    expect(phoneIndexKey("+1 (202) 555-1234")).toBe("12025551234");
  });
});

describe("syntheticEmail", () => {
  it("appends the @dawa.local namespace", () => {
    expect(syntheticEmail("ali")).toBe("ali@dawa.local");
  });

  it("lowercases the username", () => {
    expect(syntheticEmail("USER123")).toBe("user123@dawa.local");
  });
});
