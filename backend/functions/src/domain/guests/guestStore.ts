// Guest domain module — the deep interface over the RTDB /guestsByGroom subtree.
//
// It owns ONLY persistence + record shaping. The route owns the transport
// concerns the domain never sees: authorization (canReadGroom / canPatchGuest),
// the assigned-driver inviteLinkToken-strip, sanitizeGuest field validation, and
// createdAt stamping. So this module raises no DomainError today — field rules
// are enforced before it is called — but it follows the same port-seam shape as
// the user domain (domain/users/userStore.ts): it takes narrow ports and is
// unit-testable with an in-memory fake DbPort, no emulator (see
// tests/functions/guestStore.test.ts).
//
// Behaviour is a verbatim lift of the pre-extraction guests.ts handlers:
//   listAll      read /guestsByGroom, flatten to [{ id, groomUid, ...fields }]
//   listByGroom  read /guestsByGroom/{groomUid}, [] when the bucket is absent
//   get          read one, or null
//   create       fresh push id under the bucket, set the field bag, return record
//   patch        shallow-merge via a per-field multi-path update (mirrors RTDB
//                ref.update — NOT a whole-node set, which would drop siblings)
//   remove       delete (idempotent)
//
// The store NEVER catches: a real DbPort failure propagates so the route's
// sendDomainError maps it to that handler's 500 fallback slug. Reads of an
// absent path resolve to []/null, mirroring an empty snapshot.

import { DbPort } from "../ports";
import { GuestRecord } from "./types";

export interface GuestStore {
  listAll(): Promise<GuestRecord[]>;
  listByGroom(groomUid: string): Promise<GuestRecord[]>;
  get(groomUid: string, guestId: string): Promise<GuestRecord | null>;
  create(
    groomUid: string,
    fields: Record<string, unknown>
  ): Promise<GuestRecord>;
  patch(
    groomUid: string,
    guestId: string,
    patch: Record<string, unknown>
  ): Promise<void>;
  remove(groomUid: string, guestId: string): Promise<void>;
}

/**
 * @param db     Realtime Database port.
 * @param newId  Generate a fresh guest id (production: an RTDB push key). Kept
 *               as a narrow injectable — like the user domain's `now` clock — so
 *               the module stays pure and the id is deterministic under test.
 */
export function makeGuestStore(deps: {
  db: DbPort;
  newId: () => string;
}): GuestStore {
  const { db, newId } = deps;

  const flatten = (groomUid: string, bucket: unknown): GuestRecord[] => {
    if (!bucket || typeof bucket !== "object") return [];
    return Object.entries(bucket as Record<string, unknown>).map(
      ([id, data]) => ({
        id,
        groomUid,
        ...(data as Record<string, unknown>),
      })
    );
  };

  return {
    async listAll() {
      const all = ((await db.get("guestsByGroom")) ?? {}) as Record<
        string,
        unknown
      >;
      const out: GuestRecord[] = [];
      for (const [groomUid, bucket] of Object.entries(all)) {
        out.push(...flatten(groomUid, bucket));
      }
      return out;
    },

    async listByGroom(groomUid) {
      return flatten(groomUid, await db.get(`guestsByGroom/${groomUid}`));
    },

    async get(groomUid, guestId) {
      const data = await db.get(`guestsByGroom/${groomUid}/${guestId}`);
      if (data === null) return null;
      return { id: guestId, groomUid, ...(data as Record<string, unknown>) };
    },

    async create(groomUid, fields) {
      const id = newId();
      await db.set(`guestsByGroom/${groomUid}/${id}`, fields);
      return { id, groomUid, ...fields };
    },

    async patch(groomUid, guestId, patch) {
      // Per-field multi-path update = shallow merge at the guest node, matching
      // the legacy ref(`guestsByGroom/${groomUid}/${guestId}`).update(patch). A
      // single whole-node set would clobber unspecified siblings.
      const updates: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        updates[`guestsByGroom/${groomUid}/${guestId}/${k}`] = v;
      }
      await db.update(updates);
    },

    async remove(groomUid, guestId) {
      await db.remove(`guestsByGroom/${groomUid}/${guestId}`);
    },
  };
}
