// PROD READ-ONLY SMOKE (@prodsafe).
//
// Runs against the LIVE hosted site (npm run test:full:prod → PLAYWRIGHT_BASE_URL
// = https://dawa-aa793.web.app). Strictly read-only: loads public pages and
// asserts they render correctly with no console errors / broken images / leaked
// i18n keys. NEVER logs in, NEVER submits — so it's safe to run on a schedule
// against production without creating junk data.
//
// Tagged @prodsafe so the prod runner (test-full.cjs --prod → --grep @prodsafe)
// selects exactly these. They also run happily against the emulator.

import { test, expect } from "@playwright/test";
import { watchPage, scanRendering } from "../helpers/pagewatch";
import { reportFindings } from "../helpers/findings";

const PUBLIC = [
  ["landing", "/"],
  ["login", "/portal/login"],
  ["confirm", "/confirm/groom"],
  ["terms", "/terms"],
] as const;

for (const [name, route] of PUBLIC) {
  test(`@prodsafe ${name} renders cleanly`, async ({ page }, testInfo) => {
    const w = watchPage(page);
    await page.goto(route);
    await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);

    // RTL is the load-bearing layout invariant for this market.
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("body")).not.toBeEmpty();

    const findings = [...w.drain(route), ...(await scanRendering(page, route))].map((f) => ({ ...f, area: "prod-smoke" }));
    await reportFindings(testInfo, findings);

    const errors = findings.filter((f) => f.severity === "error");
    expect(
      errors,
      `Render errors on ${name}:\n` + errors.map((e) => `  • [${e.kind}] ${e.message}`).join("\n"),
    ).toHaveLength(0);
  });
}
