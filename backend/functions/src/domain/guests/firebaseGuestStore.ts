// Production wiring for the guest domain module: bind makeGuestStore to the real
// Firebase ports. Built PER REQUEST (not at module load) so SDK handles resolve
// at request time, exactly as the pre-extraction handlers did.
//
// This is the guest analogue of the inline `userStore()` builder in
// routes/users.ts; it lives here so routes/guests.ts imports no firebase-admin
// directly. `newId` returns an RTDB push key — generated locally by the SDK (no
// network I/O), so it is safe to call per create.

import { getDatabase } from "firebase-admin/database";
import { rtdbPort } from "../firebaseAdapters";
import { makeGuestStore, GuestStore } from "./guestStore";

/** Request-scoped guest store over the real Firebase Realtime Database. */
export function firebaseGuestStore(): GuestStore {
  return makeGuestStore({
    db: rtdbPort(),
    newId: () => getDatabase().ref("guestsByGroom").push().key as string,
  });
}
