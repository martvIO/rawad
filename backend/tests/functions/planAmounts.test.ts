// Price-drift tripwire (backend half). The plan amounts are hardcoded in five
// places — this canonical constant plus four frontend i18n strings
// (price_pkg1_price/price_pkg2_price/admin_pay_premium/admin_pay_vip). If a
// price changes, this test (and its frontend twin in
// frontend/src/__tests__/i18n/parity.test.js) fail so every source gets updated.
import { describe, it, expect } from "vitest";
import { PLAN_AMOUNTS_ILS } from "../../functions/src/api/routes/payments";

describe("PLAN_AMOUNTS_ILS (price drift guard)", () => {
  it("matches the published prices (Premium ₪2,500 / VIP ₪3,500)", () => {
    expect(PLAN_AMOUNTS_ILS).toEqual({ premium: 2500, vip: 3500 });
  });
});
