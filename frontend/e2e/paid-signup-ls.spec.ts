// End-to-end test for the Lemon Squeezy paid-signup flow, from an admin minting
// a payment link through to a groom account being created and forced to change
// its password on first login.
//
// The ONE non-UI hop is the Lemon Squeezy `order_created` webhook: LS (cloud)
// cannot reach the local emulator, so after the UI drives the REAL LS checkout
// creation (the overlay opens against the live LS API), we POST a correctly-signed
// `order_created` payload to the local webhook — exercising the real provisioning
// code path (signature verify → atomic claim → variant check → createGroomAccount).
//
// Prereqs: emulators + Vite running (`npm run dev:full`), LEMONSQUEEZY_* set in
// backend/functions/.env.local. Run e.g.:
//   PLAYWRIGHT_BASE_URL=http://localhost:5174 npx playwright test paid-signup-ls --project=chromium
import { test, expect } from "@playwright/test";
import { createHmac } from "crypto";
import { loginAsAdmin, clearSession } from "./helpers/auth";
import { TEST_USERS } from "./helpers/seed";

const API = "http://127.0.0.1:5001/dawa-aa793/us-central1/api";
// Must match LEMONSQUEEZY_WEBHOOK_SECRET in backend/functions/.env.local.
const WEBHOOK_SECRET = "LEMONSQUEEZY_WEBHOOK_SECRET";
const PREMIUM_VARIANT = 1835519; // LS_VARIANT_ID_PREMIUM

test("paid signup: admin link → /pay → LS checkout → webhook → groom account → forced change", async ({ page, request }) => {
  const RUN = String(Date.now()).slice(-7);
  const USERNAME = `lstest${RUN}`;
  const PHONE = `+97250${RUN}`; // +972 50 + 7 digits = a valid 9-digit IL mobile

  // ── A. Admin mints a Premium link ──────────────────────────────────────────
  await loginAsAdmin(page);
  // Navigate client-side (clicking the tab) — a full page.goto reload would drop
  // the in-memory session and bounce to the login screen.
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

  // ── B. Groom opens /pay/:token, picks username + phone, clicks Pay ──────────
  await page.goto(`/pay/${token}`);
  await expect(page.getByText(/1,500/)).toBeVisible(); // package price renders
  await page.getByTestId("field-pay-username").fill(USERNAME);
  await page.locator("#field-pay-phone").fill(PHONE);
  // Username availability + valid phone → Pay button enables.
  await expect(page.getByTestId("btn-pay-submit")).toBeEnabled({ timeout: 10_000 });
  const [intentResp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/intent") && r.request().method() === "POST"),
    page.getByTestId("btn-pay-submit").click(),
  ]);
  expect(intentResp.status()).toBe(200);
  const checkoutUrl: string = (await intentResp.json()).checkoutUrl;
  expect(checkoutUrl).toContain("lemonsqueezy.com"); // a REAL LS checkout was created

  // ── C. Simulate the LS order_created webhook (LS can't reach localhost) ─────
  const payload = JSON.stringify({
    meta: { event_name: "order_created", custom_data: { token, username: USERNAME, phone: PHONE, package_id: "premium" } },
    data: { id: `e2e-order-${RUN}`, attributes: { status: "paid", total: 150000, currency: "ILS", first_order_item: { variant_id: PREMIUM_VARIANT } } },
  });
  const sig = createHmac("sha256", WEBHOOK_SECRET).update(Buffer.from(payload, "utf8")).digest("hex");
  const webhookResp = await request.post(`${API}/payments/webhook`, {
    headers: { "Content-Type": "application/json", "x-signature": sig },
    data: payload,
  });
  expect(webhookResp.status()).toBe(200);
  expect((await webhookResp.json()).received).toBe(true);

  // ── D. Verify the account was provisioned (admin Payment Links view) ────────
  const adminLogin = await request.post(`${API}/auth/login`, {
    data: { username: TEST_USERS.admin.username, password: TEST_USERS.admin.password },
  });
  const adminTok: string = (await adminLogin.json()).idToken;
  const linksResp = await request.get(`${API}/payments/links`, { headers: { Authorization: `Bearer ${adminTok}` } });
  const links: Array<Record<string, unknown>> = (await linksResp.json()).links;
  const row = links.find((l) => l.token === token);
  expect(row, "minted link should appear in the admin list").toBeTruthy();
  // WhatsApp is unconfigured in the emulator → delivery_failed, but the account
  // is created and the generated password is the admin-visible fallback.
  expect(["paid", "delivered", "delivery_failed"]).toContain(row!.status);
  expect(row!.createdUid, "a groom uid was created").toBeTruthy();
  const generatedPassword = row!.generatedPassword as string;
  expect(generatedPassword, "generated password is shown to the admin").toBeTruthy();

  // ── E. Groom first login → forced password change → re-login ────────────────
  await clearSession(page);
  await page.goto("/portal/login");
  await page.getByTestId("field-login-user").fill(USERNAME);
  await page.getByTestId("field-login-pass").fill(generatedPassword);
  await page.getByTestId("btn-login-submit").click();
  // The forced-change gate renders PasswordChangeScreen instead of the dashboard.
  await expect(page.getByTestId("field-pwch-current")).toBeVisible({ timeout: 10_000 });

  const NEWPASS = `NewPass1!${RUN}`;
  await page.getByTestId("field-pwch-current").fill(generatedPassword);
  await page.getByTestId("field-pwch-new").fill(NEWPASS);
  await page.getByTestId("field-pwch-confirm").fill(NEWPASS);
  await page.getByTestId("btn-pwch-submit").click();
  await expect(page).toHaveURL(/\/portal\/login/, { timeout: 10_000 });

  // Re-login with the NEW password → lands on the groom portal, gate cleared.
  await page.getByTestId("field-login-user").fill(USERNAME);
  await page.getByTestId("field-login-pass").fill(NEWPASS);
  await page.getByTestId("btn-login-submit").click();
  await expect(page).toHaveURL(/\/portal\/groom/, { timeout: 10_000 });
  await expect(page.getByTestId("field-pwch-current")).toHaveCount(0); // not the change screen
});
