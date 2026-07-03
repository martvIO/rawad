// External-boundary stubs — so the cross-role journeys complete deterministically
// without firing anything real (WhatsApp messages, payment charges, AWS calls).
//
// Policy (decided during planning): we STUB AT THE BOUNDARY. The emulator already
// degrades WhatsApp/Face-match gracefully (no creds → handled error, no crash), so
// the only true outbound hop we must simulate is the Lemon Squeezy `order_created`
// webhook (LS cloud can't reach localhost). GPS + camera + file uploads are
// injected through Playwright's own device APIs.

import { expect, type APIRequestContext, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { TEST_USERS } from "./seed";

/** Functions-emulator base for the Express API (matches paid-signup-ls.spec). */
export const API = process.env.E2E_API_BASE ?? "http://127.0.0.1:5001/dawa-aa793/us-central1/api";

/** Lemon Squeezy test config — overridable via backend/functions/.env.local. */
export const LS = {
  webhookSecret: process.env.LEMONSQUEEZY_WEBHOOK_SECRET ?? "LEMONSQUEEZY_WEBHOOK_SECRET",
  premiumVariant: Number(process.env.LS_VARIANT_ID_PREMIUM ?? 1835519),
  vipVariant: Number(process.env.LS_VARIANT_ID_VIP ?? 0),
};

/** A few Israel/north-region coordinates for geolocation injection. */
export const GEO = {
  haifa: { latitude: 32.794, longitude: 34.9896, accuracy: 12 },
  nazareth: { latitude: 32.7021, longitude: 35.2978, accuracy: 15 },
} as const;

/** Grant + set a fixed geolocation so the GPS-share / "use my location" buttons
 * resolve instantly and deterministically (no real device prompt). */
export async function grantGeolocation(
  context: BrowserContext,
  coords: { latitude: number; longitude: number; accuracy?: number } = GEO.haifa,
): Promise<void> {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy });
}

// A 1×1 PNG (transparent) as raw bytes — used to satisfy file/photo inputs
// without shipping a binary fixture. Camera capture inputs accept this the same
// way a real photo would.
const ONE_PX_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/** Upload an in-memory image to a file input (proof photo, media, photographer). */
export async function uploadInlineImage(input: Locator, name = "proof.png"): Promise<void> {
  await input.setInputFiles({ name, mimeType: "image/png", buffer: ONE_PX_PNG });
}

/** A small CSV / vCard payload for the bulk-import file uploads. */
export const FIXTURES = {
  guestsCsv: "name,phone\nLayla Test,0501234567\nKareem Test,0507654321\n",
  guestsVcf:
    "BEGIN:VCARD\nVERSION:3.0\nFN:Layla Test\nTEL:0501234567\nEND:VCARD\n" +
    "BEGIN:VCARD\nVERSION:3.0\nFN:Kareem Test\nTEL:0507654321\nEND:VCARD\n",
};

export async function uploadInlineText(input: Locator, name: string, content: string, mimeType: string): Promise<void> {
  await input.setInputFiles({ name, mimeType, buffer: Buffer.from(content, "utf8") });
}

/** POST a correctly-signed Lemon Squeezy `order_created` webhook to the local
 * functions emulator, simulating a completed payment. Mirrors the proven shape
 * in paid-signup-ls.spec.ts. Returns the webhook response. */
export async function lemonSqueezyOrderCreated(
  request: APIRequestContext,
  opts: { token: string; username: string; phone: string; packageId?: string; variantId?: number; runId?: string },
) {
  const runId = opts.runId ?? opts.token.slice(0, 7);
  const variantId = opts.variantId ?? LS.premiumVariant;
  const payload = JSON.stringify({
    meta: {
      event_name: "order_created",
      custom_data: { token: opts.token, username: opts.username, phone: opts.phone, package_id: opts.packageId ?? "premium" },
    },
    data: {
      id: `e2e-order-${runId}`,
      attributes: { status: "paid", total: 150000, currency: "ILS", first_order_item: { variant_id: variantId } },
    },
  });
  const sig = createHmac("sha256", LS.webhookSecret).update(Buffer.from(payload, "utf8")).digest("hex");
  return request.post(`${API}/payments/webhook`, {
    headers: { "Content-Type": "application/json", "x-signature": sig },
    data: payload,
  });
}

// ─── Admin API helpers (paid-signup lifecycle assertions) ───────────────────

/** Log in as the seeded admin and return a Bearer idToken for direct API calls. */
export async function adminIdToken(request: APIRequestContext): Promise<string> {
  const resp = await request.post(`${API}/auth/login`, {
    data: { username: TEST_USERS.admin.username, password: TEST_USERS.admin.password },
  });
  return (await resp.json()).idToken as string;
}

/** Admin `GET /payments/links` row for a token (status, createdUid, generatedPassword, amountIls…). */
export async function adminPaymentLinksRow(
  request: APIRequestContext,
  token: string,
  tok?: string,
): Promise<Record<string, unknown> | undefined> {
  const bearer = tok ?? (await adminIdToken(request));
  const resp = await request.get(`${API}/payments/links`, { headers: { Authorization: `Bearer ${bearer}` } });
  const links: Array<Record<string, unknown>> = (await resp.json()).links ?? [];
  return links.find((l) => l.token === token);
}

/** Admin `GET /users` row for a username (full profile incl. feature flags + paymentPackageId). */
export async function adminUserByUsername(
  request: APIRequestContext,
  username: string,
  tok?: string,
): Promise<Record<string, unknown> | undefined> {
  const bearer = tok ?? (await adminIdToken(request));
  const resp = await request.get(`${API}/users`, { headers: { Authorization: `Bearer ${bearer}` } });
  const body = await resp.json();
  // GET /users returns a bare array (userStore.listUsers()); tolerate {users:[…]} too.
  const users: Array<Record<string, unknown>> = Array.isArray(body) ? body : (body.users ?? []);
  return users.find((u) => u.username === username);
}

export interface ProvisionedGroom {
  token: string;
  username: string;
  phone: string;
  generatedPassword: string;
  createdUid: string;
}

/** Drive a full simulated paid signup for one package and return the provisioned
 * identity. Mints the link via the admin API (package-agnostic), does the public
 * `/pay` UI (price + form + tolerant intent 200|503), fires the signed
 * `order_created` webhook with the package's variant, then polls the admin list
 * until the account is provisioned. Assumes `blockThirdParty(page)` is applied. */
export async function provisionPaidGroom(
  page: Page,
  request: APIRequestContext,
  opts: { packageId: "premium" | "vip"; variantId: number; priceText: RegExp; runId?: string },
): Promise<ProvisionedGroom> {
  const runId = opts.runId ?? String(Date.now()).slice(-7);
  const username = `lc${opts.packageId}${runId}`; // lowercased, valid username
  const phone = `+97250${runId.slice(-7).padStart(7, "0")}`; // +972 50 + 7 digits

  // Mint via admin API (deterministic, package-agnostic — UI mint is covered elsewhere).
  const bearer = await adminIdToken(request);
  const mint = await request.post(`${API}/payments/links`, {
    headers: { Authorization: `Bearer ${bearer}` },
    data: { packageId: opts.packageId },
  });
  expect(mint.status(), "admin mints a payment link").toBe(200);
  const token = (await mint.json()).token as string;
  expect(token).toMatch(/^[a-f0-9]{32}$/);

  // Public /pay UI: price renders, form fills, Pay enables, intent fires (200 or 503).
  await page.goto(`/pay/${token}`);
  await expect(page.getByText(opts.priceText)).toBeVisible();
  await page.getByTestId("field-pay-username").fill(username);
  await page.locator("#field-pay-phone").fill(phone);
  await expect(page.getByTestId("btn-pay-submit")).toBeEnabled({ timeout: 10_000 });
  const [intentResp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/intent") && r.request().method() === "POST"),
    page.getByTestId("btn-pay-submit").click(),
  ]);
  expect([200, 503]).toContain(intentResp.status());

  // Signed order_created webhook (LS cloud can't reach localhost).
  const webhook = await lemonSqueezyOrderCreated(request, {
    token, username, phone, packageId: opts.packageId, variantId: opts.variantId, runId,
  });
  expect(webhook.status()).toBe(200);
  expect((await webhook.json()).received).toBe(true);

  // The webhook provisions asynchronously relative to its 200 — poll the admin row.
  await expect
    .poll(async () => (await adminPaymentLinksRow(request, token, bearer))?.createdUid, { timeout: 15_000 })
    .toBeTruthy();
  const row = (await adminPaymentLinksRow(request, token, bearer))!;
  return {
    token,
    username,
    phone,
    createdUid: row.createdUid as string,
    generatedPassword: row.generatedPassword as string,
  };
}

/** Block real third-party network calls so a run stays offline + deterministic,
 * AND abort never-closing SSE streams (live-location EventSource) which otherwise
 * pile up across a long crawl and exhaust the dev server's connections
 * (ERR_INSUFFICIENT_RESOURCES → cascading page.goto timeouts). Same-origin +
 * functions-emulator traffic otherwise passes through. */
export async function blockThirdParty(page: Page): Promise<void> {
  await page.route("**/*", (route) => {
    const url = route.request().url();
    // Long-lived SSE streams never close on navigation within one context.
    if (/\/live-locations\/[^/]+\/stream/.test(url)) return route.abort();
    const allow =
      url.startsWith("http://localhost") ||
      url.startsWith("http://127.0.0.1") ||
      url.startsWith("https://dawa-aa793.web.app") ||
      url.startsWith("data:") ||
      url.startsWith("blob:");
    if (allow) return route.continue();
    if (/wa\.me|lemonsqueezy\.com|amazonaws\.com|google|gstatic|tile|sentry\.io/i.test(url)) {
      return route.fulfill({ status: 204, body: "" });
    }
    return route.continue();
  });
}
