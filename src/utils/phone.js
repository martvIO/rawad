// Phone-number helpers — formatting, dialer links, and validation.
// Phone values flowing through the app are now E.164 (e.g. "+972501234567")
// — see <PhoneInput>. Legacy local-format strings ("0501234567" / digits-only)
// still parse correctly for matching and link-building.

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

// تُعيد true إذا كان الرقم وهمياً (يبدأ بـ +999). يُولَّد محلياً عند إنشاء
// حساب بدون هاتف لأنّ Cloud Function المنشورة تطلب E.164 صالحاً. تستخدم
// هذه الدالّة في كلّ أماكن عرض الهاتف لإخفاء الرقم الوهمي عن الأدمن.
export const isPlaceholderPhone = (p) =>
  typeof p === "string" && p.startsWith("+999");

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
