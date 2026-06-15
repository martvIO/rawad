---
date: 2026-06-14
tags: [payments, stripe, billing]
---

# Payments

Stripe-based payment links for the two digital plans (Premium ₪2,500 / VIP ₪3,500),
added in [[Audit Remediation 2026]] Phase 3 (audit req 2). Built in **test mode**;
goes live by setting real keys — no code change.

Related: [[Dawa]] · [[REST API Architecture]] · [[Security Model]] · [[User Roles]]
· [[Audit Remediation 2026]] · [[Product Audit 2026-06-13]]

## Flow
1. Admin opens a groom in the user editor → picks a plan → **Create payment link**.
2. `POST /payments/:uid` (admin-only, rate-limited) creates a Stripe **Price** then a
   **Payment Link** on the fly (no dashboard pre-setup), persists
   `paymentPlan/paymentStatus/paymentLinkUrl/paymentLinkId/...` on the groom's
   `/users/{uid}` record, and writes a reverse index `/stripePaymentLinks/{linkId} → uid`.
3. Admin sends the link to the groom via **Copy** or **Send on WhatsApp**.
4. `POST /payments/webhook` (public, **Stripe-Signature verified with Node crypto**,
   no SDK) handles `checkout.session.completed` → looks up the uid by
   `session.payment_link` → sets `paymentStatus: "paid"`. (Webhook is registered
   BEFORE the `/:uid` route so Express doesn't shadow it — see commit `fa5d3bb`.)

## Files
- `backend/functions/src/api/routes/payments.ts` (route + `verifyStripeSignature`)
- `frontend/src/services/payments.js`, PaymentSection in `AdminUserManager.jsx`
- payment fields + `.validate` rules on `/users` in `database.rules.json`
- tests: `backend/tests/functions/paymentsWebhook.test.ts`

## Config (test mode → live)
`STRIPE_SECRET_KEY` (sk_test_…), `STRIPE_WEBHOOK_SECRET` (whsec_…) read from the
function env; endpoints return `503 stripe_not_configured` until set. Point a Stripe
webhook at `…/api/payments/webhook` for `checkout.session.completed`. Amounts live
in a backend constant (`PLAN_AMOUNTS_ILS`) for now — moving them to
[[Communication Settings]]/adminSettings is a noted follow-up.
