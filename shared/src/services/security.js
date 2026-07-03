// Admin-only Security page client. Reads the threat feed + block lists and
// performs block/unblock/resolve actions against /admin/security.
import { api } from "../utils/apiClient.js";

/**
 * Fetch security events (newest first), optionally filtered.
 * @param {Object} [filters]
 * @param {string} [filters.type]      event type (e.g. "authz_denied")
 * @param {string} [filters.severity]  "critical"|"high"|"medium"|"low"|"info"
 * @param {"true"|"false"} [filters.resolved]
 * @param {number} [filters.limit]     max rows (1..500, default 200)
 */
export async function getSecurityEvents(filters = {}) {
  const q = new URLSearchParams();
  if (filters.type) q.set("type", filters.type);
  if (filters.severity) q.set("severity", filters.severity);
  if (filters.resolved) q.set("resolved", filters.resolved);
  if (filters.limit) q.set("limit", String(filters.limit));
  const qs = q.toString();
  return api.get(`/admin/security/events${qs ? `?${qs}` : ""}`);
}

/** Dashboard counts (totals, unresolved, by-severity, blocked counts). */
export async function getSecuritySummary() {
  return api.get("/admin/security/summary");
}

/** Current account / IP / fingerprint block lists. */
export async function getSecurityBlocks() {
  return api.get("/admin/security/blocks");
}

/**
 * Block an entity.
 * @param {"account"|"ip"|"fingerprint"} kind
 * @param {string} value  uid / IP / fingerprint
 * @param {Object} [opts]
 * @param {string} [opts.reason]
 * @param {number} [opts.durationMs]  omit for a permanent block
 */
export async function blockEntity(kind, value, opts = {}) {
  return api.post("/admin/security/block", {
    kind,
    value,
    reason: opts.reason,
    durationMs: opts.durationMs,
  });
}

/** Lift a block. */
export async function unblockEntity(kind, value) {
  return api.post("/admin/security/unblock", { kind, value });
}

/** Mark a security event as handled. */
export async function resolveSecurityEvent(id) {
  return api.post(`/admin/security/events/${encodeURIComponent(id)}/resolve`);
}
