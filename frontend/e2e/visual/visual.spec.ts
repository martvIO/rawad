// LAYER 7 — Full visual regression (stabilized).
//
// Pixel-diffs every key screen against a committed baseline. The app is heavily
// animated (WebGL celestial envelope, countdown, parallax, Leaflet), so we
// stabilize aggressively:
//   • global expect.toHaveScreenshot { animations: "disabled" } (playwright.config)
//   • inject CSS to kill any remaining animations/transitions + the caret
//   • freeze the clock so countdowns/relative times don't tick
//   • wait for fonts.ready + network idle
//   • MASK the non-deterministic regions (WebGL <canvas>, Leaflet maps)
//
// Baselines are committed under __screenshots__/. Update intended UI changes with
//   npm run test:full:update      (or: npx playwright test visual --update-snapshots)
//
// NOTE: snapshots are platform-specific (…-chromium-win32.png vs …-linux.png).
// CI (linux) needs its own committed baselines — see the `visual` CI job.
// Restricted to chromium + mobile-safari to bound baseline churn while covering
// desktop + iOS Safari (the two highest-value targets).

import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin, loginAsGroom, loginAsDriver, clearSession } from "../helpers/auth";
import { GroomDashboardPage } from "../pages/GroomDashboardPage";
import { DriverDashboardPage } from "../pages/DriverDashboardPage";
import { PHYSICAL_ENABLED } from "../helpers/features";

// Visual baselines are emulator/UI specific — never run them against prod.
test.skip(!!process.env.PROD_SMOKE, "visual regression runs against the emulator only");

const ENABLED_PROJECTS = new Set(["chromium", "mobile-safari"]);

async function stabilize(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `*,*::before,*::after{animation:none!important;transition:none!important;animation-duration:0s!important;caret-color:transparent!important}`,
  });
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(300);
}

/** Snapshot the full page, masking the regions that can never be deterministic. */
async function shot(page: Page, name: string): Promise<void> {
  await stabilize(page);
  await expect(page).toHaveScreenshot(`${name}.png`, {
    fullPage: true,
    mask: [page.locator("canvas"), page.locator(".leaflet-container"), page.locator("[data-visual-ignore]")],
  });
}

test.describe("Visual — public @visual", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-06-01T12:00:00Z"));
  });

  for (const [name, route] of [
    ["landing", "/"],
    ["terms", "/terms"],
    ["login", "/portal/login"],
    ["confirm", "/confirm/groom"],
    ["invitation-demo", "/d/groom/demo?demo=1"],
  ] as const) {
    test(name, async ({ page }, testInfo) => {
      test.skip(!ENABLED_PROJECTS.has(testInfo.project.name), "bounded to chromium + mobile-safari");
      await clearSession(page);
      await page.goto(route);
      await shot(page, name);
    });
  }
});

test.describe("Visual — authed @visual", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-06-01T12:00:00Z"));
  });

  test("admin-users", async ({ page }, testInfo) => {
    test.skip(!ENABLED_PROJECTS.has(testInfo.project.name), "bounded");
    await clearSession(page);
    await loginAsAdmin(page);
    await page.goto("/portal/admin/users");
    await shot(page, "admin-users");
  });

  test("admin-send", async ({ page }, testInfo) => {
    test.skip(!ENABLED_PROJECTS.has(testInfo.project.name), "bounded");
    await clearSession(page);
    await loginAsAdmin(page);
    await page.goto("/portal/admin/send");
    await shot(page, "admin-send");
  });

  test("groom-dashboard", async ({ page }, testInfo) => {
    test.skip(!ENABLED_PROJECTS.has(testInfo.project.name), "bounded");
    test.skip(!PHYSICAL_ENABLED, "handwritten track gated behind FEATURES.physical");
    await clearSession(page);
    await loginAsGroom(page);
    const groom = new GroomDashboardPage(page);
    await groom.pickHandwritten();
    await groom.gotoDashboard();
    await shot(page, "groom-dashboard");
  });

  test("groom-add", async ({ page }, testInfo) => {
    test.skip(!ENABLED_PROJECTS.has(testInfo.project.name), "bounded");
    test.skip(!PHYSICAL_ENABLED, "handwritten track gated behind FEATURES.physical");
    await clearSession(page);
    await loginAsGroom(page);
    const groom = new GroomDashboardPage(page);
    await groom.pickHandwritten();
    await groom.gotoAdd();
    await shot(page, "groom-add");
  });

  test("driver-pending", async ({ page }, testInfo) => {
    test.skip(!ENABLED_PROJECTS.has(testInfo.project.name), "bounded");
    test.skip(!PHYSICAL_ENABLED, "driver portal gated behind FEATURES.physical");
    await clearSession(page);
    await loginAsDriver(page);
    const driver = new DriverDashboardPage(page);
    if (await driver.pickGroomField.isVisible().catch(() => false)) {
      await driver.pickGroom("groom");
      await expect(page).toHaveURL(/\/portal\/driver\/pending/, { timeout: 10_000 });
    }
    await shot(page, "driver-pending");
  });
});
