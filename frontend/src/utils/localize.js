// Bilingual content helpers. Groom-authored design fields can hold either a
// plain string (legacy / single-language designs) or a localized object
// `{ ar, he }`. `localize` resolves the right language with a fallback to the
// other one, so the invitation never shows a blank where the groom only filled
// one language. Existing single-string designs keep working untouched.

const OTHER = { ar: "he", he: "ar" };

/**
 * Resolve a possibly-localized value to a display string for `lang`.
 *   - plain string  → returned as-is (legacy single-language field)
 *   - { ar, he }    → value[lang] || value[otherLang] || ""
 *   - null/number   → "" / String(value)
 */
export function localize(value, lang = "ar") {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const other = OTHER[lang] || "ar";
    return value[lang] || value[other] || "";
  }
  return String(value);
}

/**
 * Localize an array of objects: returns a shallow copy of each item with the
 * named text keys resolved for `lang`. Non-listed keys (icons, structure) are
 * preserved. Used for the repeating design lists (story, details, hotels,
 * wishes) so the section components keep receiving plain strings.
 */
export function localizeItems(arr, keys, lang = "ar") {
  if (!Array.isArray(arr)) return [];
  return arr.map((item) => {
    if (!item || typeof item !== "object") return item;
    const out = { ...item };
    for (const k of keys) {
      if (k in out) out[k] = localize(out[k], lang);
    }
    return out;
  });
}

/** Localize an array of (string | {ar,he}) options, e.g. meal options. */
export function localizeList(arr, lang = "ar") {
  if (!Array.isArray(arr)) return [];
  return arr.map((v) => localize(v, lang));
}

/**
 * True when a value carries any content in either language. Handy for the
 * editor / validation to decide whether a localized field is "filled".
 */
export function hasContent(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "object") {
    return Boolean((value.ar && value.ar.trim()) || (value.he && value.he.trim()));
  }
  return true;
}
