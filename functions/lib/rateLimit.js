"use strict";
// Tiny per-key rate limiter using an in-memory bucket map.
// "Good enough" for abuse prevention on a single instance; for stricter limits
// across cold-started instances, swap the backing store for Firestore or Redis.
Object.defineProperty(exports, "__esModule", { value: true });
exports.allow = allow;
const buckets = new Map();
function allow(key, maxPerWindow, windowMs) {
    const now = Date.now();
    const b = buckets.get(key);
    if (!b || now > b.resetAt) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return true;
    }
    if (b.count >= maxPerWindow)
        return false;
    b.count++;
    return true;
}
//# sourceMappingURL=rateLimit.js.map