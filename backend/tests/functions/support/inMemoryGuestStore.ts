// In-memory GuestStore adapter for unit tests — the second adapter at the guest
// data-access seam (the first is the Firebase-backed singleton in
// functions/src/api/stores/guestStore.ts). Backed by nested Maps; honours the
// same interface so handler tests exercise real route behaviour with no emulator.
//
// `inMemoryGuestStore(seed)` returns { store, grooms }: pass `store` wherever a
// GuestStore is expected, and read `grooms` to assert post-state after writes.

import type {
  GuestRecord,
  GuestStore,
} from "../../../functions/src/api/stores/guestStore";

type Fields = Record<string, unknown>;
type Seed = Record<string, Record<string, Fields>>;

export function inMemoryGuestStore(seed: Seed = {}): {
  store: GuestStore;
  grooms: Map<string, Map<string, Fields>>;
} {
  const grooms = new Map<string, Map<string, Fields>>();
  for (const [groomUid, guests] of Object.entries(seed)) {
    grooms.set(
      groomUid,
      new Map(Object.entries(guests).map(([id, f]) => [id, { ...f }]))
    );
  }
  let counter = 0;

  const rec = (groomUid: string, id: string, f: Fields): GuestRecord => ({
    id,
    groomUid,
    ...f,
  });

  const store: GuestStore = {
    async listAll() {
      const out: GuestRecord[] = [];
      for (const [groomUid, m] of grooms) {
        for (const [id, f] of m) out.push(rec(groomUid, id, f));
      }
      return out;
    },
    async listByGroom(groomUid) {
      const m = grooms.get(groomUid);
      return m ? [...m].map(([id, f]) => rec(groomUid, id, f)) : [];
    },
    async get(groomUid, guestId) {
      const f = grooms.get(groomUid)?.get(guestId);
      return f ? rec(groomUid, guestId, f) : null;
    },
    async create(groomUid, fields) {
      const id = `mem_${++counter}`;
      if (!grooms.has(groomUid)) grooms.set(groomUid, new Map());
      grooms.get(groomUid)!.set(id, { ...fields });
      return rec(groomUid, id, fields);
    },
    async patch(groomUid, guestId, patch) {
      const m = grooms.get(groomUid);
      const existing = m?.get(guestId);
      if (m && existing) m.set(guestId, { ...existing, ...patch });
    },
    async remove(groomUid, guestId) {
      grooms.get(groomUid)?.delete(guestId);
    },
  };

  return { store, grooms };
}
