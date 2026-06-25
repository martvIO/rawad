// Payments service — paid groom signup via Stripe Elements.
//
// Two audiences:
//   • Admin: list packages, mint a single-use payment link, list created links.
//   • Public (the /pay/:token page): resolve a link, check username availability,
//     create a PaymentIntent (server returns a clientSecret for Stripe.js).
//
// The card itself is confirmed client-side by Stripe.js; the account is created
// by the backend webhook on payment_intent.succeeded — there is no client polling.
import { api } from "../utils/apiClient.js";

// ─── Admin ──────────────────────────────────────────────────────────────────

/**
 * Mint a single-use payment link for a package. Returns
 * `{ token, expiresAt, packageId, payUrl }`. Throws ApiError on failure
 * (e.g. body.error === "invalid_package").
 */
export async function createPaymentLink(packageId) {
  return api.post("/payments/links", { packageId });
}

/** List every minted link with its status (+ generated password until purged). */
export async function listPaymentLinks() {
  const data = await api.get("/payments/links");
  return data.links ?? [];
}

// ─── Public (pay page) ────────────────────────────────────────────────────────

/** The package price list shown on the pay page (no internal feature flags). */
export async function getPackages() {
  const data = await api.get("/payments/packages", { skipAuth: true });
  return data.packages ?? [];
}

/** Resolve a payment link by token → `{ status, expiresAt, packageId, package }`. */
export async function resolvePaymentToken(token) {
  return api.get(`/payments/links/${encodeURIComponent(token)}`, { skipAuth: true });
}

/** Live username-availability check for the pay page → boolean. */
export async function checkUsernameAvailable(username) {
  const data = await api.get(
    `/payments/username-available?u=${encodeURIComponent(username)}`,
    { skipAuth: true },
  );
  return data.available === true;
}

/**
 * Reserve the chosen username + create a Stripe PaymentIntent for this link.
 * Returns `{ clientSecret }` for Stripe.js `confirmPayment`. Throws ApiError with
 * body.error in { token_not_found, already_used, token_expired, username_taken,
 * phone_taken, package_unavailable, stripe_not_configured, ... }.
 */
export async function createPaymentIntent(token, { username, phoneE164, lang }) {
  return api.post(
    `/payments/links/${encodeURIComponent(token)}/intent`,
    { username, phoneE164, lang },
    { skipAuth: true },
  );
}
