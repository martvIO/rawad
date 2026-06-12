// Form-field validators. Each returns a localised error string, or null when valid.

// A full name must have at least two words (first + family name).
export const validateName = (raw, t) => {
  const words = raw.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return t("name_invalid_words");
  return null;
};
