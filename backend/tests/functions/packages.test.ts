// Package config guard. The price list is the single source of truth for the
// paid-signup PaymentIntent amount, so this pins the seeded prices (Premium
// ₪1,500 / VIP ₪2,000) and the public projection's shape.
import { describe, it, expect } from "vitest";
import {
  PACKAGES,
  getPackage,
  publicPackages,
  PAYMENT_LINK_TTL_MS,
} from "../../functions/src/config/packages";

describe("packages config", () => {
  it("seeds the published prices", () => {
    expect(PACKAGES.premium.amountIls).toBe(1500);
    expect(PACKAGES.vip.amountIls).toBe(2000);
  });

  it("VIP grants the boarding pass; premium does not", () => {
    expect(PACKAGES.vip.features.canUseBoardingPass).toBe(true);
    expect(PACKAGES.premium.features.canUseBoardingPass).toBe(false);
    // Both keep attendance + photographer on (mirrors POST /users defaults).
    for (const id of ["premium", "vip"] as const) {
      expect(PACKAGES[id].features.canSeeAttendance).toBe(true);
      expect(PACKAGES[id].features.canUsePhotographer).toBe(true);
    }
  });

  it("getPackage resolves known ids and rejects unknown / non-string", () => {
    expect(getPackage("premium")?.id).toBe("premium");
    expect(getPackage("nope")).toBeNull();
    expect(getPackage(undefined)).toBeNull();
    expect(getPackage(123)).toBeNull();
  });

  it("publicPackages strips the internal feature flags", () => {
    const pub = publicPackages();
    expect(pub.length).toBe(Object.keys(PACKAGES).length);
    for (const p of pub) {
      expect(p).not.toHaveProperty("features");
      expect(typeof p.amountIls).toBe("number");
      expect(p.label.ar).toBeTruthy();
      expect(p.label.he).toBeTruthy();
    }
  });

  it("links live for 7 days", () => {
    expect(PAYMENT_LINK_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
