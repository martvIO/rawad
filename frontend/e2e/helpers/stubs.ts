// External-boundary stubs — so the cross-role journeys complete deterministically
// without firing anything real (WhatsApp messages, payment charges, AWS calls).
//
// Policy (decided during planning): we STUB AT THE BOUNDARY. The emulator already
// degrades WhatsApp/Face-match gracefully (no creds → handled error, no crash), so
// the only true outbound hop we must simulate is the Lemon Squeezy `order_created`
// webhook (LS cloud can't reach localhost). GPS + camera + file uploads are
// injected through Playwright's own device APIs.

import type { APIRequestContext, BrowserContext, Locator, Page } from "@playwright/test";
import { createHmac } from "node:crypto";

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

/** Block real third-party network calls so a run stays offline + deterministic.
 * Lets same-origin + the functions emulator through; short-circuits the rest. */
export async function blockThirdParty(page: Page): Promise<void> {
  await page.route("**/*", (route) => {
    const url = route.request().url();
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
