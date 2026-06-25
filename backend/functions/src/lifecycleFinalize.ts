// Scheduled finaliser for groom-account cancellations.
//
// A groom who requests cancellation enters `cancel_pending` with a grace window
// (cancelGraceEndsAt). This hourly job flips any pending account whose window
// has elapsed (and was not undone) to `cancelled` — a SOFT freeze: the data is
// retained read-only, never deleted. True deletion stays the separate, explicit
// DELETE /users purge. Mirrors the scheduled-job shape of reminders.ts /
// faceIndex/purge.ts (pure decision in lifecycle/status.ts#isGraceExpired, the
// onSchedule wrapper here).

import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDatabase } from "firebase-admin/database";
import { writeAudit } from "./audit";
import { LIFECYCLE, isGraceExpired } from "./lifecycle/status";

export const finalizeWeddingCancellations = onSchedule(
  { schedule: "every 1 hours", timeZone: "Asia/Jerusalem", region: "us-central1" },
  async () => {
    const db = getDatabase();
    const now = Date.now();
    const snap = await db.ref("users").get();
    const all = (snap.val() ?? {}) as Record<string, Record<string, unknown>>;

    let finalized = 0;
    for (const [uid, user] of Object.entries(all)) {
      if (!isGraceExpired(user, now)) continue;
      await db.ref(`users/${uid}`).update({
        lifecycleStatus: LIFECYCLE.CANCELLED,
        cancelledAt: now,
      });
      await writeAudit("system", "finalizeWeddingCancellation", { uid });
      finalized++;
    }
    console.log(`[lifecycle] finalize run complete — cancelled ${finalized}`);
  },
);
