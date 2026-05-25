// Auth helpers — reusable login flows for each role. Every spec that needs
// a signed-in session should call one of these in `beforeEach` (or at the
// top of the test) rather than re-implementing the form submission.
//
// All helpers navigate to /portal/login, fill the fields, and wait for the
// post-login redirect to the role's landing page.

import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { TEST_USERS } from "./seed";

async function loginAs(page: Page, username: string, password: string, expectedPath: RegExp) {
  await page.goto("/portal/login");
  await page.getByTestId("field-login-user").fill(username);
  await page.getByTestId("field-login-pass").fill(password);
  await page.getByTestId("btn-login-submit").click();
  await expect(page).toHaveURL(expectedPath, { timeout: 10_000 });
}

export async function loginAsAdmin(page: Page): Promise<void> {
  const u = TEST_USERS.admin;
  await loginAs(page, u.username, u.password, /\/portal\/admin/);
}

export async function loginAsGroom(page: Page): Promise<void> {
  const u = TEST_USERS.groom;
  // Groom lands on /portal/groom/type-select OR a remembered type
  // (handwritten/digital). Match either.
  await loginAs(page, u.username, u.password, /\/portal\/groom/);
}

export async function loginAsDriver(page: Page): Promise<void> {
  const u = TEST_USERS.driver;
  // Drivers land on /portal/driver/pending. The pick-groom screen will
  // appear if no groom is set on this device — callers should handle.
  await loginAs(page, u.username, u.password, /\/portal\/driver/);
}

export async function clearSession(page: Page): Promise<void> {
  // Tear down any persisted auth state — used in beforeEach for tests
  // that must start signed-out (e.g. login-redirect assertions).
  await page.goto("/");
  await page.evaluate(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch { /* origin not accessible */ }
  });
}
