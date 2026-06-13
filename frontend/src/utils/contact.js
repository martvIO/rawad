// Contact-channel helpers shared by the marketing site + portal.
//
// Source of truth at runtime is GET /settings/public (admin-managed, can be
// disabled per channel); CONTACT in config/index.js is the build-time fallback
// used until the admin fills the Communication settings in.
import { CONTACT } from "../config/index.js";

/**
 * Build a WhatsApp click-to-chat URL. `number` may contain "+", spaces, or
 * dashes; we strip to digits (wa.me wants the international number, digits only).
 * `text` is an optional prefilled message. Returns "" when there's no number.
 */
export function buildWhatsAppUrl(number, text) {
  const digits = String(number || "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  const base = `https://wa.me/${digits}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/** `tel:` URL (keeps a leading +). Returns "" when there's no number. */
export function telUrl(number) {
  const cleaned = String(number || "").replace(/[^0-9+]/g, "");
  return cleaned ? `tel:${cleaned}` : "";
}

/** `mailto:` URL. Returns "" when there's no email. */
export function mailtoUrl(email) {
  const e = String(email || "").trim();
  return e ? `mailto:${e}` : "";
}

/**
 * Merge the public settings (admin-managed, from /settings/public) over the
 * build-time config fallback. Returns a normalized object; absent channels are
 * empty strings so callers can `if (contact.whatsapp)` guard cleanly.
 */
export function resolveContact(publicSettings) {
  const s = publicSettings || {};
  return {
    whatsapp:  s.whatsapp  || CONTACT.WHATSAPP || "",
    phone:     s.phone     || CONTACT.PHONE || "",
    email:     s.email     || CONTACT.EMAIL || "",
    facebook:  s.facebook  || "",
    instagram: s.instagram || "",
    tiktok:    s.tiktok    || "",
  };
}
