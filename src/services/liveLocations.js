// Live-location publish + subscribe. Data lives at
//   /liveLocationsByGroom/{groomUid}/{driverUid}: { lat, lng, accuracy, timeISO }
//
// Sharding by groom lets us write a `.read` rule that grants access ONLY to
// the listed groom (or admins), without leaking any driver's fix to grooms
// they didn't pick. The driver writes the same fix once per groom they share
// with each tick.
import { ref, set, remove, onValue, update } from "firebase/database";
import { db } from "../firebase.js";
import { logErr } from "../utils/logger.js";

// Publish the current driver's GPS fix into one shard per groom they chose.
// `shareWith` is an array of groomUids. `driverDisplayName` is optional and
// shown to the groom on their map (groom can't read /users for other roles).
export async function publishMyFix(driverUid, driverDisplayName, fix, shareWith) {
  const payload = {
    lat: fix.lat,
    lng: fix.lng,
    accuracy: fix.accuracy ?? 0,
    timeISO: new Date().toISOString(),
  };
  if (driverDisplayName) payload.driverDisplayName = driverDisplayName;
  if (!shareWith || shareWith.length === 0) return;
  const updates = {};
  for (const groomUid of shareWith) {
    updates[`liveLocationsByGroom/${groomUid}/${driverUid}`] = payload;
  }
  return update(ref(db), updates);
}

// Remove this driver's location from every groom shard they were broadcasting to.
export async function clearMyLocation(driverUid, formerShareWith) {
  const list = Array.isArray(formerShareWith) ? formerShareWith : [];
  if (list.length === 0) return;
  const updates = {};
  for (const groomUid of list) {
    updates[`liveLocationsByGroom/${groomUid}/${driverUid}`] = null;
  }
  return update(ref(db), updates);
}

// Listen for every driver currently sharing with this groom. Receives a map
// of { [driverUid]: { lat, lng, accuracy, timeISO } }.
export function subscribeDriversForGroom(groomUid, cb) {
  if (!groomUid) { cb({}); return () => {}; }
  return onValue(
    ref(db, `liveLocationsByGroom/${groomUid}`),
    (snap) => { cb(snap.val() ?? {}); },
    (err) => { logErr("subscribeDriversForGroom", err); cb({}); },
  );
}
