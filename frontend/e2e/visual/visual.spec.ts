// LAYER 7 — Visual regression (stabilized + deterministic subset).
//
// Pixel-diffs the STABLE screens against a committed baseline. We deliberately
// scope this to deterministic public screens: the marketing landing page is huge
// + heavily animated, and the admin lists render run-varying data — both produce
// false diffs, so they're covered by the crawler/feature specs instead, not here.
//
// Stabilization:
//   • global expect.toHaveScreenshot { animations: "disabled" } (playwright.config)
//   • inject CSS to kill any remaining animation/transition + the caret
//   • freeze the clock so countdowns / relative times don't tick
//   • wait for fonts.ready, bounded networkidle (polling pages never idle)
//   • MASK the non-deterministic regions (WebGL <canvas>, Leaflet maps)
//   • viewport screenshot (not fullPage) to keep captures bounded + comparable
//
// Baselines live under visual.spec.ts-snapshots/. Update intended UI changes with
//   npm run test:full:update   (or: npx playwright test visual --update-snapshots)
//
// NOTE: snapshots are platform-specific (…-win32.png vs …-linux.png). CI (linux)
// needs its own committed baselines — see the advisory `visual` CI job.
// Bounded to chromium + mobile-safari (desktop + iOS Safari, the key targets).

import { test, expect, type Page } from "@playwright/test";
import { clearSession } from "../helpers/auth";

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

async function shot(page: Page, name: string): Promise<void> {
  await stabilize(page);
  await expect(page).toHaveScreenshot(`${name}.png`, {
    mask: [page.locator("canvas"), page.locator(".leaflet-container"), page.locator("[data-visual-ignore]")],
  });
}

test.describe("Visual — public @visual", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-06-01T12:00:00Z"));
  });

  // NOTE: the digital invitation (/d/...) is intentionally NOT here — its 3D
  // animated envelope never produces a stable screenshot (Playwright times out
  // "generating new stable screenshot"). It's render-checked by the crawler,
  // i18n sweep, and digital-lifecycle journey instead.
  for (const [name, route] of [
    ["login", "/portal/login"],
    ["terms", "/terms"],
    ["confirm", "/confirm/groom"],
  ] as const) {
    test(name, async ({ page }, testInfo) => {
      test.skip(!ENABLED_PROJECTS.has(testInfo.project.name), "bounded to chromium + mobile-safari");
      await clearSession(page);
      await page.goto(route);
      await shot(page, name);
    });
  }
});
