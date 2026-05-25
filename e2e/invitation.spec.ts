// Public confirmation + per-guest invite token flow tests.
//
// The /confirm/:groomUsername path is public (no auth, no token). The
// /invite/:token path needs a valid token created by the createGuestInvite
// Cloud Function — tests stub the token-subscription endpoint so they can
// run without a real mint.

import { test, expect } from "@playwright/test";
import { InvitationPage } from "./pages/InvitationPage";

test.describe("Public confirmation form", () => {
  test("/confirm/<groom> renders the form", async ({ page }) => {
    const inv = new InvitationPage(page);
    await inv.gotoConfirm("groom");
    await expect(page.getByText(/شركة دعوة ترحب بكم/)).toBeVisible({ timeout: 10_000 });
    await expect(inv.nameField).toBeVisible();
    await expect(inv.submitBtn).toBeVisible();
  });

  test("empty submit is blocked (button disabled until required fields filled)", async ({ page }) => {
    const inv = new InvitationPage(page);
    await inv.gotoConfirm("groom");
    await expect(inv.submitBtn).toBeDisabled();
  });

  test("submitting valid data shows success state", async ({ page }) => {
    // Stub the submit endpoint so the test doesn't depend on a real Cloud
    // Function rate-limit / IP check.
    await page.route("**/api/confirmations", (route) => {
      if (route.request().method() === "POST") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      }
      return route.continue();
    });
    const inv = new InvitationPage(page);
    await inv.gotoConfirm("groom");
    await inv.fill({ name: "أحمد محمد", phoneNational: "501112233", city: "Haifa", street: "Test", house: "10" });
    // Pause briefly so the CityField onBlur (200ms) closes the autocomplete
    await page.waitForTimeout(300);
    // The submit button enables once required fields are non-empty.
    await inv.submitBtn.click({ trial: false });
    await expect(inv.thanksTitle).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Per-guest invite token", () => {
  test("invalid token shows invalid-link page", async ({ page }) => {
    // Stub the token subscription to return null (token not found).
    await page.route("**/invites/token/**", (route) =>
      route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not_found" }) }),
    );
    const inv = new InvitationPage(page);
    await inv.gotoInvite("does-not-exist-xyz");
    await expect(inv.invalidTitle).toBeVisible({ timeout: 10_000 });
    await expect(inv.invalidTitle).toContainText(/رابط الدعوة غير صالح/);
  });

  test("used token shows already-used page", async ({ page }) => {
    await page.route("**/invites/token/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        guestName: "Test", guestPhone: "+972501234567",
        usedAt: Date.now() - 1000, expiresAt: Date.now() + 86_400_000,
      })}),
    );
    const inv = new InvitationPage(page);
    await inv.gotoInvite("any-token");
    await expect(inv.usedTitle).toBeVisible({ timeout: 10_000 });
  });

  test("expired token shows expired-link page", async ({ page }) => {
    await page.route("**/invites/token/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        guestName: "Test", guestPhone: "+972501234567",
        expiresAt: Date.now() - 1000,
      })}),
    );
    const inv = new InvitationPage(page);
    await inv.gotoInvite("expired-token");
    await expect(inv.expiredTitle).toBeVisible({ timeout: 10_000 });
  });
});
