// Shared media helpers.

// Is a stored proof value a displayable image?
// Proofs are either a `data:image/*` data URL (legacy inline capture) or an
// `https://` (or `http://`) Cloud Storage download URL (post-Storage-migration).
// Used by BOTH the groom dashboard recent-deliveries widget and the Proofs tab
// so the two predicates can't drift (they did — the dashboard only accepted
// data: URLs and hid every real Storage-backed proof).
export function isProofImage(v) {
  return typeof v === "string"
    && (v.startsWith("data:image") || /^https?:\/\//.test(v));
}
