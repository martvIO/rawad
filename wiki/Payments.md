---
date: 2026-06-25
tags: [payments, lemonsqueezy, billing, signup]
---

# Payments

Paid groom **self-signup** via **Lemon Squeezy** (overlay checkout). The admin mints
a single-use payment link for a package; the groom opens it on our branded page,
picks a username + phone, and pays in the **Lemon Squeezy checkout overlay** (LS is a
Merchant of Record, so the card UI is theirs but opens as a modal on our page). A
webhook then auto-creates the groom account and WhatsApps the login credentials.

> History: this flow was first built on Stripe Elements, then the **payment provider
> was swapped to Lemon Squeezy** (UI unchanged — only the checkout creation + webhook
> verification differ). All account-provisioning is provider-agnostic and was reused.

Related: [[Dawa]] · [[REST API Architecture]] · [[Security Model]] · [[User Roles]]
· [[Communication Settings]]

## Packages (price templates)

`backend/functions/src/config/packages.ts` holds each package = `{ id, label{ar,he},
amountIls, currency:"ils", features{…} }`. Premium ₪1,500 / VIP ₪2,000. With LS, the
**LS variant price is what the groom is charged** (set in the LS dashboard, tax-inclusive);
`amountIls` is the display/record value and must be kept in sync by hand. Each package
maps to an LS variant id via `variantIdFor(id)` → env `LS_VARIANT_ID_<ID>`.

## Flow
1. Admin → **Payment Links** tab → pick a package → `POST /payments/links` mints a
   single-use token at `paymentTokens/{token}` (role always `groom`, 7-day TTL).
2. Groom opens `/pay/:token` (`PayPage.jsx`). `GET /payments/links/:token` resolves
   projected package fields; a live `GET /payments/username-available` check guards
   the username.
3. On Pay, `POST /payments/links/:token/intent` atomically **reserves** the username
   (`usernameReservations`) + phone (`phoneReservations`), then creates an **LS checkout**
   for the package's variant with `checkout_data.custom = {token, username, phone,
   package_id}` and `checkout_options.embed=true`, and returns `{ checkoutUrl }`.
4. The frontend opens that URL in the **Lemon.js overlay**; on `Checkout.Success` it
   shows the success screen. (Card entry is LS's; our page is untouched.)
5. `POST /payments/webhook` (public, **X-Signature** HMAC-SHA256 verified, event
   `order_created`, status `paid`) atomically **claims** the token, **verifies the order's
   variant** matches the package (amount-tamper guard), then `createGroomAccount()` writes
   the Auth user + indices + `/users/{uid}` + `purchases/{token}` (with the real
   `amountPaidCents` + LS `orderId`) + admin-only `generatedPasswords/{uid}`, and WhatsApps
   the credentials.
6. Groom logs in → `mustChangePassword` gate (`PasswordChangeScreen.jsx`) → change →
   flag + stored password cleared.

## RTDB paths (Function-only unless noted)
`paymentTokens/{token}` (state machine), `usernameReservations` + `phoneReservations`
(soft reservations), `generatedPasswords/{uid}` (admin-visible fallback, purged on first
change; read only via `GET /payments/links` — now **decrypted server-side**), `purchases/{token}`
(admin-readable ledger), `/users/{uid}` adds `paymentPackageId` + `mustChangePassword` (+ legacy
`payment*` KPI fields).

**As of 2026-07-04** the webhook stores the generated password as an `enc:v1:` RSA-OAEP
envelope (not plaintext), and the WhatsApp send was extracted to the shared
`api/services/credentialsDelivery.ts` (`deliverCredentials` now just stamps token status
around it). The same machinery + encryption is reused by admin-created groom/driver accounts
— see [[Authentication]] (generated-credentials section) and [[Architecture Decisions]].

## Files
- backend: `api/routes/payments.ts` (LS checkout + `order_created` webhook +
  `verifyLemonSignature`), `api/services/createGroomAccount.ts`, `config/packages.ts`
  (`variantIdFor`), `passwordGen.ts`, `auth.ts` (change-password), `whatsappConfig.ts`.
- frontend: `pages/PayPage.jsx` (Lemon.js overlay), `services/payments.js` (`createCheckout`),
  `pages/portal/PasswordChangeScreen.jsx`, `pages/portal/admin/AdminPaymentLinks.jsx`.
- tests: `paymentsWebhook` (`verifyLemonSignature` + `order_created`), `createGroomAccount`,
  `packages`, `passwordGen`.

## Config (test mode → live)
Backend env: `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID` (ILS store),
`LEMONSQUEEZY_WEBHOOK_SECRET`, `LS_VARIANT_ID_PREMIUM`, `LS_VARIANT_ID_VIP`. Operator
setup in the LS dashboard: a product with Premium + VIP variants (priced in ₪,
tax-inclusive), and a webhook to `<host>/api/payments/webhook` for `order_created`. No
frontend key (the overlay loads the public lemon.js script). Until set, the pay endpoints
return `503 lemonsqueezy_not_configured` and credential delivery degrades to the admin
reading the password from the Payment Links tab.
