// Guest-confirmation service. Admins subscribe to /confirmations and may
// update existing records (rules allow admin .write only when data.exists()).
// New records are created exclusively by the submitConfirmation Cloud Function.
import { ref, update } from "firebase/database";
import { db } from "../firebase.js";
import { subscribeList, callable } from "./_helpers.js";

export function subscribeConfirmations(cb) {
  return subscribeList("confirmations", cb);
}

export const submitConfirmation = callable("submitConfirmation");

// Admin-only: patch fields on an existing confirmation. RTDB rules enforce
// that only authenticated admins can write here, and only to existing records.
export async function updateConfirmation(id, patch) {
  return update(ref(db, `confirmations/${id}`), patch);
}
