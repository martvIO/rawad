// Time-window constants used by Cloud Functions and Express routes.
//
// All values are in milliseconds and intentionally re-exported as a single
// const so a renamer can grep `HOUR_MS` and find every call site.

/** One hour. Used as the window for the in-memory rate limiter. */
export const HOUR_MS = 60 * 60 * 1000;

/** One day. */
export const DAY_MS = 24 * HOUR_MS;

/**
 * Invite token lifetime. After this many ms the token is rejected even
 * if it was never used.
 */
export const TOKEN_TTL_MS = 90 * DAY_MS;

/**
 * Signed download URL TTL for delivery-proof photos.
 *
 * TODO: verify the intended proof-URL lifetime. Historically the proofs.ts
 *       route used 1 hour while the digital-media route used 30 days, which
 *       feels inverted (digital media is more public, proofs are more
 *       sensitive). The two values are preserved separately for now so the
 *       refactor doesn't change behavior. Confirm and unify when possible.
 */
export const PROOF_DOWNLOAD_URL_TTL_MS = HOUR_MS;

/** Signed download URL TTL for digital invitation media (background, photos). */
export const MEDIA_DOWNLOAD_URL_TTL_MS = 30 * DAY_MS;
