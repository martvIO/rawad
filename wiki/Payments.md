---
date: 2026-06-25
tags: [payments, stripe, billing, signup]
---

# Payments

Paid groom **self-signup** via Stripe Elements. The admin mints a single-use
payment link for a package; the groom opens it, picks a username + phone, and
pays on our own branded page; a webhook then auto-creates the groom account and
WhatsApps the login credentials. Replaces the previous "Stripe Payment Link
attached to an existing groom" flow entirely.

Related: [[Dawa]] · [[REST API Architecture]] · [[Security Model]] · [[User Roles]]
· [[Communication Settings]]

## Packages (price templates)

Authoritative price list lives in `backend/functions/src/config/packages.ts` —
**edit prices/labels/feature flags there**. Each package = `{ id, label{ar,he},
amountIls, currency:"ils", features{canSeeAttendance, canUsePhotographer,
canUseBoardingPass} }`. Seeded: Premium ₪1,500, VIP ₪2,000 (VIP adds the wallet
boarding pass). The PaymentIntent amount is computed server-side from this file
(never trusted from the client) and re-verified in the webhook.

## Flow
1. Admin → **Payment Links** tab (`AdminPaymentLinks.jsx`) → pick a package →
   `POST /payments/links` mints a single-use token at `paymentTokens/{token}`
   (role always `groom`, 7-day TTL) and returns a `payUrl` to share.
2. Groom opens `/pay/:token` (`PayPage.jsx`). `GET /payments/links/:token`
   resolves projected package fields; a live `GET /payments/username-available`
   check guards the username.
3. On submit, `POST /payments/links/:token/intent` atomically **reserves** the
   username (`usernameReservations`) and phone (`phoneReservations`), creates a
   Stripe **PaymentIntent** (server-authoritative amount), and returns a
   `clientSecret`. The groom pays with Stripe Elements (card tokenized in-browser).
4. `POST /payments/webhook` (public, **Stripe-Signature verified with Node
   crypto**, event `payment_intent.succeeded`) atomically **claims** the token
   (`status: provisioning`, serializes concurrent re-deliveries), re-verifies
   `pi.amount` against the package, then `createGroomAccount()` writes the Auth
   user + indices + `/users/{uid}` + `purchases/{token}` ledger + the admin-only
   `generatedPasswords/{uid}` in one atomic update, and WhatsApps the credentials.
5. Groom logs in → `mustChangePassword` gate (`PasswordChangeScreen.jsx`) forces
   a change; `POST /auth/change-password` clears the flag and purges the stored
   generated password.

## RTDB paths (all Function-only unless noted)
- `paymentTokens/{token}` — link state machine (pending→reserved→provisioning→
  paid→delivered / amount_mismatch / account_conflict / delivery_failed).
- `usernameReservations/{username}`, `phoneReservations/{phoneIdx}` — soft
  reservations (TTL'd by `expiresAt`).
- `generatedPasswords/{uid}` — admin-visible fallback password, **purged on the
  groom's first password change**. Read only via `GET /payments/links` (admin).
- `purchases/{token}` — admin-readable purchase ledger.
- `/users/{uid}` adds `paymentPackageId` + `mustChangePassword`; the webhook also
  stamps the legacy `paymentStatus/paymentPlan/paymentAmountIls/paymentPaidAt`
  fields so the Revenue analytics keep counting.

## Files
- backend: `api/routes/payments.ts`, `api/services/createGroomAccount.ts`,
  `config/packages.ts`, `passwordGen.ts`, `api/routes/auth.ts` (change-password),
  `whatsappConfig.ts` (credentials templates).
- frontend: `pages/PayPage.jsx`, `pages/portal/PasswordChangeScreen.jsx`,
  `pages/portal/admin/AdminPaymentLinks.jsx`, `services/payments.js`,
  `services/auth.js`, `pages/portal/Portal.jsx` (gate).
- rules: `paymentTokens / usernameReservations / phoneReservations /
  generatedPasswords / purchases` + user fields in `database.rules.json`.
- tests: `paymentsWebhook`, `createGroomAccount`, `packages`, `passwordGen`.

## Config (test mode → live)
Backend env: `STRIPE_SECRET_KEY` (sk_test_…), `STRIPE_WEBHOOK_SECRET` (whsec_…);
point a Stripe webhook at `…/api/payments/webhook` for **`payment_intent.succeeded`**.
Frontend build env: `VITE_STRIPE_PUBLISHABLE_KEY` (pk_test_…). WhatsApp delivery
needs Meta-approved templates `WHATSAPP_CREDENTIALS_TEMPLATE_AR/_HE` (3 body vars).
Until set, the pay endpoints return `503 stripe_not_configured` and credential
delivery degrades to the admin reading the password from the Payment Links tab.
