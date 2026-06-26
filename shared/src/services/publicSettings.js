// Public (unauthenticated) settings — only the contact channels the admin has
// enabled. Used by the marketing site to render "contact us on WhatsApp" CTAs.
import { api } from "../utils/apiClient.js";

/**
 * Fetch the enabled contact channels. Never throws — returns {} on any error so
 * the landing page silently falls back to the config defaults (resolveContact).
 */
export async function fetchPublicSettings() {
  try {
    return (await api.get("/settings/public", { skipAuth: true })) || {};
  } catch {
    return {};
  }
}
