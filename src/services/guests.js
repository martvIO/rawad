// Guests service — data sharded by groomUid so rules permit per-groom listeners.
//
// Data lives at /guestsByGroom/{groomUid}/{guestId}. The owning groom listens
// at their own subtree; a driver listens at the groom's subtree they're
// currently assigned to; admins listen at the root.
import { ref, push, set, update, remove, onValue } from "firebase/database";
import { db } from "../firebase.js";
import { subscribeList } from "./_helpers.js";
import { logErr } from "../utils/logger.js";

// Admin-only: every groom's guests, flattened. Two-level snapshot so we can't
// use `subscribeList` directly — the outer key is the groomUid, inner is the
// guest record.
export function subscribeAllGuests(cb) {
  return onValue(
    ref(db, "guestsByGroom"),
    (snap) => {
      const out = [];
      snap.forEach((groomBucket) => {
        const groomUid = groomBucket.key;
        groomBucket.forEach((g) => {
          out.push({ id: g.key, groomUid, ...g.val() });
        });
      });
      cb(out);
    },
    (err) => { logErr("subscribeAllGuests", err); cb([]); },
  );
}

// Live list of one groom's guests (used by the groom themselves and by the
// driver assigned to that groom).
export function subscribeGuestsForGroom(groomUid, cb) {
  if (!groomUid) { cb([]); return () => {}; }
  return subscribeList(
    `guestsByGroom/${groomUid}`,
    cb,
    (g) => ({ id: g.key, groomUid, ...g.val() }),
  );
}

export async function addGuest(groomUid, guest) {
  const r = push(ref(db, `guestsByGroom/${groomUid}`));
  await set(r, { ...guest, createdAt: Date.now() });
  return r.key;
}

export async function updateGuest(groomUid, id, patch) {
  return update(ref(db, `guestsByGroom/${groomUid}/${id}`), patch);
}

export async function removeGuest(groomUid, id) {
  return remove(ref(db, `guestsByGroom/${groomUid}/${id}`));
}
