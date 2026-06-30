// RTL / localization tests — verify the root direction, Arabic copy, and
// the language switcher.

import { test, expect } from "@playwright/test";
import { loginAsAdmin, clearSession } from "./helpers/auth";

test("public landing page has dir='rtl' and renders Arabic headings", async ({ page }) => {
  await page.goto("/");
  const dir = await page.locator("html").getAttribute("dir");
  expect(dir).toBe("rtl");
  // Hero brand mark (Arabic 'دعوة') is the largest H1.
  await expect(page.locator("h1").first()).toContainText(/دعوة|דעוה/);
});

test("login page renders Arabic field labels", async ({ page }) => {
  await page.goto("/portal/login");
  // Labels can appear more than once (visible label + sr-only / placeholder
  // mirror), so assert the first match rather than a strict single element.
  await expect(page.getByText("اسم المستخدم").first()).toBeVisible();
  await expect(page.getByText("كلمة المرور").first()).toBeVisible();
});

test("language switcher swaps copy to Hebrew", async ({ page }) => {
  await clearSession(page);
  await page.goto("/portal/login");
  // LangSwitcher exposes "AR" / "HE" buttons; pressing HE swaps the page.
  const heBtn = page.getByRole("button", { name: "HE" }).first();
  await expect(heBtn).toBeVisible({ timeout: 5_000 });
  await heBtn.click();
  // Hebrew login subtitle is "פורטל החתן · תוכנת השליח" (login_subtitle)
  // which is unique enough to assert against without hitting heading/title
  // collisions across pages.
  await expect(page.getByText(/פורטל החתן/)).toBeVisible({ timeout: 5_000 });
});

test("admin portal stays RTL after login", async ({ page }) => {
  await clearSession(page);
  await loginAsAdmin(page);
  const dir = await page.locator("html").getAttribute("dir");
  expect(dir).toBe("rtl");
});
