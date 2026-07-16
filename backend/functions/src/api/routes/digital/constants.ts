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
// Groom-authored WhatsApp share-link description (og:description). Not shown on
// the invitation page itself — only in the link preview.
const MAX_SHARE_MSG_LEN = 300;
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

// Envelope (3D) customization — per-design colour overrides + star options.
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const ENVELOPE_COLOR_KEYS = ["paper", "wax", "foil", "cardPaper", "cardInk"] as const;
const STAR_DENSITY_MIN = 1;
const STAR_DENSITY_MAX = 4;
const STAR_INTENSITY_MIN = 0;
const STAR_INTENSITY_MAX = 1;

// Custom background customization — per-design fill / decorative circles / image.
// When `enabled`, the public invitation renders this custom 2D background for ALL
// guests (the 3D world is suppressed; the envelope intro still plays then fades).
// `image` is SERVER-managed (set only by the media upload route, target=background)
// and is stripped from client PATCH input. The remaining keys are flat scalars so
// sanitizeBackground mirrors sanitizeEnvelope's validate-or-clamp loop.
const BACKGROUND_COLOR_KEYS = ["color", "gradientFrom", "gradientTo", "circleColor"] as const;
const BACKGROUND_BOOL_KEYS = ["enabled", "gradient", "circleMotion", "petals", "sparkles"] as const;
const BG_CIRCLE_COUNT_MIN = 0;
const BG_CIRCLE_COUNT_MAX = 6;
const BG_UNIT_MIN = 0; // size / opacity / softness / imageOverlay are all 0..1
const BG_UNIT_MAX = 1;

// Per-design background-STARFIELD tuning (the celestial particle field behind the
// 3D envelope): a single star colour + size + clarity/opacity multipliers.
const STARFIELD_SIZE_MIN = 0.4;
const STARFIELD_SIZE_MAX = 2.5;
const STARFIELD_OPACITY_MIN = 0;
const STARFIELD_OPACITY_MAX = 2;
// Scroll-driven "entrance" speed multiplier for the background stars (how fast
// the field streams in as the guest scrolls). 1 = the built-in baseline.
const STARFIELD_SPEED_MIN = 0.2;
const STARFIELD_SPEED_MAX = 3;

// Admin-editable public demo. The editable demo design lives under a reserved
// synthetic uid (a Firestore path only — NOT a real auth user, so it never
// appears in the admin Users list). "Publish to demo" snapshots it into a
// separate config doc that the public demo page reads.
// NB: Firestore reserves document IDs matching /^__.*__$/, so the uid must NOT
// be wrapped in double underscores; Firebase Auth uids are 28-char tokens, so
// "demo-design" can never collide with a real groom.
const DEMO_UID = "demo-design";
const DEMO_DESIGN_ID = "demo";
const DEMO_CONFIG_DOC = "appConfig/demoDesign";

// Admin-uploaded TEMPLATE PREVIEW COVERS — the art shown on the public gallery,
// the landing strip, and the groom's template picker. One pointer doc holds a
// { [templateId]: {url, storagePath, updatedAt} } map (bounded by the template
// count, so it stays a single cheap public read), with the bytes in Storage.
// This is design-time art about a template, NOT a design field — no design doc,
// snapshot, or sanitize path is involved.
const TEMPLATE_ASSETS_DOC = "appConfig/templateAssets";
const STORAGE_TEMPLATE_ASSETS_PREFIX = "templateAssets";
// Covers are stills shown at ~240px wide; 10 MB is generous for a hi-DPI JPEG/PNG
// while keeping the through-function upload well inside the 512 MiB body budget.
const MAX_TEMPLATE_ASSET_BYTES = 10 * 1024 * 1024;

// Keep in sync with THEMES / FONTS in src/styles/digitalThemes.js.
const THEME_COLORS = new Set([
  "gold", "rose", "blue", "emerald", "white",
  // Light luxe palettes
  "champagne", "blush", "sage", "dustyblue", "lavender",
  "pearl", "peach", "mint", "mauve", "ivorygold",
  // Destination Love (رحلة الحب) native palettes
  "voyage", "voyageAzure", "voyageSand",
  // Dolce Vita (dolce-vita)
  "dolceVita", "dolceVitaNotte", "dolceVitaLimone",
  // Sacred Garden (sacred-garden)
  "sacredGarden", "sacredGardenNight", "sacredGardenRose",
  // Blossom & Oud (blossom-oud)
  "blossomOud", "blossomOudNight", "blossomOudGold",
  // Gilded Orchard (gilded-orchard)
  "gildedOrchard", "gildedOrchardDusk", "gildedOrchardDawn",
  // Lumen (lumen)
  "lumen", "lumenNoir", "lumenSnow",
]);
const FONT_FAMILIES = new Set([
  "amiri", "noto", "cairo",
  // Arabic+Hebrew paired stacks
  "aref", "messiri", "reem", "tajawal", "markazi",
  "scheherazade", "changa", "lalezar", "lemonada",
]);

// Structural TEMPLATE registry (TASK-TPL-1). Unlike `envelope.style` (a free
// safe-slug — a cosmetic sub-scene, so an unrecognized value harmlessly falls
// back to the classic 3D scene), `templateId` picks WHICH STRUCTURAL COMPONENT
// TREE mounts — an unrecognized value has no safe "render something" fallback
// at this layer, so it's a fixed enum like THEME_COLORS/FONT_FAMILIES: a
// mistyped/unknown value is a hard, visible rejection rather than a silent
// runtime fallback. Keep in sync with shared/src/data/digitalTemplates.js
// TEMPLATES (a unit test asserts the two stay set-equal) and with
// frontend/src/components/digital/templates/registry.js TEMPLATE_REGISTRY.
// New ids are appended here only once their frontend Component + registry
// entry actually exist — never speculatively ahead of the frontend build.
const TEMPLATE_IDS = new Set(["classic", "destination-love", "dolce-vita", "sacred-garden", "blossom-oud", "gilded-orchard", "lumen"]);

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
  "shareMessage",
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
  "envelope",
  "background",
  "starfield",
  "templateId",
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
const MAX_PHOTOG_LEGACY_BYTES = MAX_BYTES.PHOTOGRAPHER_LEGACY;
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

export { COLL_ROOT, COLL_GUESTS, COLL_PHOTOG, COLL_DESIGNS, SCHEMA_VERSION, MAX_DESIGNS_PER_GROOM, MAX_DESIGN_TITLE_LEN, STORAGE_MEDIA_PREFIX, STORAGE_PHOTOG_PREFIX, MAX_GUEST_NAME_LEN, MAX_GUEST_PHONE_LEN, MAX_GUEST_RANK_LEN, MAX_GUEST_NOTE_LEN, MAX_BRIDE_NAME_LEN, MAX_VENUE_LEN, MAX_VENUE_ADDR_LEN, MAX_CUSTOM_MSG_LEN, MAX_REJECT_NOTE_LEN, MAX_STORY_LEN, MAX_EVENT_TITLE_LEN, MAX_EVENT_TIME_LEN, MAX_EVENT_VENUE_LEN, MAX_EVENT_ADDR_LEN, MAX_MAP_URL_LEN, MAX_GIFT_IBAN_LEN, MAX_GIFT_NOTE_LEN, MAX_MUSIC_URL_LEN, MAX_EVENT_ICON_LEN, MAX_EVENTS, MAX_RANK_ITEMS, MAX_EYEBROW_LEN, MAX_MONOGRAM_LEN, MAX_VENUE_CITY_LEN, MAX_ACCESS_NOTE_LEN, MAX_DRESS_CODE_LEN, MAX_BLESSING_LEN, MAX_WELCOME_LEN, MAX_SHARE_MSG_LEN, MAX_STORY_WHEN_LEN, MAX_STORY_TITLE_LEN, MAX_STORY_BODY_LEN, MAX_STORY_ITEMS, MAX_DETAIL_META_LEN, MAX_DETAIL_TITLE_LEN, MAX_DETAIL_BODY_LEN, MAX_DETAIL_ITEMS, MAX_HOTEL_NAME_LEN, MAX_HOTEL_WALK_LEN, MAX_HOTEL_ITEMS, MAX_WISH_WHO_LEN, MAX_WISH_WHAT_LEN, MAX_WISH_ITEMS, MAX_MEAL_OPTION_LEN, MAX_MEAL_OPTIONS, MAX_CAPTION_LEN, MAX_CAPTION_ENTRIES, MAX_GUEST_STATUSES, HEX_COLOR_RE, ENVELOPE_COLOR_KEYS, STAR_DENSITY_MIN, STAR_DENSITY_MAX, STAR_INTENSITY_MIN, STAR_INTENSITY_MAX, BACKGROUND_COLOR_KEYS, BACKGROUND_BOOL_KEYS, BG_CIRCLE_COUNT_MIN, BG_CIRCLE_COUNT_MAX, BG_UNIT_MIN, BG_UNIT_MAX, STARFIELD_SIZE_MIN, STARFIELD_SIZE_MAX, STARFIELD_OPACITY_MIN, STARFIELD_OPACITY_MAX, STARFIELD_SPEED_MIN, STARFIELD_SPEED_MAX, DEMO_UID, DEMO_DESIGN_ID, DEMO_CONFIG_DOC, TEMPLATE_ASSETS_DOC, STORAGE_TEMPLATE_ASSETS_PREFIX, MAX_TEMPLATE_ASSET_BYTES, THEME_COLORS, FONT_FAMILIES, TEMPLATE_IDS, DESIGN_FIELDS, PUBLIC_DESIGN_FIELDS, MAX_INVITE_MEDIA_BYTES, MAX_PHOTOG_BYTES, MAX_PHOTOG_LEGACY_BYTES, MAX_HERO_MEDIA_ITEMS, ALLOWED_MEDIA_PREFIX, SAFE_NAME_RE, PARENT_ONLY_KEYS };
