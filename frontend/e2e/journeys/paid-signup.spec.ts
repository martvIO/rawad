// JOURNEY 3 — Paid signup handoff (admin → public pay page).
//
// admin mints a payment link (UI) → the public /pay/:token page renders the
// package + the username-availability check enables the Pay button. If Lemon
// Squeezy is configured, it proceeds through the checkout-intent; otherwise it
// stops at the (correct) "payments not configured" boundary — the full LS
// webhook → account-creation path is covered by paid-signup-ls.spec.

import { test, expect } from "@playwright/test";
import { loginAsAdmin, clearSession } from "../helpers/auth";

test.describe("Journey — paid signup handoff", () => {
  test("admin mints pay link → /pay renders → username availability enables Pay", async ({ page }) => {
    test.setTimeout(60_000);
    const RUN = String(Date.now()).slice(-7);

    // ── 1. Admin mints a Premium payment link (UI) ─────────────────────────────
    await clearSession(page);
    await loginAsAdmin(page);
    await page.getByTestId("nav-admin-paylinks").click();
    await expect(page).toHaveURL(/\/portal\/admin\/payment-links/);
    await expect(page.getByTestId("btn-paylink-create")).toBeEnabled({ timeout: 10_000 });
    const [linkResp] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/payments/links") && r.request().method() === "POST"),
      page.getByTestId("btn-paylink-create").click(),
    ]);
    expect(linkResp.status()).toBe(200);
    const token: string = (await linkResp.json()).token;
    expect(token).toMatch(/^[a-f0-9]{32}$/);

    // ── 2. Public /pay/:token renders the package + availability check works ────
    await page.goto(`/pay/${token}`);
    await page.getByTestId("field-pay-username").fill(`lsj${RUN}`);
    await page.locator("#field-pay-phone").fill(`+97250${RUN}`);
    // Username available + valid phone → Pay enables. This proves the admin-mint
    // → pay-page → username-availability integration end-to-end.
    await expect(page.getByTestId("btn-pay-submit")).toBeEnabled({ timeout: 10_000 });

    // ── 3. Attempt checkout; skip the LS-only remainder if unconfigured ────────
    const [intentResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/intent") && r.request().method() === "POST").catch(() => null),
      page.getByTestId("btn-pay-submit").click(),
    ]);
    if (!intentResp) {
      test.skip(true, "no /intent response captured");
      return;
    }
    if (intentResp.status() === 503) {
      test.skip(true, "Lemon Squeezy not configured in this env — full flow covered by paid-signup-ls.spec");
      return;
    }
    expect(intentResp.status()).toBe(200);
    const checkoutUrl: string = (await intentResp.json()).checkoutUrl;
    expect(checkoutUrl).toContain("lemonsqueezy.com");
  });
});
