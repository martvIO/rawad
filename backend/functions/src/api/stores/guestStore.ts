// Data-access seam for the guest-intake domain (RTDB /guestsByGroom/{groomUid}/*).
//
// Handlers in routes/guests.ts own authorization + validation; this module owns
// ONLY persistence. It hides the Realtime Database entirely (ref/push/set/
// update/remove/snapshots) behind a small interface of plain-object methods, so
// the guests handlers become unit-testable through an in-memory adapter (see
// tests/functions/support/inMemoryGuestStore.ts) with no emulator — the same
// kind of seam the Storage helpers in routes/digital/storage.ts already give GCS.
//
// Mirrors the legacy access points (formerly inline in guests.ts):
//   list all        getDatabase().ref("guestsByGroom").get()
//   list one groom  getDatabase().ref(`guestsByGroom/${groomUid}`).get()
//   create          ref(`guestsByGroom/${groomUid}`).push() + .set()
//   patch           ref(`guestsByGroom/${groomUid}/${guestId}`).update()
//   remove          ref(`guestsByGroom/${groomUid}/${guestId}`).remove()
//
// Error contract: the store NEVER catches or re-wraps. Absent paths yield
// []/null (mirroring an empty snapshot); a real RTDB failure propagates raw so
// each handler keeps its existing `catch → res.status(500).json({ error, detail:
// errorMessage(err) })` mapping unchanged.

import { getDatabase } from "firebase-admin/database";

/**
 * A guest as it crosses the seam: a plain object, never a DataSnapshot.
 * `id` is the RTDB push key; `groomUid` is the owning groom's subtree.
 */
export interface GuestRecord extends Record<string, unknown> {
  id: string;
  groomUid: string;
}

/**
 * Persistence interface for guests. Narrow by design — each method maps to a
 * single RTDB operation and returns/accepts plain objects. Two adapters satisfy
 * it: the Firebase-backed singleton below (prod) and an in-memory Map-backed
 * double (tests).
 */
export interface GuestStore {
  /** Every guest across every groom, each stamped with id + groomUid. */
  listAll(): Promise<GuestRecord[]>;
  /** One groom's guests. Returns [] when the bucket is absent (not an error). */
  listByGroom(groomUid: string): Promise<GuestRecord[]>;
  /** Read one guest, or null when absent. */
  get(groomUid: string, guestId: string): Promise<GuestRecord | null>;
  /** Persist a new guest under a generated id; returns the full record. */
  create(
    groomUid: string,
    fields: Record<string, unknown>
  ): Promise<GuestRecord>;
  /** Shallow-merge `patch` into an existing guest (mirrors RTDB .update). */
  patch(
    groomUid: string,
    guestId: string,
    patch: Record<string, unknown>
  ): Promise<void>;
  /** Remove a guest; idempotent (mirrors RTDB .remove on a missing path). */
  remove(groomUid: string, guestId: string): Promise<void>;
}

/**
 * Firebase Realtime Database adapter. `getDatabase()` is called lazily inside
 * each method (never at module load) so importing this module in a no-Firebase
 * unit environment is safe — that is what lets the guests handler tests run
 * without the emulator.
 */
function makeFirebaseGuestStore(): GuestStore {
  return {
    async listAll() {
      const snap = await getDatabase().ref("guestsByGroom").get();
      const out: GuestRecord[] = [];
      snap.forEach((groomBucket) => {
        const groomUid = groomBucket.key;
        if (!groomUid) return;
        groomBucket.forEach((g) => {
          out.push({
            id: g.key as string,
            groomUid,
            ...(g.val() as Record<string, unknown>),
          });
        });
      });
      return out;
    },

    async listByGroom(groomUid) {
      const snap = await getDatabase().ref(`guestsByGroom/${groomUid}`).get();
      const out: GuestRecord[] = [];
      snap.forEach((g) => {
        out.push({
          id: g.key as string,
          groomUid,
          ...(g.val() as Record<string, unknown>),
        });
      });
      return out;
    },

    async get(groomUid, guestId) {
      const snap = await getDatabase()
        .ref(`guestsByGroom/${groomUid}/${guestId}`)
        .get();
      if (!snap.exists()) return null;
      return {
        id: guestId,
        groomUid,
        ...(snap.val() as Record<string, unknown>),
      };
    },

    async create(groomUid, fields) {
      const ref = getDatabase().ref(`guestsByGroom/${groomUid}`).push();
      await ref.set(fields);
      return { id: ref.key as string, groomUid, ...fields };
    },

    async patch(groomUid, guestId, patch) {
      await getDatabase()
        .ref(`guestsByGroom/${groomUid}/${guestId}`)
        .update(patch);
    },

    async remove(groomUid, guestId) {
      await getDatabase().ref(`guestsByGroom/${groomUid}/${guestId}`).remove();
    },
  };
}

/** Default production store, backed by the Firebase Realtime Database. */
export const guestStore: GuestStore = makeFirebaseGuestStore();
