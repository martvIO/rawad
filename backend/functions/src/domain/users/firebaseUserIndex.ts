// Production wiring for the read-only user-index resolver: bind makeUserIndex to
// the real Realtime Database port. Built PER REQUEST like the other store
// builders so SDK handles resolve at request time.

import { rtdbPort } from "../firebaseAdapters";
import { makeUserIndex, UserIndex } from "./userIndex";

/** Request-scoped username/phone index resolver over the real RTDB. */
export function firebaseUserIndex(): UserIndex {
  return makeUserIndex({ db: rtdbPort() });
}
