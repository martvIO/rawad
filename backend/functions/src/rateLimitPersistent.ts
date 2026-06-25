// Persistent (cross-instance) rate-limit + per-account lockout counters for the
// SECURITY-CRITICAL auth surface only: login, OTP send/verify, password-reset, and
// the per-account login lockout. Backed by RTDB through the DbPort.transaction
// seam, so a Cloud Function cold start can't reset brute-force protection (the
// high-volume public limiters stay in the cheap in-memory rateLimit.ts).
//
// Stored under /rateLimits/{sanitised-key} = { count, resetAt }. Server-only: the
// RTDB root default-denies and the Admin SDK bypasses rules, so no rules change is
// needed. Buckets lazy-expire on read (a stale bucket past resetAt is treated as
// empty); no cleanup job required for correctness.
//
// EVERY function FAIL-OPENS on a store error — a rate-limiter outage must never
// lock out every login. The password is still required, so fail-open is the right
// availability/security trade.

import { DbPort } from "./domain/ports";

interface Bucket {
  count: number;
  resetAt: number;
}

function isBucket(v: unknown): v is Bucket {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as Bucket).count === "number" &&
    typeof (v as Bucket).resetAt === "number"
  );
}

// RTDB keys forbid . # $ [ ] / — IPv4 and phone keys contain '.', so sanitise.
function rlPath(key: string): string {
  return `rateLimits/${key.replace(/[.#$/[\]]/g, "_")}`;
}

/** Allow if under `max` within the window, recording the hit. FAIL-OPEN on error. */
export async function allowPersistent(
  db: DbPort,
  key: string,
  max: number,
  windowMs: number,
  now: () => number = Date.now,
): Promise<boolean> {
  try {
    const r = await db.transaction(rlPath(key), (cur) => {
      const t = now();
      if (!isBucket(cur) || t > cur.resetAt) return { count: 1, resetAt: t + windowMs };
      if (cur.count >= max) return undefined; // abort → denied
      return { count: cur.count + 1, resetAt: cur.resetAt };
    });
    return r.committed;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[rateLimit] allowPersistent store error; allowing", err);
    return true;
  }
}

/** Current failure count in the active window (0 if none / expired / error). */
export async function failureCountPersistent(
  db: DbPort,
  key: string,
  now: () => number = Date.now,
): Promise<number> {
  try {
    const cur = await db.get(rlPath(`fail:${key}`));
    if (!isBucket(cur) || now() > cur.resetAt) return 0;
    return cur.count;
  } catch {
    return 0;
  }
}

/** Record one failure, starting a window if none is active. Best-effort. */
export async function recordFailurePersistent(
  db: DbPort,
  key: string,
  windowMs: number,
  now: () => number = Date.now,
): Promise<void> {
  try {
    await db.transaction(rlPath(`fail:${key}`), (cur) => {
      const t = now();
      if (!isBucket(cur) || t > cur.resetAt) return { count: 1, resetAt: t + windowMs };
      return { count: cur.count + 1, resetAt: cur.resetAt };
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[rateLimit] recordFailurePersistent store error", err);
  }
}

/** Clear a key's failure counter (call on successful auth). Best-effort. */
export async function clearFailuresPersistent(db: DbPort, key: string): Promise<void> {
  try {
    await db.remove(rlPath(`fail:${key}`));
  } catch {
    /* best-effort */
  }
}
