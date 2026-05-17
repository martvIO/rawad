// Guest-confirmation service. Admins subscribe to /confirmations and may
// update existing records (rules allow admin .write only when data.exists()).
// New records are created exclusively by the submitConfirmation Cloud Function.
import { ref, update } from "firebase/database";
import { db } from "../firebase.js";
import { subscribeList, callable } from "./_helpers.js";

export function subscribeConfirmations(cb) {
  return subscribeList("confirmations", cb);
}

// Payload shape: { groomUsername, submittedName, submittedPhone, submittedCity,
//                   submittedStreet, submittedHouse, lat?, lng?, locationAccuracy? }
// Returns: { ok: true, id, attachedGuestId: string|null }
export const submitConfirmation = callable("submitConfirmation");

// Admin-only: copy a confirmation's stored lat/lng/accuracy onto a specific
// guest record. Used when auto-attach couldn't decide (no match or multiple).
export const attachConfirmationLocationToGuest = callable("attachConfirmationLocationToGuest");

// Admin-only: patch fields on an existing confirmation. RTDB rules enforce
// that only authenticated admins can write here, and only to existing records.
export async function updateConfirmation(id, patch) {
  return update(ref(db, `confirmations/${id}`), patch);
}
