// Crawler / monkey — the broad net behind the precise feature specs.
//
// For each role (anonymous + admin + groom + driver) it visits every reachable
// in-app screen: a curated route list PLUS every nav tab it finds (clicking
// data-testid^="nav-" links auto-discovers the real routes without hard-coding
// slugs). On each page it harvests console/page errors, 4xx/5xx, broken images,
// leaked i18n keys, and unlabeled controls (helpers/pagewatch.ts).
//
// SAFETY CAP (logged, not silent): the crawler NAVIGATES and switches tabs but
// does NOT click destructive submits (delete/send/save/confirm) — those are
// exercised, with assertions, by the journeys + feature specs. Clicking them
// here would corrupt state for later specs (the emulator is seeded once per run,
// not per page).
//
// STRICTNESS: any error-severity finding fails the crawl (per the per-PR
// "block on red" gate). Set CRAWLER_STRICT=0 to downgrade to report-only.

import { test, expect } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";
import { loginAsAdmin, loginAsGroom, loginAsDriver, clearSession } from "../helpers/auth";
import { watchPage, scanRendering } from "../helpers/pagewatch";
import { reportFindings, type Finding } from "../helpers/findings";
import { PHYSICAL_ENABLED } from "../helpers/features";

const STRICT = process.env.CRAWLER_STRICT !== "0";
const SETTLE_MS = 600;

// Candidate routes per role. Authed routes are reached AND we also click every
// nav tab found, so missing/renamed slugs still get covered by tab-discovery.
const PUBLIC_ROUTES = ["/", "/terms", "/confirm/groom", "/portal/login", "/portal/forgot-password", "/d/groom/demo?demo=1"];
const ADMIN_ROUTES = ["/portal/admin/users", "/portal/admin/send", "/portal/admin/confirmations", "/portal/admin/settings"];
const GROOM_ROUTES = [
  "/portal/groom/digital/dashboard",
  // Handwritten track only reachable when the physical flag is on.
  ...(PHYSICAL_ENABLED ? ["/portal/groom/handwritten/dashboard"] : []),
];
const DRIVER_ROUTES = ["/portal/driver/pending"];

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(SETTLE_MS);
}

/** Visit one route, harvest findings, stamp the route. */
async function visit(page: Page, route: string, watcherDrain: () => Finding[]): Promise<Finding[]> {
  const collected: Finding[] = [];
  try {
    await page.goto(route, { waitUntil: "commit" });
    await settle(page);
  } catch (err) {
    collected.push({ kind: "other", severity: "error", area: "crawler", route, message: `navigation failed: ${String(err).slice(0, 160)}` });
    return collected;
  }
  collected.push(...watcherDrain().map((f) => ({ ...f, route: f.route ?? route, area: f.area ?? "crawler" })));
  collected.push(...(await scanRendering(page, route)));
  return collected;
}

/** Click each nav tab once, scanning after each switch. */
async function crawlNavTabs(page: Page, watcherDrain: () => Finding[]): Promise<Finding[]> {
  const out: Finding[] = [];
  const tabs = page.locator('[data-testid^="nav-"]');
  const count = await tabs.count().catch(() => 0);
  for (let i = 0; i < count; i++) {
    const tab = tabs.nth(i);
    const id = (await tab.getAttribute("data-testid").catch(() => null)) ?? `tab-${i}`;
    if (!(await tab.isVisible().catch(() => false))) continue;
    await tab.click({ timeout: 5000 }).catch(() => {});
    await settle(page);
    const route = `${new URL(page.url()).pathname} (${id})`;
    out.push(...watcherDrain().map((f) => ({ ...f, route: f.route ?? route, area: f.area ?? "crawler" })));
    out.push(...(await scanRendering(page, route)));
  }
  return out;
}

async function assertClean(testInfo: TestInfo, findings: Finding[]): Promise<void> {
  await reportFindings(testInfo, findings);
  const errors = findings.filter((f) => f.severity === "error");
  // Always surface the count; only fail when strict.
  // eslint-disable-next-line no-console
  console.log(`[crawler] ${testInfo.title}: ${findings.length} findings (${errors.length} error-severity)`);
  if (STRICT && errors.length) {
    const top = errors.slice(0, 8).map((e) => `• [${e.kind}] ${e.route ?? ""} ${e.message}`).join("\n");
    expect(errors.length, `Crawler found ${errors.length} error-severity issues:\n${top}`).toBe(0);
  }
}

test.describe("Crawler — full render sweep", () => {
  // NOT serial — each role crawls independently so one role's failure doesn't
  // cascade-skip the others. (Global config already runs specs sequentially.)
  test.describe.configure({ timeout: 120_000 });

  test("anonymous / public pages", async ({ page }, testInfo) => {
    const w = watchPage(page);
    await clearSession(page);
    const findings: Finding[] = [];
    for (const r of PUBLIC_ROUTES) findings.push(...(await visit(page, r, () => w.drain())));
    await assertClean(testInfo, findings);
  });

  test("admin portal", async ({ page }, testInfo) => {
    const w = watchPage(page);
    await clearSession(page);
    await loginAsAdmin(page);
    const findings: Finding[] = [];
    findings.push(...(await crawlNavTabs(page, () => w.drain())));
    for (const r of ADMIN_ROUTES) findings.push(...(await visit(page, r, () => w.drain())));
    await assertClean(testInfo, findings);
  });

  test("groom portal (both tracks)", async ({ page }, testInfo) => {
    const w = watchPage(page);
    await clearSession(page);
    await loginAsGroom(page);
    const findings: Finding[] = [];
    for (const r of GROOM_ROUTES) {
      findings.push(...(await visit(page, r, () => w.drain())));
      findings.push(...(await crawlNavTabs(page, () => w.drain())));
    }
    await assertClean(testInfo, findings);
  });

  test("driver portal", async ({ page }, testInfo) => {
    test.skip(!PHYSICAL_ENABLED, "driver portal gated behind FEATURES.physical");
    const w = watchPage(page);
    await clearSession(page);
    await loginAsDriver(page);
    const findings: Finding[] = [];
    for (const r of DRIVER_ROUTES) findings.push(...(await visit(page, r, () => w.drain())));
    findings.push(...(await crawlNavTabs(page, () => w.drain())));
    await assertClean(testInfo, findings);
  });
});
