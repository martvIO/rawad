// FEATURE — Groom DIGITAL track (the live, shipping track; the handwritten track
// is gated behind FEATURES.physical). The digital screens carry few stable
// testids, so this asserts each screen renders cleanly: correct URL, non-empty
// body, and NO console/page errors while loading (watchPage). Precise data flows
// (RSVP, wish, design approval) are covered by the digital-lifecycle journey.

import { test, expect } from "@playwright/test";
import { loginAsGroom, clearSession } from "../helpers/auth";
import { watchPage, scanRendering } from "../helpers/pagewatch";
import { reportFindings } from "../helpers/findings";

const DIGITAL_ROUTES = [
  ["dashboard", "/portal/groom/digital/dashboard"],
  ["guests", "/portal/groom/digital/guests"],
  ["add", "/portal/groom/digital/add"],
  ["design", "/portal/groom/digital/design"],
  ["photographer", "/portal/groom/digital/photographer"],
  ["manage", "/portal/groom/digital/manage"],
] as const;

test.describe("Groom — digital track", () => {
  test("pick digital lands on the digital dashboard", async ({ page }) => {
    await clearSession(page);
    await loginAsGroom(page);
    if (page.url().includes("type-select")) {
      await page.getByTestId("btn-type-digital").click();
      await page.waitForURL(/\/portal\/groom\/digital\//, { timeout: 15_000 });
    }
    await expect(page).toHaveURL(/\/portal\/groom\/digital\//, { timeout: 15_000 });
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("every digital screen renders with no console errors", async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    const w = watchPage(page);
    await clearSession(page);
    await loginAsGroom(page);
    if (page.url().includes("type-select")) {
      await page.getByTestId("btn-type-digital").click();
      await page.waitForURL(/\/portal\/groom\/digital\//, { timeout: 15_000 });
    }

    const allFindings = [];
    for (const [name, route] of DIGITAL_ROUTES) {
      await page.goto(route);
      await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(400);
      await expect(page.locator("body"), `${name} renders content`).not.toBeEmpty();
      allFindings.push(...w.drain(route), ...(await scanRendering(page, route)).map((f) => ({ ...f, area: "groom-digital" })));
    }

    await reportFindings(testInfo, allFindings);
    const errors = allFindings.filter((f) => f.severity === "error");
    expect(
      errors,
      `Errors on the digital track:\n` + errors.map((e) => `  • [${e.kind}] ${e.route} ${e.message}`).join("\n"),
    ).toHaveLength(0);
  });
});
