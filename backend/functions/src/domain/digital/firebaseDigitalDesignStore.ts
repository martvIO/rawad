// Production wiring for the digital-design domain module: bind
// makeDigitalDesignStore to the real Firestore port + wall clock. Built PER
// REQUEST like the other store builders.

import { firestorePort } from "../firebaseAdapters";
import {
  makeDigitalDesignStore,
  DigitalDesignStore,
} from "./designStore";

/** Request-scoped digital-design store over the real Firestore. */
export function firebaseDigitalDesignStore(): DigitalDesignStore {
  return makeDigitalDesignStore({ fs: firestorePort(), now: () => Date.now() });
}
