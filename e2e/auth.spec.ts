// Authentication flow tests — login form, error paths, logout, role
// redirects, and unauthenticated-access guards.
//
// Prerequisites:
//   - Vite dev server: `npm run dev:emulator` (port 5173)
//   - Emulator suite:  `npm run emulators` (auth 9099, functions 5001, …)
//   - Seed users:      `npm run emulators:seed`  (or via globalSetup)
//
// Or do all three in one shot: `npm run dev:full` then `npx playwright test`.

import { test, expect } from "@playwright/test";
import { LoginPage } from "./pages/LoginPage";
import { TEST_USERS } from "./helpers/seed";
import { clearSession, loginAsAdmin, loginAsDriver, loginAsGroom } from "./helpers/auth";

test.describe("Auth — login form rendering", () => {
  test("login page renders username, password fields and submit button", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await expect(login.userInput).toBeVisible();
    await expect(login.passInput).toBeVisible();
    await expect(login.submitBtn).toBeVisible();
  });

  test("login with invalid credentials shows Arabic error message", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login("does-not-exist", "wrongpass1");
    // The error mirrors `login_error` from src/i18n/ar.js
    await expect(login.errorBox).toBeVisible({ timeout: 10_000 });
    await expect(login.errorBox).toContainText("اسم المستخدم أو كلمة المرور غير صحيحة");
  });
});

test.describe("Auth — role redirects", () => {
  test.beforeEach(async ({ page }) => { await clearSession(page); });

  test("admin login → /portal/admin/users", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/\/portal\/admin\/users/);
  });

  test("groom login → /portal/groom/*", async ({ page }) => {
    await loginAsGroom(page);
    await expect(page).toHaveURL(/\/portal\/groom/);
  });

  test("driver login → /portal/driver/*", async ({ page }) => {
    await loginAsDriver(page);
    await expect(page).toHaveURL(/\/portal\/driver/);
  });
});

test.describe("Auth — logout", () => {
  test("logout clears session and returns to landing", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByTestId("btn-logout").click();
    // LogoutConfirm modal renders the "yes, logout" button via t("logout_confirm_yes")
    await page.getByRole("button", { name: /نعم.+اخرج/ }).click();
    await expect(page).toHaveURL(/\/$|\/portal\/login/, { timeout: 10_000 });
  });
});

test.describe("Auth — unauthenticated redirects", () => {
  test.beforeEach(async ({ page }) => { await clearSession(page); });

  test("/portal/admin/users → redirect to login", async ({ page }) => {
    await page.goto("/portal/admin/users");
    await expect(page).toHaveURL(/\/portal\/login/, { timeout: 5_000 });
  });

  test("/portal/groom → redirect to login", async ({ page }) => {
    await page.goto("/portal/groom");
    await expect(page).toHaveURL(/\/portal\/login/, { timeout: 5_000 });
  });

  test("/portal/driver/pending → redirect to login", async ({ page }) => {
    await page.goto("/portal/driver/pending");
    await expect(page).toHaveURL(/\/portal\/login/, { timeout: 5_000 });
  });
});

test.describe("Auth — OTP phone reset flow", () => {
  test.skip("OTP flow — requires reCAPTCHA + SMS infrastructure", () => {
    // The reset-password flow uses Firebase Phone Auth which needs a real
    // reCAPTCHA v2 challenge + an SMS provider. The Auth emulator can
    // surface SMS codes via /emulator/v1/projects/{id}/verificationCodes,
    // but the reCAPTCHA v2 widget cannot be solved headlessly.
    //
    // Manual verification path:
    //   1. Click "نسيت كلمة المرور" (when wired into the UI)
    //   2. Enter the phone +972500000001 (admin) and complete reCAPTCHA
    //   3. GET http://127.0.0.1:9099/emulator/v1/projects/dawa-aa793/verificationCodes
    //   4. Enter the returned code and a new strong password
  });
});

test("returning user with stored tokens does not get endless loading", async ({ page }) => {
  // Regression test — the AuthLoadingScreen spinner must clear within 8s
  // even if the stored tokens are bogus. (Previously hung on a CSP block.)
  const cspErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && msg.text().includes("Content Security Policy"))
      cspErrors.push(msg.text());
  });

  await page.goto("/portal/login");
  await page.evaluate(() => {
    localStorage.setItem("dawa_uid", "csp-test-fake-uid");
    localStorage.setItem("dawa_token", "csp-test-fake-token");
  });
  await page.reload();

  await page.waitForFunction(
    () => {
      const spinners = document.querySelectorAll('[style*="border-top-color: rgb(201, 168, 76)"]');
      return spinners.length === 0;
    },
    { timeout: 8_000 },
  );

  expect(cspErrors, `CSP errors found: ${cspErrors.join("\n")}`).toHaveLength(0);
  await expect(page).toHaveURL(/\/portal\/login/);
});

// Confirm credentials match the seeded ones — guards against drift between
// scripts/seed-emulator.cjs and the tests above.
test("seed users match expected credentials", () => {
  expect(TEST_USERS.admin.username).toBe("admin");
  expect(TEST_USERS.groom.username).toBe("groom");
  expect(TEST_USERS.driver.username).toBe("driver");
});
