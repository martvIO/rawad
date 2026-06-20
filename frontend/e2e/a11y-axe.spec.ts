// Automated accessibility audit (axe-core) over the public, unauthenticated
// pages — the ones a non-technical AR/HE audience hits first. Complements the
// manual a11y smoke checks in a11y.spec.ts.
//
// We fail only on **critical/serious** WCAG 2 A/AA violations to stay
// actionable (minor/moderate items are logged, not blocking). RTL is in scope —
// axe runs against the live rendered dir="rtl" DOM.

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PUBLIC_PAGES = [
  { name: "landing", path: "/" },
  { name: "login", path: "/portal/login" },
  { name: "public confirm form", path: "/confirm/groom" },
];

for (const pageUnderTest of PUBLIC_PAGES) {
  test(`a11y: ${pageUnderTest.name} has no critical/serious WCAG violations`, async ({ page }) => {
    await page.goto(pageUnderTest.path);
    // Let async content (i18n, forms) settle before scanning.
    await page.waitForLoadState("networkidle").catch(() => undefined);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );

    if (blocking.length) {
      // Surface enough detail to fix without re-running.
      console.error(
        `[a11y] ${pageUnderTest.name}:\n` +
          blocking
            .map((v) => `  • [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`)
            .join("\n"),
      );
    }

    expect(blocking, `Critical/serious a11y violations on ${pageUnderTest.name}`).toEqual([]);
  });
}
