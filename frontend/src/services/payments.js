// Admin-only payments service. Creates a Stripe payment link for a groom's plan;
// the admin then sends it over WhatsApp. The backend marks the groom "paid" via
// a Stripe webhook (no client polling needed — the /users subscription picks up
// paymentStatus).
import { api } from "../utils/apiClient.js";

/**
 * Create a Stripe payment link for `uid` on `plan` ("premium" | "vip").
 * Returns { url, linkId, plan, amountIls, mode }. Throws ApiError on failure
 * (e.g. body.error === "stripe_not_configured" when keys aren't set yet).
 */
export async function createPaymentLink(uid, plan) {
  return api.post(`/payments/${encodeURIComponent(uid)}`, { plan });
}
