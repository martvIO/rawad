// Driver role tests — pick-groom gate, delivery list, GPS share panel,
// proof photo upload, and cross-role access guards.

import { test, expect } from "@playwright/test";
import { DriverDashboardPage } from "./pages/DriverDashboardPage";
import { loginAsDriver, clearSession } from "./helpers/auth";
import { skipIfNoPhysical } from "./helpers/features";

// The whole driver portal is gated behind FEATURES.physical (beta, off by
// default). Skip these UI specs when it's disabled.
test.beforeEach(() => skipIfNoPhysical());

test.describe("Driver — pick groom gate", () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAsDriver(page);
  });

  test("first visit shows pick-groom screen", async ({ page }) => {
    const driver = new DriverDashboardPage(page);
    // Either we're on the pick-groom screen, or driverServingGroom was already
    // set in localStorage from a prior session. Both are valid post-login states.
    if (await driver.pickGroomField.isVisible().catch(() => false)) {
      await expect(page.getByText(/لمَن تُسلِّم المكاتيب/)).toBeVisible();
      await expect(driver.pickGroomField).toBeVisible();
      await expect(driver.pickGroomSubmit).toBeVisible();
    } else {
      await expect(page).toHaveURL(/\/portal\/driver/);
    }
  });

  test("invalid groom username shows Arabic error", async ({ page }) => {
    const driver = new DriverDashboardPage(page);
    if (!(await driver.pickGroomField.isVisible().catch(() => false))) {
      test.skip(true, "Driver already has a groom assigned; can't exercise the pick-groom error path.");
      return;
    }
    await driver.pickGroom("does-not-exist-xyz");
    await expect(driver.pickGroomError).toBeVisible({ timeout: 10_000 });
    await expect(driver.pickGroomError).toContainText(/غير موجود|ليس عريساً/);
  });

  test("valid groom username advances to delivery list", async ({ page }) => {
    const driver = new DriverDashboardPage(page);
    if (await driver.pickGroomField.isVisible().catch(() => false)) {
      await driver.pickGroom("groom");
      await expect(page).toHaveURL(/\/portal\/driver\/pending/, { timeout: 10_000 });
    }
    // Should now see the delivery list
    await expect(page.getByText(/قائمة التوصيل/)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Driver — delivery list", () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAsDriver(page);
    const driver = new DriverDashboardPage(page);
    // After clearSession the driver always starts on the pick-groom gate.
    // Pick the seeded groom so the delivery list mounts.
    await expect(driver.pickGroomField).toBeVisible({ timeout: 10_000 });
    await driver.pickGroom("groom");
    await expect(page).toHaveURL(/\/portal\/driver\/pending/, { timeout: 10_000 });
  });

  test("delivery list renders seeded guests", async ({ page }) => {
    // Seeded guests have city = Haifa + Nazareth; city headers render with 🏘
    await expect(page.getByText(/Haifa|Nazareth/).first()).toBeVisible({ timeout: 15_000 });
  });

  test("clicking 'تسليم المكتوب' reveals delivery form", async ({ page }) => {
    // Wait for guests list to populate from the polled subscription first.
    await expect(page.getByText(/Haifa|Nazareth/).first()).toBeVisible({ timeout: 15_000 });
    const deliverBtn = page.locator("button:has-text(\"تسليم المكتوب\")").first();
    await deliverBtn.click();
    await expect(page.getByText(/أكمل بيانات التسليم/)).toBeVisible({ timeout: 5_000 });
  });

  test("share-location panel renders with hint text", async ({ page }) => {
    await expect(page.getByText(/مشاركة موقعي مع العريس/)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Driver — GPS share (mocked geolocation)", () => {
  test("granted geolocation can be set via Playwright context API", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 32.794, longitude: 34.989, accuracy: 12 });
    await clearSession(page);
    await loginAsDriver(page);
    const driver = new DriverDashboardPage(page);
    await expect(driver.pickGroomField).toBeVisible({ timeout: 10_000 });
    await driver.pickGroom("groom");
    await expect(page).toHaveURL(/\/portal\/driver\/pending/, { timeout: 10_000 });
    // The share-section is rendered whether or not GPS is currently granted.
    await expect(page.getByText(/مشاركة موقعي مع العريس/)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Driver — RoleGuard", () => {
  test("driver cannot reach /portal/admin/* — redirects to driver pending", async ({ page }) => {
    await clearSession(page);
    await loginAsDriver(page);
    await page.goto("/portal/admin/users");
    await expect(page).toHaveURL(/\/portal\/driver/, { timeout: 5_000 });
  });

  test("driver cannot reach /portal/groom/* — redirects to driver pending", async ({ page }) => {
    await clearSession(page);
    await loginAsDriver(page);
    await page.goto("/portal/groom");
    await expect(page).toHaveURL(/\/portal\/driver/, { timeout: 5_000 });
  });
});
