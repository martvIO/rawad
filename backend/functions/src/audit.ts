// Append-only audit log of admin / privileged actions, written via the
// Admin SDK (which bypasses security rules — but rules still block direct
// client reads/writes against /audit).
import { getDatabase } from "firebase-admin/database";

export async function writeAudit(
  uid: string,
  action: string,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    await getDatabase().ref("audit").push({
      uid,
      action,
      details: details ?? null,
      timestamp: Date.now(),
    });
  } catch (err) {
    // Never let audit-log failure break the caller; just log it.
    console.error("audit.writeAudit failed", err);
  }
}
