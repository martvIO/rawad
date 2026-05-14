// Phone-number helpers — formatting, dialer links, and validation.

// Convert a local Israeli/Palestinian phone (starts with 0) to international
// format for wa.me. Numbers already in 972/970 form are passed through.
export const toIntlPhone = (raw) => {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("972") || digits.startsWith("970")) return digits;
  if (digits.startsWith("0")) return "972" + digits.slice(1); // assume Israel
  return digits;
};

// Build a `tel:` link for a phone number.
export const telLink = (phone) => `tel:${phone.replace(/\s+/g, "")}`;

// Validate a phone number: digits only, exactly 10 of them.
// Returns a localised error string, or null when valid. `t` is the translator.
export const validatePhone = (raw, t) => {
  const digits = raw.trim().replace(/\s+/g, "");
  if (!/^\d+$/.test(digits)) return t("phone_invalid_digits");
  if (digits.length < 10) {
    const missing = 10 - digits.length;
    return `${t("phone_invalid_short")} ${missing.toLocaleString("en")} ${missing === 1 ? t("phone_invalid_digit_label") : t("phone_invalid_digits_label")}`;
  }
  if (digits.length > 10) {
    const extra = digits.length - 10;
    return `${t("phone_invalid_extra")} ${extra.toLocaleString("en")} ${extra === 1 ? t("phone_invalid_digit_label") : t("phone_invalid_digits_label")}`;
  }
  return null;
};
