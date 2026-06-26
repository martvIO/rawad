// Arabic-Indic → Western digit normalization.
//
// The app targets an Arabic/Hebrew audience, so users (and some sample content)
// frequently produce Arabic-Indic numerals: ٠١٢٣٤٥٦٧٨٩ (U+0660–0669) and the
// Extended Arabic-Indic / Persian set ۰۱۲۳۴۵۶۷۸۹ (U+06F0–06F9). The product
// standard is Western ASCII digits everywhere, so we convert at the input
// boundary (apiClient, PhoneInput) and provide a deep walker for the one-time
// database migration.
//
// Only digit codepoints are touched — Arabic letters, punctuation, and existing
// Western digits are left as-is. e.g. "صيف ٢٠٢٣" → "صيف 2023".

const DIGIT_MAP = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

// Global regex — `String.prototype.replace` resets lastIndex on each call, so
// reusing this module-level instance is safe (do NOT call `.test()` on it).
const DIGIT_RE = /[٠-٩۰-۹]/g;

// Convert Arabic-Indic / Persian digits in a string to Western ASCII digits.
// Non-strings are returned unchanged so callers can pass mixed values freely.
export function toWesternDigits(input) {
  if (typeof input !== "string") return input;
  return input.replace(DIGIT_RE, (d) => DIGIT_MAP[d]);
}

// Keys whose values must never be normalized — passwords may legitimately
// contain Arabic-Indic digits, and rewriting them would break authentication.
export const PRESERVE_KEYS = new Set([
  "password",
  "newPassword",
  "currentPassword",
  "oldPassword",
  "confirmPassword",
]);

// Recursively normalize every string in a JSON-like value, returning a NEW
// value (the input is never mutated). Object keys listed in `preserveKeys` are
// passed through untouched. Used to scrub request bodies before they hit the
// API and by the DB migration script.
export function westernizeDeep(value, preserveKeys = PRESERVE_KEYS) {
  if (typeof value === "string") return toWesternDigits(value);
  if (Array.isArray(value)) return value.map((v) => westernizeDeep(v, preserveKeys));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = preserveKeys.has(k) ? v : westernizeDeep(v, preserveKeys);
    }
    return out;
  }
  return value;
}
