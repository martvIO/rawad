// Phone-number helpers — formatting, dialer links, and validation.
// Phone values flowing through the app are now E.164 (e.g. "+972501234567")
// — see <PhoneInput>. Legacy local-format strings ("0501234567" / digits-only)
// still parse correctly for matching and link-building.

// WhatsApp web URL prefix. `intl` digits + optional `?text=...` are appended.
const WA_LINK_PREFIX = "https://wa.me/";

// Convert any phone string to international digits (no `+`) for wa.me URLs.
// Numbers already in 972/970 form are passed through; local "0…" becomes "972…".
export const toIntlPhone = (raw) => {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("972") || digits.startsWith("970")) return digits;
  if (digits.startsWith("0")) return "972" + digits.slice(1); // assume Israel
  return digits;
};

// Build a `tel:` link for a phone number.
export const telLink = (phone) => `tel:${(phone || "").replace(/\s+/g, "")}`;

// تُعيد true إذا كان الرقم وهمياً مُولَّداً محلياً عند إنشاء حساب بدون هاتف.
// نستخدم نطاق +1202555XXXX (Washington DC, 555 range) وهو محجوز رسمياً للاستخدام
// الخيالي/الاختباري في NANP وتقبله libphonenumber كرقم صالح الشكل.
export const isPlaceholderPhone = (p) =>
  typeof p === "string" && p.startsWith("+1202555");

// Build a WhatsApp chat URL for a phone number, optionally pre-filling a
// text body (and/or a URL appended on a separate line). Returns null when
// the phone is empty / cannot be converted to international form.
//
// Used by every "send via WhatsApp" code path (bulk send, per-guest invite
// link, digital invite, manual share). Previously inlined in 4+ places.
export const buildWaLink = (phone, body, url) => {
  const intl = toIntlPhone(phone);
  if (!intl) return null;
  const text = [body, url].filter(Boolean).join("\n\n");
  return text
    ? `${WA_LINK_PREFIX}${intl}?text=${encodeURIComponent(text)}`
    : `${WA_LINK_PREFIX}${intl}`;
};

// Validate a phone number. Accepts both E.164 ("+972…") and the legacy
// 10-digit local format. Returns a localised error string, or null when valid.
// `t` is the translator from i18n.
export const validatePhone = (raw, t) => {
  const cleaned = (raw || "").trim().replace(/[\s\-()]/g, "");
  if (!cleaned) return t("phone_invalid_short");
  // E.164 — accept anything from 8–15 digits after the "+".
  if (cleaned.startsWith("+")) {
    const digits = cleaned.slice(1);
    if (!/^\d+$/.test(digits))       return t("phone_invalid_digits");
    if (digits.length < 8)           return t("phone_invalid_short");
    if (digits.length > 15)          return t("phone_invalid_extra");
    return null;
  }
  // Legacy local format: exactly 10 digits (0XXXXXXXXX).
  if (!/^\d+$/.test(cleaned)) return t("phone_invalid_digits");
  if (cleaned.length < 10) {
    const missing = 10 - cleaned.length;
    return `${t("phone_invalid_short")} ${missing.toLocaleString("en")} ${missing === 1 ? t("phone_invalid_digit_label") : t("phone_invalid_digits_label")}`;
  }
  if (cleaned.length > 10) {
    const extra = cleaned.length - 10;
    return `${t("phone_invalid_extra")} ${extra.toLocaleString("en")} ${extra === 1 ? t("phone_invalid_digit_label") : t("phone_invalid_digits_label")}`;
  }
  return null;
};
