// Production wiring for the digital-wish domain module: bind makeDigitalWishStore
// to the real Firestore port + wall clock. Built PER REQUEST like the other
// store builders.

import { firestorePort } from "../firebaseAdapters";
import { makeDigitalWishStore, DigitalWishStore } from "./wishStore";

/** Request-scoped digital-wish (guestbook) store over the real Firestore. */
export function firebaseDigitalWishStore(): DigitalWishStore {
  return makeDigitalWishStore({ fs: firestorePort(), now: () => Date.now() });
}
