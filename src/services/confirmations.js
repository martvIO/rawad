// Guest-confirmation service. Admins subscribe to /confirmations and may
// update existing records (rules allow admin .write only when data.exists()).
// New records are created exclusively by the submitConfirmation Cloud Function.
import { ref, onValue, update } from "firebase/database";
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

// Admin-only: patch fields on an existing confirmation. RTDB rules enforce
// that only authenticated admins can write here, and only to existing records.
export async function updateConfirmation(id, patch) {
  return update(ref(db, `confirmations/${id}`), patch);
}
