import { test, expect } from "@playwright/test";

// Tests run against the Firebase Hosting emulator (localhost:5000) or production,
// which applies the firebase.json CSP headers. Run `npm run dev:full` first.

test("returning user with stored tokens does not get endless loading", async ({ page }) => {
  const cspErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && msg.text().includes("Content Security Policy"))
      cspErrors.push(msg.text());
  });

  // Land on the portal login page so localStorage is on the right origin.
  await page.goto("/portal/login");

  // Inject fake tokens that mimic a previously signed-in user.
  // The auth subscription will try /auth/me with these tokens.
  await page.evaluate(() => {
    localStorage.setItem("dawa_uid", "csp-test-fake-uid");
    localStorage.setItem("dawa_token", "csp-test-fake-token");
  });

  // Reload so usePortalState runs subscribeAuth with the stored tokens.
  await page.reload();

  // The spinning loader must disappear within 8 seconds.
  // If the CSP was blocking the fetch, the spinner would hang forever.
  await page.waitForFunction(
    () => {
      // The AuthLoadingScreen spinner has border-top-color in its inline style.
      const spinners = document.querySelectorAll('[style*="border-top-color: rgb(201, 168, 76)"]');
      return spinners.length === 0;
    },
    { timeout: 8_000 },
  );

  // No CSP violations should have appeared in the console.
  expect(cspErrors, `CSP errors found: ${cspErrors.join("\n")}`).toHaveLength(0);

  // After auth resolves to null (fake token → 401 or network error),
  // user should land on the login screen.
  await expect(page).toHaveURL(/\/portal\/login/);
});

test("signed-out user navigating to portal is redirected to login", async ({ page }) => {
  await page.goto("/portal");
  await expect(page).toHaveURL(/\/portal\/login/, { timeout: 5_000 });
});

test("signed-out user navigating to a portal sub-path is redirected to login", async ({ page }) => {
  await page.goto("/portal/admin/users");
  await expect(page).toHaveURL(/\/portal\/login/, { timeout: 5_000 });
});
