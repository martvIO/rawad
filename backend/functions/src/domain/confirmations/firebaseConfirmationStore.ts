// Production wiring for the confirmation domain module: bind
// makeConfirmationStore to the real Firebase ports. Built PER REQUEST (not at
// module load) so SDK handles resolve at request time, exactly as the
// pre-extraction handlers did — the confirmation analogue of firebaseGuestStore.
//
// `newId` returns an RTDB push key under /confirmations — generated locally by
// the SDK (no network I/O), so it is safe to call per create.

import { getDatabase } from "firebase-admin/database";
import { rtdbPort } from "../firebaseAdapters";
import {
  makeConfirmationStore,
  ConfirmationStore,
} from "./confirmationStore";

/** Request-scoped confirmation store over the real Firebase Realtime Database. */
export function firebaseConfirmationStore(): ConfirmationStore {
  return makeConfirmationStore({
    db: rtdbPort(),
    newId: () => getDatabase().ref("confirmations").push().key as string,
  });
}
