import { MAX_BYTES,MAX_LEN } from "../../../constants/limits";

// ─── Constants ────────────────────────────────────────────────────────────────

const COLL_ROOT = "digitalInvitations";
const COLL_GUESTS = "guests";
const COLL_PHOTOG = "photographerFiles";
const COLL_DESIGNS = "designs";

// Schema v2 = each design is its own doc in the `designs` subcollection (so a
// groom can have many), instead of a single design baked into the parent doc.
// `ensureMigrated` lifts a legacy (v1) parent design into `designs/{autoId}` on
// first authed touch, non-destructively.
const SCHEMA_VERSION = 2;
const MAX_DESIGNS_PER_GROOM = 8;
const MAX_DESIGN_TITLE_LEN = 60;

const STORAGE_MEDIA_PREFIX = "digitalMedia";
const STORAGE_PHOTOG_PREFIX = "photographerFiles";

const MAX_GUEST_NAME_LEN = MAX_LEN.NAME;
const MAX_GUEST_PHONE_LEN = MAX_LEN.PHONE;
const MAX_GUEST_RANK_LEN = MAX_LEN.GUEST_RANK;
const MAX_GUEST_NOTE_LEN = MAX_LEN.NOTE;
const MAX_BRIDE_NAME_LEN = MAX_LEN.NAME;
const MAX_VENUE_LEN = 120;
const MAX_VENUE_ADDR_LEN = 200;
const MAX_CUSTOM_MSG_LEN = 500;
const MAX_REJECT_NOTE_LEN = 500;
const MAX_STORY_LEN = 1000;
const MAX_EVENT_TITLE_LEN = 60;
const MAX_EVENT_TIME_LEN = 40;
const MAX_EVENT_VENUE_LEN = 120;
const MAX_EVENT_ADDR_LEN = 200;
const MAX_MAP_URL_LEN = 600;
const MAX_GIFT_IBAN_LEN = 60;
const MAX_GIFT_NOTE_LEN = 300;
const MAX_MUSIC_URL_LEN = 600;
const MAX_EVENT_ICON_LEN = 8;
const MAX_EVENTS = 6;
const MAX_RANK_ITEMS = 32;
// New luxury-design fields.
const MAX_EYEBROW_LEN = 60;
const MAX_MONOGRAM_LEN = 12;
const MAX_VENUE_CITY_LEN = 80;
const MAX_ACCESS_NOTE_LEN = 200;
const MAX_DRESS_CODE_LEN = 120;
const MAX_BLESSING_LEN = 80;
const MAX_WELCOME_LEN = 200;
const MAX_STORY_WHEN_LEN = 40;
const MAX_STORY_TITLE_LEN = 60;
const MAX_STORY_BODY_LEN = 400;
const MAX_STORY_ITEMS = 8;
const MAX_DETAIL_META_LEN = 40;
const MAX_DETAIL_TITLE_LEN = 80;
const MAX_DETAIL_BODY_LEN = 300;
const MAX_DETAIL_ITEMS = 8;
const MAX_HOTEL_NAME_LEN = 80;
const MAX_HOTEL_WALK_LEN = 40;
const MAX_HOTEL_ITEMS = 6;
const MAX_WISH_WHO_LEN = 60;
const MAX_WISH_WHAT_LEN = 300;
const MAX_WISH_ITEMS = 30;
const MAX_MEAL_OPTION_LEN = 40;
const MAX_MEAL_OPTIONS = 8;
const MAX_CAPTION_LEN = 120;
const MAX_CAPTION_ENTRIES = 60;
const MAX_GUEST_STATUSES = new Set(["pending", "attending", "absent"]);

// Keep in sync with THEMES / FONTS in src/styles/digitalThemes.js.
const THEME_COLORS = new Set([
  "gold", "rose", "blue", "emerald", "white",
  // Light luxe palettes
  "champagne", "blush", "sage", "dustyblue", "lavender",
  "pearl", "peach", "mint", "mauve", "ivorygold",
]);
const FONT_FAMILIES = new Set([
  "amiri", "noto", "cairo",
  // Arabic+Hebrew paired stacks
  "aref", "messiri", "reem", "tajawal", "markazi",
  "scheherazade", "changa", "lalezar", "lemonada",
]);

// Fields whose change demotes an approved design back to draft. Operational
// flags (photographerPublished, guestRanks) are intentionally NOT design fields.
const DESIGN_FIELDS = new Set([
  "brideName",
  "groomDisplayName",
  "weddingDate",
  "venue",
  "venueAddress",
  "customMessage",
  "themeColor",
  "fontFamily",
  "story",
  "events",
  "giftIban",
  "giftNote",
  "musicUrl",
  "storyEnabled",
  "eventsEnabled",
  "countdownEnabled",
  "galleryEnabled",
  "giftEnabled",
  "musicEnabled",
  "footerDockEnabled",
  // New luxury-design fields.
  "eyebrow",
  "blessing",
  "welcome",
  "monogram",
  "venueCity",
  "accessNote",
  "dressCode",
  "storyTimeline",
  "details",
  "hotels",
  "wishes",
  "mealOptions",
  "mediaCaptions",
  "detailsEnabled",
  "venueEnabled",
  "guestbookEnabled",
  "envelopeEnabled",
  "rsvpCompanionsEnabled",
  "rsvpMealEnabled",
  "rsvpSongEnabled",
  "heroMediaEnabled",
  "immersive3d",
]);

// Guest-facing field allowlist for the UNAUTHENTICATED public invitation read
// (`GET /:uid/public`). Fail-closed: only these keys reach a caller with no
// invite token. Everything else on the design doc — design-workflow metadata
// (designStatus, designRejectionNote, designApprovedAt, …) and any future
// internal field — is withheld. Derived from DESIGN_FIELDS (the editable content
// set) plus the media arrays the guest page renders (see DigitalInvitationView).
const PUBLIC_DESIGN_FIELDS = new Set<string>([
  ...DESIGN_FIELDS,
  "media",
  "heroMedia",
  "title",
  "weddingDate",
]);

const MAX_INVITE_MEDIA_BYTES = MAX_BYTES.INVITE_MEDIA;
const MAX_PHOTOG_BYTES = MAX_BYTES.PHOTOGRAPHER;
// Featured media shown under the hero greeting — a small, separate set kept
// out of the gallery (media[]). Capped so the hero stays light.
const MAX_HERO_MEDIA_ITEMS = 8;

const ALLOWED_MEDIA_PREFIX = ["image/", "video/"];

const SAFE_NAME_RE = /[^\w.\-]/g;

// Keys that live on the PARENT doc and must never be copied into a design doc
// (nor treated as design fields). Everything else on a legacy parent is design payload.
const PARENT_ONLY_KEYS = new Set([
  "photographerPublished",
  "guestRanks",
  "schemaVersion",
  "defaultDesignId",
  "designCount",
]);

export { COLL_ROOT, COLL_GUESTS, COLL_PHOTOG, COLL_DESIGNS, SCHEMA_VERSION, MAX_DESIGNS_PER_GROOM, MAX_DESIGN_TITLE_LEN, STORAGE_MEDIA_PREFIX, STORAGE_PHOTOG_PREFIX, MAX_GUEST_NAME_LEN, MAX_GUEST_PHONE_LEN, MAX_GUEST_RANK_LEN, MAX_GUEST_NOTE_LEN, MAX_BRIDE_NAME_LEN, MAX_VENUE_LEN, MAX_VENUE_ADDR_LEN, MAX_CUSTOM_MSG_LEN, MAX_REJECT_NOTE_LEN, MAX_STORY_LEN, MAX_EVENT_TITLE_LEN, MAX_EVENT_TIME_LEN, MAX_EVENT_VENUE_LEN, MAX_EVENT_ADDR_LEN, MAX_MAP_URL_LEN, MAX_GIFT_IBAN_LEN, MAX_GIFT_NOTE_LEN, MAX_MUSIC_URL_LEN, MAX_EVENT_ICON_LEN, MAX_EVENTS, MAX_RANK_ITEMS, MAX_EYEBROW_LEN, MAX_MONOGRAM_LEN, MAX_VENUE_CITY_LEN, MAX_ACCESS_NOTE_LEN, MAX_DRESS_CODE_LEN, MAX_BLESSING_LEN, MAX_WELCOME_LEN, MAX_STORY_WHEN_LEN, MAX_STORY_TITLE_LEN, MAX_STORY_BODY_LEN, MAX_STORY_ITEMS, MAX_DETAIL_META_LEN, MAX_DETAIL_TITLE_LEN, MAX_DETAIL_BODY_LEN, MAX_DETAIL_ITEMS, MAX_HOTEL_NAME_LEN, MAX_HOTEL_WALK_LEN, MAX_HOTEL_ITEMS, MAX_WISH_WHO_LEN, MAX_WISH_WHAT_LEN, MAX_WISH_ITEMS, MAX_MEAL_OPTION_LEN, MAX_MEAL_OPTIONS, MAX_CAPTION_LEN, MAX_CAPTION_ENTRIES, MAX_GUEST_STATUSES, THEME_COLORS, FONT_FAMILIES, DESIGN_FIELDS, PUBLIC_DESIGN_FIELDS, MAX_INVITE_MEDIA_BYTES, MAX_PHOTOG_BYTES, MAX_HERO_MEDIA_ITEMS, ALLOWED_MEDIA_PREFIX, SAFE_NAME_RE, PARENT_ONLY_KEYS };
