// Confirmation domain module — the deep interface over the RTDB /confirmations
// subtree.
//
// It owns ONLY persistence + record shaping. The route keeps every transport
// concern the domain never sees: authorization (admin gates), rate limiting,
// the public-submit body validation (parseSubmitBody), the admin PATCH
// allowlist (sanitizeConfirmationPatch), and the best-effort auto-attach
// DECISION (phone-matching across the groom's guests). Guest writes themselves
// go through the guest domain (firebaseGuestStore) and groomUsername→uid
// resolution through the user-index module (makeUserIndex) — this store never
// touches /guestsByGroom or /usernameIndex.
//
// Like the guest module it raises no DomainError today (field rules run before
// it is called) and follows the same port-seam shape (domain/guests/guestStore):
// it takes a narrow DbPort and is unit-testable with an in-memory fake DbPort,
// no emulator (see tests/functions/confirmationStore.test.ts).
//
// Behaviour is a verbatim lift of the pre-extraction confirmations.ts handlers:
//   listAll   read /confirmations, flatten to [{ id, ...fields }]
//   get       read one, or null
//   create    fresh push id under /confirmations, set the field bag, return record
//   patch     shallow-merge via a per-field multi-path update (mirrors RTDB
//             ref.update — NOT a whole-node set, which would drop siblings)
//
// The store NEVER catches: a real DbPort failure propagates so the route's
// catch maps it to that handler's 500 fallback slug. Reads of an absent path
// resolve to []/null, mirroring an empty snapshot.

import { DbPort } from "../ports";
import { ConfirmationRecord } from "./types";

export interface ConfirmationStore {
  listAll(): Promise<ConfirmationRecord[]>;
  get(id: string): Promise<ConfirmationRecord | null>;
  create(fields: Record<string, unknown>): Promise<ConfirmationRecord>;
  patch(id: string, patch: Record<string, unknown>): Promise<void>;
}

/**
 * @param db     Realtime Database port.
 * @param newId  Generate a fresh confirmation id (production: an RTDB push key).
 *               Kept as a narrow injectable — like the guest domain's `newId` —
 *               so the module stays pure and the id is deterministic under test.
 */
export function makeConfirmationStore(deps: {
  db: DbPort;
  newId: () => string;
}): ConfirmationStore {
  const { db, newId } = deps;

  const flatten = (bucket: unknown): ConfirmationRecord[] => {
    if (!bucket || typeof bucket !== "object") return [];
    return Object.entries(bucket as Record<string, unknown>).map(
      ([id, data]) => ({ id, ...(data as Record<string, unknown>) })
    );
  };

  return {
    async listAll() {
      return flatten(await db.get("confirmations"));
    },

    async get(id) {
      const data = await db.get(`confirmations/${id}`);
      if (data === null) return null;
      return { id, ...(data as Record<string, unknown>) };
    },

    async create(fields) {
      const id = newId();
      await db.set(`confirmations/${id}`, fields);
      return { id, ...fields };
    },

    async patch(id, patch) {
      // Per-field multi-path update = shallow merge at the confirmation node,
      // matching the legacy ref(`confirmations/${id}`).update(patch). A single
      // whole-node set would clobber unspecified siblings.
      const updates: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        updates[`confirmations/${id}/${k}`] = v;
      }
      await db.update(updates);
    },
  };
}
