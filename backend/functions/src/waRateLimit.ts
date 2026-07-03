// Daily WhatsApp send cap — a per-business-day counter that guards every
// guest-facing Cloud API send against Meta's tier limit (unverified numbers are
// capped at 250 business-initiated conversations / rolling 24h; a real number
// scales higher). The cap value itself is admin-configurable (whatsappConfig
// `dailyCap`, default 250); this module enforces it.
//
// The counter lives at waDailySends/{YYYY-MM-DD} (Asia/Jerusalem — the business
// day), incremented via an RTDB transaction so concurrent sends can't race past
// the cap, and ONLY when the current value is below the cap (a rejected over-cap
// attempt never inflates the count). Server-only path (Admin SDK; root
// default-deny keeps clients out). Never throws — a transient RTDB failure
// fails OPEN (allows the send) so a DB blip never wedges all messaging.
import { getDatabase } from "firebase-admin/database";

const DEFAULT_TZ = "Asia/Jerusalem";

/** YYYY-MM-DD for `now` in the given IANA time zone — the key the daily cap is
 *  bucketed on. `en-CA` formats as ISO-like YYYY-MM-DD. Exported for tests. */
export function dayKey(tz: string = DEFAULT_TZ, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export interface DailyReservation {
  /** true → a slot was reserved (the caller may send); false → over cap. */
  allowed: boolean;
  /** the counter value after the reserve (unchanged when rejected/failed). */
  count: number;
}

/**
 * Pure RTDB-transaction step: given the current counter value and the cap,
 * return the new value to COMMIT, or `undefined` to ABORT (already at/over cap,
 * so the counter must not move). A non-number/absent current is treated as 0.
 * Exported so the increment-only-under-cap invariant is unit-testable without a
 * live database.
 */
export function reserveStep(cur: unknown, cap: number): number | undefined {
  const n = typeof cur === "number" && Number.isFinite(cur) ? cur : 0;
  if (n >= cap) return undefined; // abort — leave the counter unchanged
  return n + 1;
}

/**
 * Atomically reserve one WhatsApp send against today's cap. Increments the
 * per-day counter ONLY when it is below `cap`, so an over-cap attempt is
 * rejected without inflating the count. `cap <= 0` (or non-finite) means
 * "no cap" → always allowed. Fails OPEN on any RTDB error.
 */
export async function reserveDailySend(
  cap: number,
  tz: string = DEFAULT_TZ,
): Promise<DailyReservation> {
  if (!Number.isFinite(cap) || cap <= 0) return { allowed: true, count: 0 };
  try {
    const ref = getDatabase().ref(`waDailySends/${dayKey(tz)}`);
    let allowed = false;
    const txn = await ref.transaction((cur) => {
      const next = reserveStep(cur, cap);
      allowed = next !== undefined;
      return next;
    });
    const count = (txn.snapshot.val() as number | null) ?? 0;
    return { allowed, count };
  } catch {
    // Fail open: never let a rate-limit bookkeeping error block a real send.
    return { allowed: true, count: 0 };
  }
}
