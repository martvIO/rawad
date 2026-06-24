// @vitest-environment node
//
// Unit test for the atomic payment-link write (api/routes/payments.ts).
// The fix: the user payment metadata AND the webhook's reverse index must be in
// ONE root multi-path update so a partial failure can't strand a link the webhook
// can't map back to a uid.
import { describe, it, expect } from "vitest";
import { paymentLinkUpdates } from "../../functions/src/api/routes/payments";

describe("paymentLinkUpdates", () => {
  const updates = paymentLinkUpdates("groom-1", "plink_abc", {
    plan: "premium",
    amountIls: 1500,
    url: "https://buy.stripe.com/x",
    mode: "test",
    createdAt: 1700000000000,
  });

  it("includes BOTH the reverse index and the user metadata in one object", () => {
    // The reverse index the webhook reads — must be in the same write.
    expect(updates["stripePaymentLinks/plink_abc"]).toBe("groom-1");
    // The user payment metadata, as root-relative multi-paths.
    expect(updates["users/groom-1/paymentPlan"]).toBe("premium");
    expect(updates["users/groom-1/paymentStatus"]).toBe("pending");
    expect(updates["users/groom-1/paymentAmountIls"]).toBe(1500);
    expect(updates["users/groom-1/paymentLinkId"]).toBe("plink_abc");
    expect(updates["users/groom-1/paymentMode"]).toBe("test");
    expect(updates["users/groom-1/paymentCreatedAt"]).toBe(1700000000000);
    expect(updates["users/groom-1/paymentLinkUrl"]).toBe("https://buy.stripe.com/x");
  });

  it("uses root-relative paths (so ref().update applies them atomically)", () => {
    for (const key of Object.keys(updates)) {
      expect(key.startsWith("users/") || key.startsWith("stripePaymentLinks/")).toBe(true);
    }
  });
});
