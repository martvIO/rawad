// Confirmation matching utilities — phone normalization and fuzzy name/address
// similarity. Pure functions; no Firebase or React imports. Used by the admin
// confirmation tab to classify each submission as green / red / unknown.
//
// Matching priority (per spec): Phone → Name → Address.
//   - Phone is the primary key. Two phones are "equal" if their canonical
//     forms (digits only, country code + leading zero stripped) match.
//   - Name and address use fuzzy similarity to tolerate spelling variation
//     across Arabic / Hebrew / English transliterations.

// ── Phone ───────────────────────────────────────────────────────────────────

// Strip everything except digits, then peel known country prefixes and a
// leading zero. The result is the "national subscriber number" used for
// comparison only — never displayed.
//
// Examples that all collapse to "501234567":
//   +972 50-123-4567   972501234567   00972501234567
//   0501234567         501234567      050 123 4567
export function normalizePhoneForMatching(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  let d = digits;
  // 00<cc>… international prefix
  if (d.startsWith("00972")) d = d.slice(5);
  else if (d.startsWith("00970")) d = d.slice(5);
  // Bare country code
  else if (d.startsWith("972")) d = d.slice(3);
  else if (d.startsWith("970")) d = d.slice(3);
  // National trunk prefix
  if (d.startsWith("0")) d = d.slice(1);
  return d;
}

export function phonesEqual(a, b) {
  const na = normalizePhoneForMatching(a);
  const nb = normalizePhoneForMatching(b);
  return !!na && !!nb && na === nb;
}

// ── String normalization ────────────────────────────────────────────────────

// Lowercase, strip diacritics (Arabic tashkeel + Latin accents), collapse
// whitespace, and remove punctuation. Conservative — preserves Arabic/Hebrew
// letters, only cleans the noise that causes false negatives.
function normalizeText(s) {
  if (!s) return "";
  let out = String(s).toLowerCase().trim();
  // Strip Latin combining marks (é → e)
  out = out.normalize("NFD").replace(/[̀-ͯ]/g, "");
  // Strip Arabic tashkeel/harakat (vowel marks)
  out = out.replace(/[ً-ْٰـ]/g, "");
  // Common Arabic letter normalization (alef variants → bare alef, taa marbuta → haa)
  out = out.replace(/[آأإ]/g, "ا").replace(/ة/g, "ه")
           .replace(/ى/g, "ي");
  // Punctuation → space; collapse multi-space
  out = out.replace(/[.,،;:!?'"()\-_/\\]+/g, " ").replace(/\s+/g, " ").trim();
  return out;
}

function wordsOf(s) {
  const n = normalizeText(s);
  return n ? n.split(" ") : [];
}

// ── Similarity ──────────────────────────────────────────────────────────────

// Sørensen–Dice on character bigrams. Tolerant of insertions, deletions,
// and short transpositions — works well for transliteration variants like
// "Muhammad" / "Mohammed" or Arabic spelling differences.
function diceBigrams(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const bigrams = new Map();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    bigrams.set(g, (bigrams.get(g) || 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const c = bigrams.get(g);
    if (c > 0) { bigrams.set(g, c - 1); hits++; }
  }
  return (2 * hits) / (a.length - 1 + b.length - 1);
}

// Jaccard over word sets — order-independent. Handles "Ali Muhammad" vs
// "Muhammad Ali" perfectly (returns 1.0).
function jaccardWords(a, b) {
  const wa = new Set(wordsOf(a));
  const wb = new Set(wordsOf(b));
  if (wa.size === 0 && wb.size === 0) return 1;
  if (wa.size === 0 || wb.size === 0) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  const union = wa.size + wb.size - inter;
  return inter / union;
}

// Name similarity = max(bigram-on-joined-words, word-set Jaccard). The first
// catches spelling variants; the second catches word reordering.
export function nameSimilarity(a, b) {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  return Math.max(diceBigrams(na, nb), jaccardWords(a, b));
}

// Address similarity — short strings, partial match is expected. Use
// word-set Jaccard so "Tel Aviv, Rothschild" vs "Tel Aviv" still scores high.
export function addressSimilarity(a, b) {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  // For very short addresses (one word), fall back to bigrams.
  if (wordsOf(a).length < 2 && wordsOf(b).length < 2) return diceBigrams(na, nb);
  return Math.max(jaccardWords(a, b), diceBigrams(na, nb) * 0.9);
}

// ── Thresholds ──────────────────────────────────────────────────────────────
// Tuned for short Arabic/Hebrew names where one-letter spelling variants
// are common. 0.55 accepts "Muhammad" ≈ "Mohammed"; 0.40 accepts a partial
// city match (one of two words present).
export const NAME_SIMILAR_THRESHOLD = 0.55;
export const ADDRESS_SIMILAR_THRESHOLD = 0.40;

// ── Classification ─────────────────────────────────────────────────────────

// Compose the address shown in the confirmation form (city + street + house).
export function composeConfirmationAddress(conf) {
  return [conf?.submittedCity, conf?.submittedStreet, conf?.submittedHouse]
    .filter(Boolean).map(s => String(s).trim()).filter(Boolean).join(" ");
}

// Classify a confirmation against a single groom's guest list.
//
// Returns one of:
//   { status: "green",   guest, reasons: [] }
//   { status: "red",     guest, reasons: ["name_differs"|"address_differs"|...] }
//   { status: "unknown", guest: null, reasons: [] }
//
// Cases per spec:
//   A) phone exists + name similar + address similar       → green
//   B) phone exists + name similar + groom-area empty
//      + guest entered an address                          → green
//   C) phone exists but name or address differs            → red
//   D) phone not in any guest of this groom                → unknown
export function classifyConfirmation(conf, guestList) {
  if (!conf) return { status: "unknown", guest: null, reasons: [] };
  const wanted = normalizePhoneForMatching(conf.submittedPhone);
  if (!wanted) return { status: "unknown", guest: null, reasons: [] };

  // Find guest by phone within the same groom. Falls back to all if the
  // caller passed a flat list (admin view); guard with groomUid match.
  const guest = guestList.find(g =>
    (!conf.groomUid || g.groomUid === conf.groomUid) &&
    normalizePhoneForMatching(g.phone) === wanted,
  ) || null;

  if (!guest) return { status: "unknown", guest: null, reasons: [] };

  const nameSim = nameSimilarity(conf.submittedName, guest.name);
  const guestHasAddress = !!(guest.area && String(guest.area).trim());
  const confAddress = composeConfirmationAddress(conf);
  const confHasAddress = !!confAddress;
  const addrSim = guestHasAddress && confHasAddress
    ? addressSimilarity(confAddress, guest.area)
    : 0;

  const reasons = [];
  const nameOk = nameSim >= NAME_SIMILAR_THRESHOLD;
  const addrOk = !guestHasAddress
    ? true                                       // groom has no address → don't penalize
    : addrSim >= ADDRESS_SIMILAR_THRESHOLD;

  if (!nameOk) reasons.push("name_differs");
  if (!addrOk) reasons.push("address_differs");

  // Case A: everything aligns.
  if (nameOk && addrOk) return { status: "green", guest, reasons: [] };

  // Case B: name matches; groom has no address; guest filled one in.
  if (nameOk && !guestHasAddress && confHasAddress) {
    return { status: "green", guest, reasons: [] };
  }

  // Case C: anything else with a phone match is a red mismatch.
  return { status: "red", guest, reasons };
}

// Build a map of confirmation.id → classification result. Computed once per
// (confirmations, guests) change in usePortalState.
export function classifyAll(confirmations, guests) {
  const out = new Map();
  // Index guests by groomUid for O(1) lookup
  const byGroom = new Map();
  for (const g of guests || []) {
    if (!g.groomUid) continue;
    if (!byGroom.has(g.groomUid)) byGroom.set(g.groomUid, []);
    byGroom.get(g.groomUid).push(g);
  }
  for (const conf of confirmations || []) {
    const list = byGroom.get(conf.groomUid) || [];
    out.set(conf.id, classifyConfirmation(conf, list));
  }
  return out;
}
