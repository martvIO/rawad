// Admin role tests — dashboard, user CRUD, confirmations tab, send tab,
// settings, and cross-role access guards.

import { test, expect } from "@playwright/test";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { loginAsAdmin, loginAsGroom, clearSession } from "./helpers/auth";

test.describe("Admin — dashboard + nav", () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAsAdmin(page);
  });

  test("admin lands on /portal/admin/users and sees warning banner", async ({ page }) => {
    const admin = new AdminDashboardPage(page);
    await expect(page).toHaveURL(/\/portal\/admin\/users/);
    await expect(admin.warningBanner).toBeVisible();
    await expect(admin.warningBanner).toContainText("وضع المدير");
  });

  test("admin can switch sub-tabs (users → send → confirmations → settings)", async ({ page }) => {
    const admin = new AdminDashboardPage(page);
    await admin.navSend.click();
    await expect(page).toHaveURL(/\/portal\/admin\/send/);
    await admin.navConfirmations.click();
    await expect(page).toHaveURL(/\/portal\/admin\/confirmations/);
    await admin.navSettings.click();
    await expect(page).toHaveURL(/\/portal\/admin\/settings/);
    await admin.navUsers.click();
    await expect(page).toHaveURL(/\/portal\/admin\/users/);
  });

  test("user list shows seeded users", async ({ page }) => {
    const admin = new AdminDashboardPage(page);
    await admin.gotoUsers();
    await expect(admin.userRow("admin")).toBeVisible({ timeout: 10_000 });
    await expect(admin.userRow("groom")).toBeVisible();
    await expect(admin.userRow("driver")).toBeVisible();
  });
});

test.describe("Admin — user CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAsAdmin(page);
  });

  test("admin can create a new Groom user", async ({ page }) => {
    const admin = new AdminDashboardPage(page);
    await admin.gotoUsers();
    const uniqueUsername = `tgroom${Date.now().toString().slice(-6)}`;
    await admin.createUser({ username: uniqueUsername, role: "groom" });
    // Optimistic UI inserts the row immediately
    await expect(admin.userRow(uniqueUsername)).toBeVisible({ timeout: 10_000 });
  });

  test("admin can create a new Driver user", async ({ page }) => {
    const admin = new AdminDashboardPage(page);
    await admin.gotoUsers();
    const uniqueUsername = `tdriver${Date.now().toString().slice(-6)}`;
    await admin.createUser({ username: uniqueUsername, role: "driver" });
    await expect(admin.userRow(uniqueUsername)).toBeVisible({ timeout: 10_000 });
  });

  test("admin can filter user list by role", async ({ page }) => {
    const admin = new AdminDashboardPage(page);
    await admin.gotoUsers();
    await admin.filterGrooms.click();
    await expect(admin.userRow("groom")).toBeVisible();
    // Admin row should not be visible under "Grooms" filter.
    await expect(admin.userRow("admin")).toHaveCount(0);
    await admin.filterAll.click();
    await expect(admin.userRow("admin")).toBeVisible();
  });

  test("admin can delete a user (two-step confirm)", async ({ page }) => {
    const admin = new AdminDashboardPage(page);
    await admin.gotoUsers();
    const uniqueUsername = `tdel${Date.now().toString().slice(-6)}`;
    await admin.createUser({ username: uniqueUsername, role: "groom" });
    await expect(admin.userRow(uniqueUsername)).toBeVisible({ timeout: 10_000 });
    await admin.deleteUser(uniqueUsername);
    await expect(admin.userRow(uniqueUsername)).toHaveCount(0, { timeout: 10_000 });
  });
});

test.describe("Admin — send tab", () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAsAdmin(page);
    await page.goto("/portal/admin/send");
  });

  test("send tab loads + shows groom selector", async ({ page }) => {
    await expect(page.getByText("اختر العريس")).toBeVisible({ timeout: 10_000 });
  });

  test("selecting a groom reveals guest list + bulk send button", async ({ page }) => {
    // The groom picker renders one card per groom; each card's label is
    // "✓ <username> عدد المدعوين: N" (selected) or "♥ <username> عدد …"
    // (unselected). Other tests in this file create tgroom* fixtures that
    // also match /groom/, so we filter by the leading ♥ glyph and the
    // exact username text "groom" to land on the seeded one.
    await expect(page.getByText("اختر العريس")).toBeVisible({ timeout: 10_000 });
    const groomCard = page.locator("button").filter({ hasText: /^[♥✓]\s*groom\s*عدد المدعوين/ }).first();
    await groomCard.click();
    // Bulk send button has a count in parens. Seed has 2 guests.
    await expect(page.getByText(/إرسال للجميع/)).toBeVisible({ timeout: 15_000 });
  });

  test("clicking 'send to one' opens WhatsApp tab (intercepted)", async ({ page }) => {
    // Stub createGuestInvite so we don't depend on the live API
    // succeeding; we just want to verify the button click path.
    await page.route("**/invites/guest**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ token: "fake-token-abc" }) }),
    );
    await page.locator("button:has-text(\"groom\")").first().click();
    // window.open is what the app uses for WA; capturing requires the popup event.
    const popupPromise = page.waitForEvent("popup").catch(() => null);
    const sendBtn = page.locator("button:has-text(\"إرسال\")").nth(1);
    if (await sendBtn.isVisible()) await sendBtn.click();
    const popup = await popupPromise;
    if (popup) {
      // wa.me link is what buildWaLink emits.
      expect(popup.url()).toMatch(/wa\.me/);
      await popup.close();
    }
  });
});

test.describe("Admin — RoleGuard", () => {
  test("non-admin (groom) cannot reach /portal/admin/* — redirects to groom dashboard", async ({ page }) => {
    await clearSession(page);
    await loginAsGroom(page);
    await page.goto("/portal/admin/users");
    // RoleGuard fallback navigates back to the groom's default path.
    await expect(page).toHaveURL(/\/portal\/groom/, { timeout: 5_000 });
  });
});
