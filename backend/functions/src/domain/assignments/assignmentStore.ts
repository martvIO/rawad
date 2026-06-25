// Driver↔groom assignment domain module — owns the invariant the route comment
// has always stated: the `/driverAssignments/{driverUid}` table and the driver's
// `assignedGrooms` Auth custom claim must stay consistent (Storage rules gate
// proof-photo uploads on that claim, so a stale claim 403s a legitimately-
// assigned driver).
//
// It takes a narrow DbPort (the assignment table + the usernameIndex/users
// reads) and AuthPort (read existing claims + restamp). The route keeps auth
// (requireRole driver / owner-or-admin), username validation, audit logging and
// the security console line. Unit-testable with the in-memory DbPort + AuthPort
// fakes, no emulator.
//
// CORRECTNESS FIX (vs the pre-extraction handler): the assignment write and the
// claim restamp can't be a single cross-service transaction, and the claim is
// DERIVED from the post-write union, so claim-first is impossible. Instead
// `assign` does a guarded compensating rollback — if the restamp throws, a
// NEWLY-added assignment is removed so the table and claim can't diverge; a
// pre-existing (already-true) assignment is left intact (it was consistent
// before, and restamp is idempotent on retry).

import { DbPort, AuthPort } from "../ports";

export type AssignResult =
  | { ok: true; groomUid: string }
  | { ok: false; reason: "unknown_groom" | "target_not_a_groom" };

export interface AssignmentStore {
  /** The grooms a driver is assigned to, as `{ [groomUid]: true }` ({} if none). */
  list(driverUid: string): Promise<Record<string, true>>;
  /** Self-assign a driver to a groom (by username) and restamp the claim. */
  assign(driverUid: string, groomUsername: string): Promise<AssignResult>;
}

export function makeAssignmentStore(deps: {
  db: DbPort;
  auth: AuthPort;
}): AssignmentStore {
  const { db, auth } = deps;

  /**
   * Recompute `assignedGrooms` from the full assignment table and merge it into
   * the driver's existing claims (read+write split so a stale read can't clobber
   * a concurrent claim update — the legacy behaviour, preserved).
   */
  async function restampClaim(driverUid: string): Promise<void> {
    const union = ((await db.get(`driverAssignments/${driverUid}`)) ??
      {}) as Record<string, true>;
    const existing = (await auth.getUser(driverUid)).customClaims ?? {};
    await auth.setCustomUserClaims(driverUid, {
      ...existing,
      assignedGrooms: union,
    });
  }

  return {
    async list(driverUid) {
      return ((await db.get(`driverAssignments/${driverUid}`)) ?? {}) as Record<
        string,
        true
      >;
    },

    async assign(driverUid, groomUsername) {
      const groomUid = await db.get(`usernameIndex/${groomUsername}`);
      if (typeof groomUid !== "string" || !groomUid) {
        return { ok: false, reason: "unknown_groom" };
      }
      const groom = (await db.get(`users/${groomUid}`)) as {
        role?: string;
      } | null;
      if (groom?.role !== "groom") {
        return { ok: false, reason: "target_not_a_groom" };
      }

      const path = `driverAssignments/${driverUid}/${groomUid}`;
      const existedBefore = (await db.get(path)) === true;
      await db.set(path, true);
      try {
        await restampClaim(driverUid);
      } catch (err) {
        // Undo ONLY a newly-added assignment so the table and claim can't diverge.
        if (!existedBefore) {
          await db.remove(path).catch((rollbackErr) => {
            // eslint-disable-next-line no-console
            console.warn("[assignments] claim-restamp rollback failed", {
              driverUid,
              groomUid,
              rollbackErr,
            });
          });
        }
        throw err;
      }
      return { ok: true, groomUid };
    },
  };
}
