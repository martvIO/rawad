// Groom-account (wedding) lifecycle state machine — the single source of truth
// for the status field that a "wedding" carries, since a wedding IS a groom
// account (there is no separate wedding entity). Pure + Firebase-free so every
// transition rule and the guest-facing projection are unit-testable with no
// emulator (see tests/functions/lifecycleStatus.test.ts). The Firebase-touching
// read used to gate public pages lives next door in `gate.ts`.
//
//   active ──cancel request──▶ cancel_pending ──(grace expires)──▶ cancelled
//     ▲          │ ▲                  │                                │
//     │     pause│ │undo (groom)      │ admin confirm-cancel           │ admin restore
//     │          ▼ │                  ▼                                ▼
//     └───────── paused ◀── resume ───┘                            active
//
// `cancel_pending` and `paused` already freeze the PUBLIC surface (guests see a
// notice, RSVP/confirm writes are rejected) while the groom portal stays usable;
// `cancelled` additionally makes the groom portal read-only. Data is never
// auto-deleted — finalisation is a soft freeze; true deletion stays the separate,
// explicit DELETE /users purge.

export const LIFECYCLE = {
  ACTIVE: "active",
  CANCEL_PENDING: "cancel_pending",
  CANCELLED: "cancelled",
  PAUSED: "paused",
} as const;

export type LifecycleStatus = (typeof LIFECYCLE)[keyof typeof LIFECYCLE];

/** Default grace window before a groom's cancellation finalises (hours). */
export const DEFAULT_CANCEL_GRACE_HOURS = 48;
/** Bounds for an admin-configured grace window (1h … 30 days). */
export const MIN_GRACE_HOURS = 1;
export const MAX_GRACE_HOURS = 720;
/** Max length of the free-text cancellation reason a groom may submit. */
export const MAX_CANCEL_REASON_LEN = 500;

const HOUR_MS = 60 * 60 * 1000;

/** Coerce any stored value to a known status; absent/unknown → active. */
export function normalizeStatus(v: unknown): LifecycleStatus {
  return v === LIFECYCLE.CANCEL_PENDING ||
    v === LIFECYCLE.CANCELLED ||
    v === LIFECYCLE.PAUSED
    ? v
    : LIFECYCLE.ACTIVE;
}

/** A frozen status hides the public invite/RSVP surface. */
export function isFrozen(v: unknown): boolean {
  const s = normalizeStatus(v);
  return s !== LIFECYCLE.ACTIVE;
}

/** Collapse the internal status to the state shown to a guest on a public page.
 *  cancel_pending and cancelled both read as "cancelled"; paused reads as
 *  "postponed" (the wedding may resume with a new date). */
export function publicEventState(
  v: unknown,
): "active" | "cancelled" | "postponed" {
  const s = normalizeStatus(v);
  if (s === LIFECYCLE.PAUSED) return "postponed";
  if (s === LIFECYCLE.CANCEL_PENDING || s === LIFECYCLE.CANCELLED) {
    return "cancelled";
  }
  return "active";
}

/** Clamp an admin-configured grace window to a sane range; junk → default. */
export function clampGraceHours(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_CANCEL_GRACE_HOURS;
  return Math.min(MAX_GRACE_HOURS, Math.max(MIN_GRACE_HOURS, Math.floor(n)));
}

/** Epoch-ms at which a cancellation requested at `nowMs` finalises. */
export function graceEndsAt(nowMs: number, graceHours: unknown): number {
  return nowMs + clampGraceHours(graceHours) * HOUR_MS;
}

/** True when a cancel_pending user's grace window has elapsed (the scheduled
 *  finaliser uses this to flip cancel_pending → cancelled). */
export function isGraceExpired(
  user: { lifecycleStatus?: unknown; cancelGraceEndsAt?: unknown } | null | undefined,
  nowMs: number,
): boolean {
  return (
    normalizeStatus(user?.lifecycleStatus) === LIFECYCLE.CANCEL_PENDING &&
    typeof user?.cancelGraceEndsAt === "number" &&
    nowMs >= (user.cancelGraceEndsAt as number)
  );
}
