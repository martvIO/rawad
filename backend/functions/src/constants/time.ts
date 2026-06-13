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
