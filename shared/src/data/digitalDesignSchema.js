// Digital-invitation DESIGN field schema — the single source of truth for which
// fields a design carries, shared by the web editor (DigitalDesignEditor.jsx)
// and the native app editor (app design.jsx). Keeping one list here prevents the
// two editors from drifting. The backend allowlist (DESIGN_FIELDS in
// backend/functions/src/api/routes/digital/constants.ts) is authoritative for
// persistence; this mirrors the groom-editable subset.

// Scalar text fields the groom edits. All are localized ({ ar, he }) EXCEPT the
// two in PLAIN_SCALARS below (giftIban / musicUrl are single strings).
export const SCALAR_KEYS = [
  "title",
  "brideName", "groomDisplayName", "eyebrow", "blessing", "welcome", "monogram",
  "venue", "venueCity", "venueAddress", "accessNote", "dressCode",
  "giftNote", "giftIban", "musicUrl",
];

// Scalars stored as a plain string (not an { ar, he } localized object).
export const PLAIN_SCALARS = new Set(["giftIban", "musicUrl"]);

// True when the scalar value is a localized { ar, he } object.
export const isLocalizedScalar = (key) => SCALAR_KEYS.includes(key) && !PLAIN_SCALARS.has(key);

// Repeatable content sections (each an array of localized rows).
// `events` (the multi-day schedule: henna night + wedding day, each with its own
// venue and map link) predates the luxury-editorial redesign and is fully
// validated server-side (DESIGN_FIELDS + sanitize.ts's EventItem branch) — it had
// simply lost its editor UI. Revived 2026-07-16 rather than inventing a new field
// for "two dates, two venues", so no design-doc schema change was needed.
export const ARRAY_KEYS = ["storyTimeline", "details", "hotels", "wishes", "mealOptions", "events"];

// Per-array row shape: the LOCALIZED sub-fields each row carries — the native
// editor writes every listed key as an { ar, he } object, so a plain-string
// sub-field must NOT be listed here (storyTimeline's `icon` is omitted for the
// same reason). `events` therefore lists only its four localized cells: the
// server takes icon/mapUrl through clampField (plain), and title/time/venue/
// address through clampLocalized. mealOptions is a bare localized string per row.
export const ARRAY_ROW_FIELDS = {
  storyTimeline: ["when", "title", "body"],
  details: ["meta", "title", "body"],
  hotels: ["name", "walk"],
  wishes: ["who", "what"],
  events: ["title", "time", "venue", "address"], // icon + mapUrl are plain strings
  mealOptions: [], // each row is itself a localized { ar, he } value
};

// Section on/off toggles (default ON when the server omits them).
export const TOGGLE_KEYS = [
  "storyEnabled", "galleryEnabled", "detailsEnabled", "venueEnabled",
  "countdownEnabled", "guestbookEnabled", "giftEnabled", "musicEnabled",
  "footerDockEnabled", "envelopeEnabled", "heroMediaEnabled",
  "rsvpCompanionsEnabled", "rsvpMealEnabled", "rsvpSongEnabled",
  "immersive3d", "eventsEnabled",
];

// Design approval-workflow status metadata (labels + accent colour).
export const DESIGN_STATUS_META = {
  draft:            { ar: "مسوّدة", he: "טיוטה", color: "#c9a84c" },
  pending_approval: { ar: "بانتظار الموافقة", he: "ממתין לאישור", color: "#4b9fd4" },
  approved:         { ar: "معتمد", he: "מאושר", color: "#4cc97a" },
  rejected:         { ar: "مرفوض", he: "נדחה", color: "#d4533a" },
};
