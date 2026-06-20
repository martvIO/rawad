// Audit-log retention sweep.
//
// writeAudit() pushes to /audit forever with no pruning. The volume is tiny at
// current scale (KBs/year), but the records carry uids + action metadata
// (PII-adjacent), so we cap retention rather than accumulate them indefinitely.
// A daily job deletes entries older than AUDIT_RETENTION_DAYS (default 180).
//
// Kept deliberately simple: it reads the whole /audit node once per day and
// deletes old keys in one multi-path update. The sweep self-limits the node to
// ~180 days of entries, so the read stays bounded. If /audit ever grows large,
// add `.indexOn: ["timestamp"]` in database.rules.json and switch to a ranged
// orderByChild("timestamp").endAt(cutoff) query.

import { getDatabase } from "firebase-admin/database";
import { onSchedule } from "firebase-functions/v2/scheduler";

const RETENTION_DAYS = Number(process.env.AUDIT_RETENTION_DAYS || 180);
const DAY_MS = 24 * 60 * 60 * 1000;

export const purgeOldAuditLogs = onSchedule(
  { schedule: "every 24 hours", region: "us-central1", timeoutSeconds: 120 },
  async () => {
    const ref = getDatabase().ref("audit");
    const snap = await ref.get();
    if (!snap.exists()) return;
    const cutoff = Date.now() - RETENTION_DAYS * DAY_MS;
    const removals: Record<string, null> = {};
    snap.forEach((child) => {
      const ts = Number(child.child("timestamp").val() ?? 0);
      // Delete clearly-old entries. Entries missing a timestamp are left alone
      // (defensive — never drop a record we can't date).
      if (ts && ts < cutoff) removals[child.key as string] = null;
      return false; // keep iterating
    });
    const count = Object.keys(removals).length;
    if (count === 0) return;
    await ref.update(removals);
    console.log(`[auditRetention] purged ${count} audit entries older than ${RETENTION_DAYS}d`);
  },
);
