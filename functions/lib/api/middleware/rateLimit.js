"use strict";
// Rate-limiting middleware for the Express REST API.
//
// Thin adapter over the existing in-memory `allow()` bucket limiter
// (`../../rateLimit`). Provides two factories:
//
//   - `ipRateLimit`  — keyed by client IP. For public/unauthenticated
//                      endpoints (e.g. login, OTP, public confirmation).
//   - `uidRateLimit` — keyed by authenticated caller UID. For admin
//                      endpoints that need per-user throttling. Must be
//                      chained AFTER `requireAuth` so `req.caller.uid`
//                      is populated.
//
// On exceed: 429 with body `{ error: "too_many_requests", retryAfterMs }`.
//
// What this file does NOT do:
//   - It does not persist counters across Cloud Function cold starts.
//     The underlying `allow()` is in-memory. Acceptable trade-off for
//     a single-instance abuse gate; for stricter cross-instance limits
//     swap the bucket store in `../../rateLimit.ts`.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ipRateLimit = ipRateLimit;
exports.uidRateLimit = uidRateLimit;
const rateLimit_1 = require("../../rateLimit");
/** Fallback IP key when Express cannot resolve the client address. */
const UNKNOWN_IP_KEY = "unknown";
/** Fallback UID key for anonymous calls that somehow reach a uidRateLimit. */
const ANON_UID_KEY = "anon";
/**
 * Throttle by client IP. Suitable for public endpoints that take no
 * auth (login, password-reset OTP, public confirmation submission).
 *
 * @param prefix     bucket-key namespace (keeps routes from sharing buckets)
 * @param maxPerHour maximum allowed requests in the window
 * @param windowMs   sliding-window duration in milliseconds
 */
/** True when running inside the Firebase local emulator suite. */
const IN_EMULATOR = process.env.FUNCTIONS_EMULATOR === "true";
function ipRateLimit(prefix, maxPerHour, windowMs) {
    return function ipGate(req, res, next) {
        // Skip rate limiting in emulator mode so e2e tests can login freely.
        if (IN_EMULATOR) {
            next();
            return;
        }
        const ip = resolveClientIp(req);
        const key = `${prefix}:${ip}`;
        if (!(0, rateLimit_1.allow)(key, maxPerHour, windowMs)) {
            res.status(429).json({
                error: "too_many_requests",
                scope: "ip",
            });
            return;
        }
        next();
    };
}
/**
 * Throttle by authenticated caller UID. Must be chained AFTER `requireAuth`
 * (which sets `req.caller.uid`).
 */
function uidRateLimit(prefix, maxPerHour, windowMs) {
    return function uidGate(req, res, next) {
        if (IN_EMULATOR) {
            next();
            return;
        }
        const uid = req.caller?.uid ?? ANON_UID_KEY;
        const key = `${prefix}:${uid}`;
        if (!(0, rateLimit_1.allow)(key, maxPerHour, windowMs)) {
            res.status(429).json({
                error: "too_many_requests",
                scope: "uid",
            });
            return;
        }
        next();
    };
}
/**
 * Resolve the client IP for rate-limit keying. Cloud Functions are
 * fronted by Google's load balancer, which sets `X-Forwarded-For` —
 * we trust the LEFTMOST entry there (the original client) when present,
 * otherwise fall back to `req.ip` (set by Express after `trust proxy`)
 * and finally to a constant so the limiter still functions.
 */
function resolveClientIp(req) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.length > 0) {
        // X-Forwarded-For format: "client, proxy1, proxy2" — take client.
        const first = forwarded.split(",")[0]?.trim();
        if (first)
            return first;
    }
    return req.ip ?? UNKNOWN_IP_KEY;
}
//# sourceMappingURL=rateLimit.js.map