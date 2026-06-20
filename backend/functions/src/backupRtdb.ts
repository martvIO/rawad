// Scheduled RTDB backup — disaster-recovery for the primary datastore.
//
// Firestore has managed PITR + scheduled backups, and Storage has object
// versioning (both enabled out-of-band via backend/scripts/setup-backups.sh).
// The Realtime Database has NO native scheduled export, so this daily job
// snapshots the whole RTDB tree to a dedicated GCS bucket as JSON.
//
// Safe to deploy before setup exists: it is a complete NO-OP until the
// BACKUP_BUCKET env var points at a writable bucket — exactly like
// `sendRsvpReminders` is a no-op until WhatsApp is configured. Retention is
// handled by a GCS lifecycle rule on the bucket (see setup-backups.sh), not in
// code, so backups of biometric/PII data honour the same 30-day purge promise.
//
// Restore procedure: docs/RUNBOOK.md → "Restore RTDB from backup".
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDatabase } from "firebase-admin/database";
import { getStorage } from "firebase-admin/storage";

/** Bucket that receives the JSON snapshots. Unset → the job no-ops. */
const BACKUP_BUCKET = process.env.BACKUP_BUCKET || "";

/** UTC date stamp (YYYY-MM-DD) used to name the daily folder. */
export function backupDateStamp(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Object path for a given run, e.g. rtdb/2026-06-20/rtdb-export.json. */
export function backupObjectPath(now: Date): string {
  return `rtdb/${backupDateStamp(now)}/rtdb-export.json`;
}

export const backupRtdb = onSchedule(
  {
    // Nightly at 03:30 Israel time — off-peak for this market.
    schedule: "30 3 * * *",
    timeZone: "Asia/Jerusalem",
    region: "us-central1",
    // The tree is small at this scale, but allow headroom for serialization.
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    if (!BACKUP_BUCKET) {
      console.log("[backup] BACKUP_BUCKET not set — skipping run (no-op)");
      return;
    }

    // once('value') returns the full tree without export priorities; that is
    // sufficient for data recovery (priorities are not used in this schema).
    const snap = await getDatabase().ref("/").once("value");
    const data = snap.val();
    const json = JSON.stringify(data ?? {});

    const path = backupObjectPath(new Date());
    const file = getStorage().bucket(BACKUP_BUCKET).file(path);
    await file.save(Buffer.from(json, "utf8"), {
      contentType: "application/json",
      resumable: false,
      metadata: {
        cacheControl: "no-store",
        metadata: { source: "backupRtdb", node: "/" },
      },
    });

    console.log(
      `[backup] wrote gs://${BACKUP_BUCKET}/${path} (${json.length} bytes)`,
    );
  },
);
