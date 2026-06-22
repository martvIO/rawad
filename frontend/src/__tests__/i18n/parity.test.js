// i18n guard tests:
//  1. Parity — AR and HE must expose the exact same key set (a missing HE key
//     silently falls back to Arabic via makeT, which reads as a broken screen).
//  2. Structured-array parity — keys whose value is an array must have the same
//     length in both languages (top-level key parity won't catch a short array).
//  3. Price drift — the four marketing/admin price strings must match the
//     published Premium ₪1,500 / VIP ₪2,000 (twin of the backend planAmounts test).
import { describe, it, expect } from "vitest";
import { ar } from "../../i18n/ar.js";
import { he } from "../../i18n/he.js";

describe("i18n parity", () => {
  it("AR and HE expose the same key set", () => {
    const arKeys = Object.keys(ar).sort();
    const heKeys = Object.keys(he).sort();
    const missingInHe = arKeys.filter((k) => !(k in he));
    const missingInAr = heKeys.filter((k) => !(k in ar));
    expect(missingInHe, "keys present in ar.js but missing in he.js").toEqual([]);
    expect(missingInAr, "keys present in he.js but missing in ar.js").toEqual([]);
  });

  it("array-valued keys have matching lengths across languages", () => {
    for (const k of Object.keys(ar)) {
      if (Array.isArray(ar[k]) && Array.isArray(he[k])) {
        expect(he[k].length, `array length mismatch for "${k}"`).toBe(ar[k].length);
      }
    }
  });
});

describe("price drift guard", () => {
  // Mirrors backend PLAN_AMOUNTS_ILS ({ premium: 1500, vip: 2000 }). If a price
  // changes anywhere, this fails so all five sources are updated together.
  it.each([
    ["price_pkg1_price", "1,500"],
    ["price_pkg2_price", "2,000"],
    ["admin_pay_premium", "1,500"],
    ["admin_pay_vip", "2,000"],
  ])("%s contains %s in both languages", (key, amount) => {
    expect(ar[key]).toContain(amount);
    expect(he[key]).toContain(amount);
  });
});
