// Admin-only analytics reader. The backend aggregates every section server-side
// (composition, revenue, operations, rsvp, designs, triage, trends) and returns
// one payload, so the browser never has to crunch all-grooms data itself.
import { api } from "../utils/apiClient.js";

/**
 * Fetch the admin analytics payload.
 * @param {"30d"|"90d"|"all"} [window] trend span (default 30d)
 */
export async function getAnalytics(window = "30d") {
  return api.get(`/admin/analytics?window=${encodeURIComponent(window)}`);
}
