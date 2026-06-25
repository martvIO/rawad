// Production wiring for the assignment domain module: bind makeAssignmentStore to
// the real Realtime Database + Firebase Auth ports. Built PER REQUEST like the
// other store builders.

import { rtdbPort, authPort } from "../firebaseAdapters";
import { makeAssignmentStore, AssignmentStore } from "./assignmentStore";

/** Request-scoped assignment store over the real RTDB + Firebase Auth. */
export function firebaseAssignmentStore(): AssignmentStore {
  return makeAssignmentStore({ db: rtdbPort(), auth: authPort() });
}
