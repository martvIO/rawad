// Payment packages (price templates) — the SINGLE source of truth for what a
// groom can buy through an admin-minted payment link.
//
// ► EDIT PRICES / LABELS / FEATURES HERE. ◄
//
// This file is authoritative: the Stripe PaymentIntent amount is computed
// server-side from `amountIls` (never trusted from the client), the public
// /pay page reads labels+prices via GET /payments/packages, and the webhook
// reads `features` to stamp the new groom's permission flags. Keeping it in one
// place means changing a price never needs a code change anywhere else.
//
// Each package bundles:
//   - a bilingual label (Arabic + Hebrew) shown on the pay page + admin UI
//   - the charge amount in ILS (whole shekels; ×100 for Stripe's minor units)
//   - the per-groom feature flags it grants (mirrors the POST /users defaults
//     in routes/users.ts)
//
// Adding/renaming a package: add an entry keyed by a STABLE id. The id is stored
// on the user (paymentPackageId) and the purchases ledger, so never reuse an id
// for a different product.

import { DAY_MS } from "../constants/time";

export interface PackageFeatures {
  canSeeAttendance: boolean;
  canUsePhotographer: boolean;
  canUseBoardingPass: boolean;
}

export interface Package {
  id: string;
  label: { ar: string; he: string };
  amountIls: number;
  currency: "ils";
  features: PackageFeatures;
}

/** Public projection (no internal `features`) for the pay page + admin selector. */
export type PublicPackage = Omit<Package, "features">;

/** How long an admin-minted payment link stays valid before it is rejected. */
export const PAYMENT_LINK_TTL_MS = 7 * DAY_MS;

/**
 * How long a username stays reserved once a groom starts paying. Long enough to
 * finish a card payment, short enough that an abandoned checkout frees the name.
 */
export const RESERVATION_TTL_MS = 30 * 60 * 1000;

/**
 * The price list. Seeded to match the legacy PLAN_AMOUNTS_ILS (premium ₪1,500 /
 * vip ₪2,000) so prices don't move on day one. Feature flags mirror the POST
 * /users defaults: attendance + photographer ON, boarding-pass OFF — VIP adds
 * the wallet boarding pass.
 */
export const PACKAGES: Record<string, Package> = {
  premium: {
    id: "premium",
    label: { ar: "الباقة المميّزة", he: "חבילת פרימיום" },
    amountIls: 1500,
    currency: "ils",
    features: { canSeeAttendance: true, canUsePhotographer: true, canUseBoardingPass: false },
  },
  vip: {
    id: "vip",
    label: { ar: "باقة VIP الملكية", he: "חבילת VIP" },
    amountIls: 2000,
    currency: "ils",
    features: { canSeeAttendance: true, canUsePhotographer: true, canUseBoardingPass: true },
  },
};

/** Resolve a package by id, or null when the id is unknown / not a string. */
export function getPackage(id: unknown): Package | null {
  if (typeof id !== "string") return null;
  return Object.prototype.hasOwnProperty.call(PACKAGES, id) ? PACKAGES[id] : null;
}

/** Public projection for the pay page + admin selector — strips `features`. */
export function publicPackages(): PublicPackage[] {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return Object.values(PACKAGES).map(({ features, ...rest }) => rest);
}
