"use strict";
// Time-window constants used by Cloud Functions and Express routes.
//
// All values are in milliseconds and intentionally re-exported as a single
// const so a renamer can grep `HOUR_MS` and find every call site.
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOKEN_TTL_MS = exports.DAY_MS = exports.HOUR_MS = void 0;
/** One hour. Used as the window for the in-memory rate limiter. */
exports.HOUR_MS = 60 * 60 * 1000;
/** One day. */
exports.DAY_MS = 24 * exports.HOUR_MS;
/**
 * Invite token lifetime. After this many ms the token is rejected even
 * if it was never used.
 */
exports.TOKEN_TTL_MS = 90 * exports.DAY_MS;
//# sourceMappingURL=time.js.map