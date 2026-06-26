// Admin WhatsApp setup + template-management service. Wraps the /whatsapp/*
// admin API (see backend/functions/src/api/routes/whatsapp.routes.ts). All
// endpoints are admin-only; the access token / app secret are never sent or
// returned here — they live in the server env.
import { api } from "../utils/apiClient.js";

/** Resolved config flags + per-slot Meta template status. */
export function getWhatsAppStatus() {
  return api.get("/whatsapp/status");
}

/** Patch non-secret config (phoneId, wabaId, verifyToken, autoSendEnabled,
 *  dailyCap, fallbackTextAr/He). Returns the re-resolved config. */
export function saveWhatsAppConfig(patch) {
  return api.patch("/whatsapp/config", patch);
}

/** The 4 invite slots with live Meta status + current body/button content. */
export function listTemplates() {
  return api.get("/whatsapp/templates");
}

/** Create a slot's template on Meta. `draft` = { bodyText, buttonLabel, category, exampleName }. */
export function createTemplate(slot, draft) {
  return api.post(`/whatsapp/templates/${slot}`, draft);
}

/** Edit + resubmit a slot's template (Meta sends it back to PENDING review). */
export function editTemplate(slot, draft) {
  return api.post(`/whatsapp/templates/${slot}/edit`, draft);
}

/** Delete a slot's template on Meta + clear the slot mapping. */
export function deleteTemplate(slot) {
  return api.delete(`/whatsapp/templates/${slot}`);
}

/** Send a test message to a number: `{ phone, slot? , text? }`. */
export function sendTestMessage(body) {
  return api.post("/whatsapp/test-send", body);
}
