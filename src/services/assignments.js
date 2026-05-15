// Driver ↔ groom assignment service. Writes are mediated by the
// `assignDriverToGroom` Cloud Function (so the server can set the driver's
// custom claim that Storage rules will check).
import { ref, onValue } from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase.js";

const _assign = httpsCallable(functions, "assignDriverToGroom");

export async function assignDriverToGroom(groomUsername) {
  const res = await _assign({ groomUsername });
  return res.data; // { groomUid }
}

// Subscribe to the set of grooms the calling driver may serve.
export function subscribeAssignmentsFor(driverUid, cb) {
  return onValue(ref(db, `driverAssignments/${driverUid}`), (snap) => {
    cb(snap.val() ?? {});
  });
}
