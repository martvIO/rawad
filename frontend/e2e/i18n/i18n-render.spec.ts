// LAYER 8 — i18n render sweep. For each public screen, in BOTH Arabic and
// Hebrew, assert: (a) no raw i18n key leaks to the UI (makeT falls back to the
// key on a missing string), and (b) the document stays RTL. This adds the
// "switch language and re-check" dimension the crawler (default language) misses.
// Leaked keys are also attached as findings for the consolidated report.

import { test, expect } from "@playwright/test";
import { scanRendering } from "../helpers/pagewatch";
import { reportFindings } from "../helpers/findings";

const PUBLIC_ROUTES = [
  ["landing", "/"],
  ["terms", "/terms"],
  ["login", "/portal/login"],
  ["confirm", "/confirm/groom"],
  ["invitation-demo", "/d/groom/demo?demo=1"],
] as const;

for (const lang of ["ar", "he"] as const) {
  test.describe(`i18n — ${lang}`, () => {
    test.use({ locale: lang === "he" ? "he-IL" : "ar" });

    for (const [name, route] of PUBLIC_ROUTES) {
      test(`${name} renders fully translated (${lang})`, async ({ page }, testInfo) => {
        // Pin the language before any app code runs.
        await page.addInitScript((l) => {
          try {
            localStorage.setItem("dawa_lang", l);
          } catch {
            /* origin not yet accessible */
          }
        }, lang);

        await page.goto(route);
        await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(300);

        // RTL holds for both AR and HE (App sets dir=rtl for both).
        await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

        const findings = (await scanRendering(page, `${route} [${lang}]`)).map((f) => ({ ...f, area: "i18n" }));
        await reportFindings(testInfo, findings);

        const leaked = findings.filter((f) => f.kind === "untranslated-key");
        expect(
          leaked,
          `Untranslated i18n keys on ${name} (${lang}):\n` + leaked.map((f) => `  • ${f.message}`).join("\n"),
        ).toHaveLength(0);
      });
    }
  });
}
