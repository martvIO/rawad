// Shared helpers for the WhatsApp Setup + Message Templates admin tabs: the 4
// invite slots, their localized labels, and Meta-status pill styling/labels.

export const INVITE_SLOTS = ["physical_ar", "physical_he", "digital_ar", "digital_he"];

// Meta template approval statuses → pill style. `none` = not created yet.
export const SLOT_STATUS_STYLE = {
  APPROVED: { icon: "✓", color: "#4cc97a", bg: "rgba(76,201,122,.15)" },
  PENDING:  { icon: "⏳", color: "#e0b54b", bg: "rgba(224,181,75,.15)" },
  REJECTED: { icon: "✗", color: "#d47a4b", bg: "rgba(212,122,75,.18)" },
  PAUSED:   { icon: "⏸", color: "#d47a4b", bg: "rgba(212,122,75,.15)" },
  DISABLED: { icon: "⛔", color: "#d47a4b", bg: "rgba(212,122,75,.15)" },
  none:     { icon: "○", color: "#7a6a4a", bg: "rgba(122,106,74,.12)" },
};

const KNOWN_STATUS = ["none", "APPROVED", "PENDING", "REJECTED", "PAUSED", "DISABLED"];

/** Localized status label for known statuses; raw Meta string for the rest. */
export function statusText(status, t) {
  return KNOWN_STATUS.includes(status) ? t("wa_tpl_status_" + status) : String(status || "");
}

/** Human label for a slot, e.g. "رقمية · عربي" / "דיגיטלי · ערבית". */
export function slotLabel(slot, he) {
  const [type, locale] = String(slot).split("_");
  const typeLabel = type === "digital" ? (he ? "דיגיטלי" : "رقمية") : (he ? "פיזי" : "ورقية");
  const langLabel = locale === "ar" ? (he ? "ערבית" : "عربي") : (he ? "עברית" : "عبري");
  return `${typeLabel} · ${langLabel}`;
}
