// Guest-confirmation service. Admins subscribe to /confirmations. The public
// submit goes through a Cloud Function (rules forbid direct client writes).
import { ref, onValue } from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase.js";

export function subscribeConfirmations(cb) {
  return onValue(ref(db, "confirmations"), (snap) => {
    const out = [];
    snap.forEach((c) => { out.push({ id: c.key, ...c.val() }); });
    cb(out);
  });
}

const _submit = httpsCallable(functions, "submitConfirmation");

export async function submitConfirmation(input) {
  const res = await _submit(input);
  return res.data;
}
