// Firebase-touching half of the lifecycle module: read a groom's current status
// so the PUBLIC guest-facing endpoints (invite/confirm reads + RSVP writes) can
// freeze when a wedding is cancel_pending / cancelled / paused. Kept separate
// from the pure `status.ts` so the transition rules stay emulator-free testable.
//
// Fails OPEN (returns "active") on a read error: a transient RTDB blip must not
// take a live wedding's RSVP flow down. The freeze is defense-in-depth — the
// primary guest signal is the eventStatus the read endpoints project.

import { getDatabase } from "firebase-admin/database";
import { isFrozen, normalizeStatus, LifecycleStatus } from "./status";

/** Read /users/{groomUid}/lifecycleStatus, normalised. Best-effort. */
export async function readGroomStatus(
  groomUid: string,
): Promise<LifecycleStatus> {
  try {
    const snap = await getDatabase()
      .ref(`users/${groomUid}/lifecycleStatus`)
      .get();
    return normalizeStatus(snap.val());
  } catch {
    return "active";
  }
}

/** True when the groom's wedding is in any frozen (non-active) state. */
export async function isGroomFrozen(groomUid: string): Promise<boolean> {
  return isFrozen(await readGroomStatus(groomUid));
}
