// Reusable list search + status-filter helper for every portal list view.
//
// Pure, in-memory filtering of data the pages already hold (REST polling /
// local state) — no Firebase, no network. Two concerns:
//   1. Free-text search — normalized substring matching that is diacritic-,
//      digit- (Arabic-Indic → ASCII), and phone-insensitive. Reuses the SAME
//      `normalizeText` + `normalizePhoneForMatching` the confirmation-matching
//      engine uses, so search behaves consistently with the rest of the app.
//   2. Status/category chips — an optional second filter dimension (delivery
//      status, RSVP, role, design status, file type…) layered on top of search.
//
// Design notes:
//   • Matching is SUBSTRING, not fuzzy — predictable, no surprise results.
//   • Token-AND: every whitespace-separated token in the query must hit some
//     field (or a phone field), so "rawad haifa" narrows progressively.
//   • A token matches a phone field by its canonical national form, so
//     "052", "+97252…", "۰۵۲…" all find the same stored number.

import { useMemo, useState } from "react";
import { normalizeText, normalizePhoneForMatching } from "./matchUtils.js";
import { toWesternDigits } from "./digits.js";
import { localize } from "./localize.js";

// Shared frozen empties so default args keep a stable identity across renders
// (passing a fresh `[]` each call would defeat the useMemo deps below).
const EMPTY = Object.freeze([]);

// Westernize digits BEFORE folding so Arabic-Indic numerals in either the query
// or the data collapse to one ASCII form, then strip diacritics/punctuation.
//
// normalizeText decomposes via NFD *before* folding alef variants, which leaves
// the Arabic hamza combining marks (U+0653–U+0655) sitting on a bare alef/waw/
// yaa (e.g. "أ" → "ا"+U+0654). The fuzzy match engine tolerates that; our exact
// substring search does not. Strip those marks here — search-only — so a query
// typed without hamza ("احمد") still finds "أحمد". matchUtils stays untouched,
// so confirmation matching is unaffected.
export function normalizeForSearch(value) {
  if (value == null) return "";
  return normalizeText(toWesternDigits(String(value))).replace(/[ٓ-ٕ]/g, "");
}

// Resolve one field spec to a display string.
//   • string key      → item[key], routed through localize (handles {ar,he})
//   • accessor fn      → fn(item, lang); may return a string OR string[]
// Arrays (e.g. a guest's `ranks`) are localized element-wise and joined.
function readField(item, fieldSpec, lang) {
  const raw = typeof fieldSpec === "function" ? fieldSpec(item, lang) : item?.[fieldSpec];
  if (raw == null) return "";
  if (Array.isArray(raw)) return raw.map((v) => localize(v, lang)).join(" ");
  return localize(raw, lang);
}

// True when `item` satisfies `query` against the given text/phone fields.
// Empty query ⇒ always true (no filtering).
export function matchesQuery(item, query, { fields = EMPTY, phoneFields = EMPTY, lang = "ar" } = {}) {
  const q = normalizeForSearch(query);
  if (!q) return true;
  const tokens = q.split(" ").filter(Boolean);
  if (tokens.length === 0) return true;

  const textHay = fields.map((f) => normalizeForSearch(readField(item, f, lang))).join(" ");
  const phoneHay = phoneFields.length
    ? phoneFields.map((f) => normalizePhoneForMatching(readField(item, f, lang))).filter(Boolean).join(" ")
    : "";

  // Each token must hit the text haystack OR (if it carries digits) match a
  // phone field by canonical form. Per-token keeps mixed "name 052" queries sane.
  return tokens.every((tok) => {
    if (textHay.includes(tok)) return true;
    if (phoneHay) {
      const tokPhone = normalizePhoneForMatching(tok);
      if (tokPhone && phoneHay.includes(tokPhone)) return true;
    }
    return false;
  });
}

// Standalone convenience (non-hook) — filter an array in one call.
export function filterList(items, query, opts) {
  if (!query || !query.trim()) return items || [];
  return (items || []).filter((it) => matchesQuery(it, query, opts));
}

// Hook: drives a SearchBar + (optional) FilterChips for one list.
//
//   items       — the source array (already scoped by any pre-filter, e.g. role)
//   fields      — text field specs (string keys or accessors) — MODULE-LEVEL const
//   phoneFields — phone field specs                            — MODULE-LEVEL const
//   lang        — "ar" | "he"
//   statusOf    — (item) => statusKey | null. Omit for search-only lists.
//                 Define at MODULE level (stable identity) so memos hold.
//   statuses    — [{ key, label }] chip definitions (labels already translated).
//                 May be built in render (cheap); drives the `chips` output.
//   allLabel    — label for the leading "all" chip.
//
// Returns { query, setQuery, activeStatus, setActiveStatus, filtered, counts, chips }.
//   • counts — { all, [statusKey]: n } computed over the text-filtered set, so
//     chip counts update live as the user types.
//   • filtered — text filter AND active status chip.
//   • chips — ready-to-render [{ key, label, count }] (empty when no statuses).
export function useListFilter(items, {
  fields = EMPTY,
  phoneFields = EMPTY,
  lang = "ar",
  statusOf = null,
  statuses = EMPTY,
  allLabel = "",
} = {}) {
  const [query, setQuery] = useState("");
  const [activeStatus, setActiveStatus] = useState("all");

  const textFiltered = useMemo(() => {
    if (!query.trim()) return items || [];
    return (items || []).filter((it) => matchesQuery(it, query, { fields, phoneFields, lang }));
  }, [items, query, lang, fields, phoneFields]);

  const counts = useMemo(() => {
    const c = { all: textFiltered.length };
    if (statusOf) {
      for (const it of textFiltered) {
        const k = statusOf(it);
        if (k != null) c[k] = (c[k] || 0) + 1;
      }
    }
    return c;
  }, [textFiltered, statusOf]);

  const filtered = useMemo(() => {
    if (!statusOf || activeStatus === "all") return textFiltered;
    return textFiltered.filter((it) => statusOf(it) === activeStatus);
  }, [textFiltered, activeStatus, statusOf]);

  const chips = useMemo(() => {
    if (!statuses || statuses.length === 0) return [];
    return [
      { key: "all", label: allLabel, count: counts.all || 0 },
      ...statuses.map((s) => ({ key: s.key, label: s.label, count: counts[s.key] || 0 })),
    ];
  }, [statuses, counts, allLabel]);

  return { query, setQuery, activeStatus, setActiveStatus, filtered, counts, chips };
}
