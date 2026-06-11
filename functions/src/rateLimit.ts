// Tiny per-key rate limiter using an in-memory bucket map.
// "Good enough" for abuse prevention on a single instance; for stricter limits
// across cold-started instances, swap the backing store for Firestore or Redis.

interface Bucket { count: number; resetAt: number; }

const buckets = new Map<string, Bucket>();

export function allow(key: string, maxPerWindow: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= maxPerWindow) return false;
  b.count++;
  return true;
}

// ─── Failure-only counter (per-account login lockout) ─────────────────────────
// Unlike `allow`, this counts ONLY events the caller explicitly records (failed
// logins) and exposes the current count so callers can block BEFORE doing work,
// then clear the counter on success. A separate map so it never interferes with
// the `allow` buckets above.

const failures = new Map<string, Bucket>();

/** Current failure count for `key` within its active window (0 if none/expired). */
export function failureCount(key: string): number {
  const now = Date.now();
  const b = failures.get(key);
  if (!b || now > b.resetAt) return 0;
  return b.count;
}

/** Record one failure for `key`, starting a fresh window if none is active. */
export function recordFailure(key: string, windowMs: number): void {
  const now = Date.now();
  const b = failures.get(key);
  if (!b || now > b.resetAt) {
    failures.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  b.count++;
}

/** Clear a key's failure counter (call on successful auth). */
export function clearFailures(key: string): void {
  failures.delete(key);
}
