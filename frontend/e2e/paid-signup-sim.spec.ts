// Deterministic, CI-safe variant of the Lemon Squeezy paid-signup test.
//
// Unlike paid-signup-ls.spec.ts (which needs real LS API creds so `/intent`
// creates a REAL checkout and asserts a lemonsqueezy.com URL), this test
// exercises OUR provisioning pipeline WITHOUT any LS API key: it tolerates a
// 503 at `/intent` and drives the signed `order_created` webhook directly (the
// webhook only needs LEMONSQUEEZY_WEBHOOK_SECRET, not the API key). Reuses the
// shared `lemonSqueezyOrderCreated` helper + `blockThirdParty`, so the run stays
// offline and no real charge / message ever fires.
//
// Prereqs: emulators + Vite running (`npm run dev:full`), and in
// backend/functions/.env.local: LEMONSQUEEZY_WEBHOOK_SECRET + LS_VARIANT_ID_PREMIUM
// (the stubs.ts defaults — 1835519). Run e.g.:
//   PLAYWRIGHT_BASE_URL=http://localhost:5174 npx playwright test paid-signup-sim --project=chromium
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { TEST_USERS } from "./helpers/seed";
import { API, blockThirdParty, lemonSqueezyOrderCreated } from "./helpers/stubs";

test("paid signup (simulated): admin link → /pay → signed webhook → groom account provisioned", async ({ page, request }) => {
  const RUN = String(Date.now()).slice(-7);
  const USERNAME = `simtest${RUN}`;
  const PHONE = `+97250${RUN}`; // +972 50 + 7 digits = a valid 9-digit IL mobile

  // Stay offline/deterministic: 204 any real third-party (lemonsqueezy.com, wa.me…).
  await blockThirdParty(page);

  // ── A. Admin mints a Premium link ──────────────────────────────────────────
  await loginAsAdmin(page);
  await page.getByTestId("nav-admin-paylinks").click();
  await expect(page).toHaveURL(/\/portal\/admin\/payment-links/);
  await expect(page.getByTestId("btn-paylink-create")).toBeEnabled();
  const [linkResp] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/payments/links") && r.request().method() === "POST"),
    page.getByTestId("btn-paylink-create").click(),
  ]);
  expect(linkResp.status()).toBe(200);
  const token: string = (await linkResp.json()).token;
  expect(token).toMatch(/^[a-f0-9]{32}$/);

  // ── B. /pay page renders (overlay-host load-check) + reservation attempt ────
  await page.goto(`/pay/${token}`);
  await expect(page.getByText(/1,500/)).toBeVisible(); // Premium price renders
  await page.getByTestId("field-pay-username").fill(USERNAME);
  await page.locator("#field-pay-phone").fill(PHONE);
  await expect(page.getByTestId("btn-pay-submit")).toBeEnabled({ timeout: 10_000 });
  const [intentResp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/intent") && r.request().method() === "POST"),
    page.getByTestId("btn-pay-submit").click(),
  ]);
  // 200 → LS configured (a real checkout was created); 503 → LS API not configured,
  // the webhook-only path (custom_data fallback in payments.ts) still provisions.
  // Both are valid for this deterministic test.
  expect([200, 503]).toContain(intentResp.status());
  if (intentResp.status() === 200) {
    expect((await intentResp.json()).checkoutUrl).toContain("lemonsqueezy.com");
  }

  // ── C. Simulate the signed order_created webhook (LS cloud can't reach localhost) ──
  const webhookResp = await lemonSqueezyOrderCreated(request, {
    token,
    username: USERNAME,
    phone: PHONE,
    packageId: "premium",
    runId: RUN,
  });
  expect(webhookResp.status()).toBe(200);
  expect((await webhookResp.json()).received).toBe(true);

  // ── D. Assert the groom account + ledger were provisioned (admin view) ──────
  const adminLogin = await request.post(`${API}/auth/login`, {
    data: { username: TEST_USERS.admin.username, password: TEST_USERS.admin.password },
  });
  const adminTok: string = (await adminLogin.json()).idToken;
  const linksResp = await request.get(`${API}/payments/links`, { headers: { Authorization: `Bearer ${adminTok}` } });
  const links: Array<Record<string, unknown>> = (await linksResp.json()).links;
  const row = links.find((l) => l.token === token);
  expect(row, "minted link should appear in the admin list").toBeTruthy();
  // WhatsApp is unconfigured in the emulator → `delivery_failed`, but the groom
  // account IS created and the generated password is the admin-visible fallback.
  expect(["paid", "delivered", "delivery_failed"]).toContain(row!.status);
  expect(row!.createdUid, "a groom uid was created").toBeTruthy();
  expect(row!.generatedPassword, "generated password is shown to the admin").toBeTruthy();
});
