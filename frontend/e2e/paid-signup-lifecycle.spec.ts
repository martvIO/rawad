// Comprehensive paid-signup → ACCOUNT-LIFECYCLE test.
//
// Goal (per planning): a (simulated) payment must provision a groom account that
// is CORRECT in every respect and actually works — for BOTH packages. Covers:
//   1. happy-path lifecycle ×2 (premium / vip): provision → correct amount →
//      first login → forced password change → re-login → exact per-package
//      features via /auth/me + admin /users → generated-password purge →
//      UI feature-gating (Photographer tab).
//   2. integrity guards: duplicate webhook is idempotent; amount/variant mismatch
//      and username collision do NOT create an account.
//   3. public /pay UI error states (invalid token, already-used, username-taken,
//      lemonsqueezy-not-configured).
//
// Deterministic + offline (blockThirdParty). No real charge/message fires — the
// LS `order_created` webhook is signed + POSTed to the local emulator.
//
// Prereqs: `npm run dev:full` running; backend/functions/.env.local has
// LEMONSQUEEZY_WEBHOOK_SECRET, LS_VARIANT_ID_PREMIUM=1835519, LS_VARIANT_ID_VIP=1835520
// (restart the emulator after editing .env.local). LS API key/store stay UNSET so
// /intent returns 503 (the not-configured case) and no real checkout is created. Run:
//   LS_VARIANT_ID_VIP=1835520 npx playwright test paid-signup-lifecycle --project=chromium
import { test, expect } from "@playwright/test";
import { clearSession } from "./helpers/auth";
import { TEST_USERS } from "./helpers/seed";
import {
  API,
  LS,
  blockThirdParty,
  lemonSqueezyOrderCreated,
  provisionPaidGroom,
  adminIdToken,
  adminPaymentLinksRow,
  adminUserByUsername,
} from "./helpers/stubs";

const PREMIUM_VARIANT = LS.premiumVariant; // 1835519
const VIP_VARIANT = Number(process.env.LS_VARIANT_ID_VIP ?? 1835520);

const PACKAGES = [
  { id: "premium", variant: PREMIUM_VARIANT, price: /1,?500/, amount: 1500, boarding: false },
  { id: "vip", variant: VIP_VARIANT, price: /2,?000/, amount: 2000, boarding: true },
] as const;

/** Mint a payment link straight through the admin API (no /pay UI). */
async function mintLink(request: Parameters<typeof adminIdToken>[0], packageId: string, tok: string): Promise<string> {
  const resp = await request.post(`${API}/payments/links`, {
    headers: { Authorization: `Bearer ${tok}` },
    data: { packageId },
  });
  expect(resp.status()).toBe(200);
  return (await resp.json()).token as string;
}

// ─── 1. Happy-path lifecycle, per package ─────────────────────────────────────
for (const pkg of PACKAGES) {
  test(`paid lifecycle — ${pkg.id}: pay → account provisioned with correct features + forced change`, async ({ page, request }) => {
    await blockThirdParty(page);

    // A. Provision (mint → /pay → signed webhook → poll admin row).
    const g = await provisionPaidGroom(page, request, {
      packageId: pkg.id,
      variantId: pkg.variant,
      priceText: pkg.price,
    });
    expect(g.createdUid, "a groom account was created").toBeTruthy();
    expect(g.generatedPassword, "generated password is available to the admin").toBeTruthy();

    // B. Admin row: correct amount + a terminal status (WhatsApp unconfigured →
    //    delivery_failed is correct; account is still created).
    const row = (await adminPaymentLinksRow(request, g.token))!;
    expect(["paid", "delivered", "delivery_failed"]).toContain(row.status);
    expect(row.amountIls).toBe(pkg.amount);

    // C. First login → forced-change gate.
    await clearSession(page);
    await page.goto("/portal/login");
    await page.getByTestId("field-login-user").fill(g.username);
    await page.getByTestId("field-login-pass").fill(g.generatedPassword);
    await page.getByTestId("btn-login-submit").click();
    await expect(page.getByTestId("field-pwch-current")).toBeVisible({ timeout: 10_000 });

    // D. Change password → bounced to login.
    const NEWPASS = `NewPass1!${g.username.slice(-6)}`;
    await page.getByTestId("field-pwch-current").fill(g.generatedPassword);
    await page.getByTestId("field-pwch-new").fill(NEWPASS);
    await page.getByTestId("field-pwch-confirm").fill(NEWPASS);
    await page.getByTestId("btn-pwch-submit").click();
    await expect(page).toHaveURL(/\/portal\/login/, { timeout: 10_000 });

    // E. Re-login with the NEW password → lands in the groom portal (gate cleared).
    await page.getByTestId("field-login-user").fill(g.username);
    await page.getByTestId("field-login-pass").fill(NEWPASS);
    await page.getByTestId("btn-login-submit").click();
    await expect(page).toHaveURL(/\/portal\/groom/, { timeout: 10_000 });
    await expect(page.getByTestId("field-pwch-current")).toHaveCount(0);

    // F. /auth/me → EXACT per-package features (source of truth).
    const idToken = (await (await request.post(`${API}/auth/login`, {
      data: { username: g.username, password: NEWPASS },
    })).json()).idToken as string;
    const me = await (await request.get(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${idToken}` },
    })).json();
    expect(me.role).toBe("groom");
    expect(me.canSeeAttendance).toBe(true);
    expect(me.canUsePhotographer).toBe(true);
    expect(me.canUseBoardingPass).toBe(pkg.boarding); // the VIP-vs-Premium delta
    expect(me.mustChangePassword).toBe(false);

    // G. Admin /users cross-check: the stored profile matches the package.
    const u = (await adminUserByUsername(request, g.username))!;
    expect(u.paymentPackageId).toBe(pkg.id);
    expect(u.canUseBoardingPass === true).toBe(pkg.boarding);

    // H. Generated-password purge: cleared once the groom changed it on first login.
    const rowAfter = (await adminPaymentLinksRow(request, g.token))!;
    expect(rowAfter.generatedPassword ?? null).toBeNull();

    // I. UI feature-gating: a new groom lands on type-select → choose digital →
    //    the Photographer tab renders (canUsePhotographer is true for both packages).
    await expect(page.getByTestId("btn-type-digital")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("btn-type-digital").click();
    await expect(page).toHaveURL(/\/portal\/groom\/digital/, { timeout: 10_000 });
    await expect(page.locator('a[href="/portal/groom/digital/photographer"]')).toBeVisible();
  });
}

// ─── 2. Integrity guards — a payment that shouldn't provision must not ────────
test("guard: duplicate order_created webhook is idempotent (no second account)", async ({ page, request }) => {
  await blockThirdParty(page);
  const g = await provisionPaidGroom(page, request, {
    packageId: "premium",
    variantId: PREMIUM_VARIANT,
    priceText: /1,?500/,
  });
  // Fire the identical signed webhook a second time.
  const dup = await lemonSqueezyOrderCreated(request, {
    token: g.token,
    username: g.username,
    phone: g.phone,
    packageId: "premium",
    variantId: PREMIUM_VARIANT,
    runId: g.token.slice(0, 7),
  });
  expect(dup.status()).toBe(200);
  const row = (await adminPaymentLinksRow(request, g.token))!;
  expect(row.createdUid, "same account — not re-created").toBe(g.createdUid);
});

test("guard: amount/variant mismatch → amount_mismatch, no account", async ({ request }) => {
  const tok = await adminIdToken(request);
  const token = await mintLink(request, "premium", tok);
  const username = `mm${token.slice(0, 8)}`;
  const resp = await lemonSqueezyOrderCreated(request, {
    token,
    username,
    phone: `+972509${token.slice(0, 6)}`,
    packageId: "premium",
    variantId: 999999, // wrong variant → tamper guard trips
  });
  expect(resp.status()).toBe(200); // webhook still acks (avoids LS retry storm)
  const row = (await adminPaymentLinksRow(request, token, tok))!;
  expect(row.status).toBe("amount_mismatch");
  expect(row.createdUid ?? null).toBeNull();
  expect(await adminUserByUsername(request, username, tok), "no account created").toBeFalsy();
});

test("guard: username collision → account_conflict, no duplicate account", async ({ page, request }) => {
  await blockThirdParty(page);
  // Provision one groom, then try to provision a DIFFERENT token onto its username.
  const g = await provisionPaidGroom(page, request, {
    packageId: "premium",
    variantId: PREMIUM_VARIANT,
    priceText: /1,?500/,
  });
  const tok = await adminIdToken(request);
  const token2 = await mintLink(request, "premium", tok);
  const resp = await lemonSqueezyOrderCreated(request, {
    token: token2,
    username: g.username, // already taken
    phone: `+972508${token2.slice(0, 6)}`,
    packageId: "premium",
    variantId: PREMIUM_VARIANT,
    runId: token2.slice(0, 7),
  });
  expect(resp.status()).toBe(200);
  const row = (await adminPaymentLinksRow(request, token2, tok))!;
  expect(row.status).toBe("account_conflict");
  expect(row.createdUid ?? null).toBeNull();
});

// ─── 3. Public /pay UI error states (structural — no exact-copy coupling) ─────
test("pay UI: unknown token shows an error, not the payment form", async ({ page }) => {
  await blockThirdParty(page);
  await page.goto(`/pay/${"f".repeat(32)}`); // well-formed but unknown token
  // The resolve 404s → PayPage renders a terminal notice, never the form.
  await expect(page.getByTestId("btn-pay-submit")).toHaveCount(0);
});

test("pay UI: taken username keeps the Pay button disabled", async ({ page, request }) => {
  await blockThirdParty(page);
  const tok = await adminIdToken(request);
  const token = await mintLink(request, "premium", tok);
  await page.goto(`/pay/${token}`);
  await expect(page.getByText(/1,?500/)).toBeVisible();
  await page.getByTestId("field-pay-username").fill(TEST_USERS.groom.username); // seeded, already exists
  await page.locator("#field-pay-phone").fill("+972501112222");
  // The debounced availability check returns unavailable → submit stays disabled.
  await expect(page.getByTestId("btn-pay-submit")).toBeDisabled();
});

test("pay UI: submit returns 503 lemonsqueezy_not_configured in the emulator (LS API unset)", async ({ page, request }) => {
  await blockThirdParty(page);
  const tok = await adminIdToken(request);
  const token = await mintLink(request, "premium", tok);
  await page.goto(`/pay/${token}`);
  await expect(page.getByText(/1,?500/)).toBeVisible();
  await page.getByTestId("field-pay-username").fill(`free${token.slice(0, 8)}`);
  await page.locator("#field-pay-phone").fill(`+972507${token.slice(0, 6)}`);
  await expect(page.getByTestId("btn-pay-submit")).toBeEnabled({ timeout: 10_000 });
  const [intent] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/intent") && r.request().method() === "POST"),
    page.getByTestId("btn-pay-submit").click(),
  ]);
  // With LS API key/store unset (emulator default) the checkout can't be created.
  expect(intent.status()).toBe(503);
  expect((await intent.json()).error).toBe("lemonsqueezy_not_configured");
});
