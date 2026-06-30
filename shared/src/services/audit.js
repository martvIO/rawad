// Admin-only audit-log reader. The log is append-only on the backend; this is
// the read path for the admin Audit tab.
import { api } from "../utils/apiClient.js";

/** Fetch the most recent audit entries (newest first). */
export async function getAuditLog(limit = 200) {
  return api.get(`/admin/audit?limit=${encodeURIComponent(limit)}`);
}
