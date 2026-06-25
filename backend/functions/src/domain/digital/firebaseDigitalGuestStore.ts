// Production wiring for the digital-guest domain module: bind
// makeDigitalGuestStore to the real Firestore port. Built PER REQUEST like the
// other store builders so SDK handles resolve at request time.

import { firestorePort } from "../firebaseAdapters";
import {
  makeDigitalGuestStore,
  DigitalGuestStore,
} from "./guestStore";

/** Request-scoped digital-guest store over the real Firestore. */
export function firebaseDigitalGuestStore(): DigitalGuestStore {
  return makeDigitalGuestStore({ fs: firestorePort() });
}
