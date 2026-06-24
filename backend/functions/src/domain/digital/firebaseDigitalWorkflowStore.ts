// Production wiring for the digital design-approval domain module: bind
// makeDigitalWorkflowStore to the real Firestore port + wall clock. Built PER
// REQUEST like the other store builders.

import { firestorePort } from "../firebaseAdapters";
import {
  makeDigitalWorkflowStore,
  DigitalWorkflowStore,
} from "./workflowStore";

/** Request-scoped digital design-approval store over the real Firestore. */
export function firebaseDigitalWorkflowStore(): DigitalWorkflowStore {
  return makeDigitalWorkflowStore({ fs: firestorePort(), now: () => Date.now() });
}
