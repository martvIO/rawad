import { MAX_DESIGN_TITLE_LEN,MAX_GUEST_NAME_LEN,MAX_GUEST_PHONE_LEN,MAX_GUEST_RANK_LEN,MAX_GUEST_NOTE_LEN,MAX_BRIDE_NAME_LEN,MAX_VENUE_LEN,MAX_VENUE_ADDR_LEN,MAX_CUSTOM_MSG_LEN,MAX_STORY_LEN,MAX_EVENT_TITLE_LEN,MAX_EVENT_TIME_LEN,MAX_EVENT_VENUE_LEN,MAX_EVENT_ADDR_LEN,MAX_MAP_URL_LEN,MAX_GIFT_IBAN_LEN,MAX_GIFT_NOTE_LEN,MAX_MUSIC_URL_LEN,MAX_EVENT_ICON_LEN,MAX_EVENTS,MAX_RANK_ITEMS,MAX_EYEBROW_LEN,MAX_MONOGRAM_LEN,MAX_VENUE_CITY_LEN,MAX_ACCESS_NOTE_LEN,MAX_DRESS_CODE_LEN,MAX_BLESSING_LEN,MAX_WELCOME_LEN,MAX_SHARE_MSG_LEN,MAX_STORY_WHEN_LEN,MAX_STORY_TITLE_LEN,MAX_STORY_BODY_LEN,MAX_STORY_ITEMS,MAX_DETAIL_META_LEN,MAX_DETAIL_TITLE_LEN,MAX_DETAIL_BODY_LEN,MAX_DETAIL_ITEMS,MAX_HOTEL_NAME_LEN,MAX_HOTEL_WALK_LEN,MAX_HOTEL_ITEMS,MAX_WISH_WHO_LEN,MAX_WISH_WHAT_LEN,MAX_WISH_ITEMS,MAX_MEAL_OPTION_LEN,MAX_MEAL_OPTIONS,MAX_CAPTION_LEN,MAX_CAPTION_ENTRIES,MAX_GUEST_STATUSES,HEX_COLOR_RE,ENVELOPE_COLOR_KEYS,STAR_DENSITY_MIN,STAR_DENSITY_MAX,STAR_INTENSITY_MIN,STAR_INTENSITY_MAX,BACKGROUND_COLOR_KEYS,BACKGROUND_BOOL_KEYS,BG_CIRCLE_COUNT_MIN,BG_CIRCLE_COUNT_MAX,BG_UNIT_MIN,BG_UNIT_MAX,STARFIELD_SIZE_MIN,STARFIELD_SIZE_MAX,STARFIELD_OPACITY_MIN,STARFIELD_OPACITY_MAX,STARFIELD_SPEED_MIN,STARFIELD_SPEED_MAX,THEME_COLORS,FONT_FAMILIES,TEMPLATE_IDS } from "./constants";

// ─── Sanitizers ───────────────────────────────────────────────────────────────

type Sanitized<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; field?: string };

interface DigitalGuestCreate {
  name: string;
  phone: string;
  ranks?: string[];
  designId?: string;
}

/**
 * Coerce a `ranks` payload — accepts either `ranks: string[]` (new shape)
 * or legacy `rank: string` (a single-rank picker, kept so old clients in
 * the field continue to work). Returns a deduped, trimmed array capped at
 * MAX_RANK_ITEMS, or null if the input is malformed.
 */
function coerceRanks(data: Record<string, unknown>):
  | { ok: true; value: string[] | undefined }
  | { ok: false; error: string; field: string } {
  let raw: unknown;
  if (data.ranks !== undefined) raw = data.ranks;
  else if (data.rank !== undefined) raw = [data.rank];
  else return { ok: true, value: undefined };

  if (raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, error: "invalid_ranks", field: "ranks" };
  }
  const cleaned: string[] = [];
  for (const r of raw) {
    if (typeof r !== "string") continue;
    const v = r.trim();
    if (!v) continue;
    if (v.length > MAX_GUEST_RANK_LEN) {
      return { ok: false, error: "rank_too_long", field: "ranks" };
    }
    if (!cleaned.includes(v)) cleaned.push(v);
    if (cleaned.length >= MAX_RANK_ITEMS) break;
  }
  return { ok: true, value: cleaned };
}

// Israeli national subscriber number = exactly 9 digits (after dropping +972 /
// the leading 0). Returns the canonical 9-digit string, or null when invalid.
function ilNational(raw: string): string | null {
  let d = (raw || "").replace(/\D/g, "");
  if (d.startsWith("972")) d = d.slice(3);
  else if (d.startsWith("0")) d = d.slice(1);
  return d.length === 9 ? d : null;
}

function sanitizeDigitalGuestCreate(
  body: unknown
): Sanitized<DigitalGuestCreate> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }
  const data = body as Record<string, unknown>;
  const name = (data.name ?? "").toString().trim();
  const phone = (data.phone ?? "").toString().trim();
  if (!name || name.length > MAX_GUEST_NAME_LEN) {
    return { ok: false, error: "invalid_name", field: "name" };
  }
  // Require a valid +972 number — exactly 9 national digits — and store it in
  // canonical local form (0XXXXXXXXX) so duplicate checks compare cleanly.
  const nat = ilNational(phone);
  if (!phone || phone.length > MAX_GUEST_PHONE_LEN || !nat) {
    return { ok: false, error: "invalid_phone", field: "phone" };
  }
  const ranksResult = coerceRanks(data);
  if (!ranksResult.ok) return ranksResult;

  const out: DigitalGuestCreate = { name, phone: "0" + nat };
  if (ranksResult.value && ranksResult.value.length > 0) {
    out.ranks = ranksResult.value;
  }
  if (data.designId !== undefined) {
    const v = (data.designId ?? "").toString().trim();
    if (v) out.designId = v.slice(0, 200);
  }
  return { ok: true, value: out };
}

interface DigitalGuestPatch {
  name?: string;
  phone?: string;
  ranks?: string[];
  status?: string;
  note?: string;
  designId?: string;
}

function sanitizeDigitalGuestPatch(
  body: unknown
): Sanitized<DigitalGuestPatch> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }
  const data = body as Record<string, unknown>;
  const out: DigitalGuestPatch = {};

  if (data.name !== undefined) {
    const v = (data.name ?? "").toString().trim();
    if (!v || v.length > MAX_GUEST_NAME_LEN) {
      return { ok: false, error: "invalid_name", field: "name" };
    }
    out.name = v;
  }
  if (data.phone !== undefined) {
    const v = (data.phone ?? "").toString().trim();
    if (!v || v.length > MAX_GUEST_PHONE_LEN) {
      return { ok: false, error: "invalid_phone", field: "phone" };
    }
    out.phone = v;
  }
  if (data.ranks !== undefined || data.rank !== undefined) {
    const ranksResult = coerceRanks(data);
    if (!ranksResult.ok) return ranksResult;
    // PATCH semantics: `ranks` always replaces (empty array clears).
    out.ranks = ranksResult.value ?? [];
  }
  if (data.status !== undefined) {
    const v = (data.status ?? "").toString();
    if (!MAX_GUEST_STATUSES.has(v)) {
      return { ok: false, error: "invalid_status", field: "status" };
    }
    out.status = v;
  }
  if (data.note !== undefined) {
    const v = (data.note ?? "").toString();
    if (v.length > MAX_GUEST_NOTE_LEN) {
      return { ok: false, error: "note_too_long", field: "note" };
    }
    out.note = v;
  }
  if (data.designId !== undefined) {
    out.designId = (data.designId ?? "").toString().trim().slice(0, 200);
  }
  return { ok: true, value: out };
}

// A groom-authored text field may be a plain string (legacy / single-language)
// or a localized object holding an Arabic and/or Hebrew value. The guest toggles
// language on the invitation and `localize()` (client) picks the right one with
// a fallback to the other.
type Localized = string | { ar?: string; he?: string };

interface EventItem {
  icon: string;
  title: Localized;
  time: Localized;
  venue: Localized;
  address: Localized;
  mapUrl: string;
}

interface StoryItem {
  when: Localized;
  icon: string;
  title: Localized;
  body: Localized;
}

interface DetailItem {
  icon: string;
  meta: Localized;
  title: Localized;
  body: Localized;
}

interface HotelItem {
  name: Localized;
  walk: Localized;
}

interface WishItem {
  who: Localized;
  what: Localized;
}

interface MediaSettings {
  weddingDate?: number | null;
  photographerPublished?: boolean;
  guestRanks?: string[];
  brideName?: Localized;
  groomDisplayName?: Localized;
  venue?: Localized;
  venueAddress?: Localized;
  customMessage?: Localized;
  themeColor?: string;
  fontFamily?: string;
  story?: Localized;
  events?: EventItem[];
  giftIban?: string;
  giftNote?: Localized;
  musicUrl?: string;
  storyEnabled?: boolean;
  eventsEnabled?: boolean;
  countdownEnabled?: boolean;
  galleryEnabled?: boolean;
  giftEnabled?: boolean;
  musicEnabled?: boolean;
  footerDockEnabled?: boolean;
  // New luxury-design fields.
  eyebrow?: Localized;
  blessing?: Localized;
  welcome?: Localized;
  shareMessage?: Localized;
  monogram?: Localized;
  venueCity?: Localized;
  accessNote?: Localized;
  dressCode?: Localized;
  storyTimeline?: StoryItem[];
  details?: DetailItem[];
  hotels?: HotelItem[];
  wishes?: WishItem[];
  mealOptions?: Localized[];
  mediaCaptions?: Record<string, Localized>;
  detailsEnabled?: boolean;
  venueEnabled?: boolean;
  guestbookEnabled?: boolean;
  envelopeEnabled?: boolean;
  immersive3d?: boolean;
  rsvpCompanionsEnabled?: boolean;
  rsvpMealEnabled?: boolean;
  rsvpSongEnabled?: boolean;
  heroMediaEnabled?: boolean;
  title?: Localized;
  envelope?: EnvelopeSettings;
  background?: BackgroundSettings;
  starfield?: StarfieldSettings;
  templateId?: string;
}

// Per-design tuning of the celestial background starfield: one star colour +
// size multiplier + clarity/opacity multiplier. All optional; unset → theme default.
interface StarfieldSettings {
  color?: string;
  size?: number;
  opacity?: number;
  speed?: number;
}

interface EnvelopeSettings {
  style?: string;
  paper?: string;
  wax?: string;
  foil?: string;
  cardPaper?: string;
  cardInk?: string;
  stars?: boolean;
  starDensity?: number;
  starIntensity?: number;
  sealStar?: boolean;
}

// Per-design custom background. All colour keys are "#rrggbb"; the unit sliders
// (circleSize/circleOpacity/circleSoftness/imageOverlay) are 0..1; circleCount is
// an int 0..6. `image` is set ONLY by the upload route (target=background) — it is
// never accepted from client PATCH input (stripped in sanitizeBackground).
interface BackgroundImage {
  url: string;
  storagePath: string;
  kind?: string;
}
interface BackgroundSettings {
  enabled?: boolean;
  color?: string;
  gradient?: boolean;
  gradientFrom?: string;
  gradientTo?: string;
  imageOverlay?: number;
  circleCount?: number;
  circleColor?: string;
  circleSize?: number;
  circleOpacity?: number;
  circleSoftness?: number;
  circleMotion?: boolean;
  petals?: boolean;
  sparkles?: boolean;
  image?: BackgroundImage | null;
}

function sanitizeMediaSettings(body: unknown): Sanitized<MediaSettings> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }
  const data = body as Record<string, unknown>;
  const out: MediaSettings = {};

  if (data.weddingDate !== undefined) {
    if (data.weddingDate === null) {
      out.weddingDate = null;
    } else if (
      typeof data.weddingDate === "number" &&
      Number.isFinite(data.weddingDate)
    ) {
      out.weddingDate = data.weddingDate;
    } else {
      return { ok: false, error: "invalid_wedding_date", field: "weddingDate" };
    }
  }
  if (data.photographerPublished !== undefined) {
    if (typeof data.photographerPublished !== "boolean") {
      return {
        ok: false,
        error: "invalid_published_flag",
        field: "photographerPublished",
      };
    }
    out.photographerPublished = data.photographerPublished;
  }
  if (data.guestRanks !== undefined) {
    if (!Array.isArray(data.guestRanks)) {
      return { ok: false, error: "invalid_guest_ranks", field: "guestRanks" };
    }
    const cleaned: string[] = [];
    for (const r of data.guestRanks) {
      if (typeof r !== "string") continue;
      const v = r.trim();
      if (!v) continue;
      if (v.length > MAX_GUEST_RANK_LEN) {
        return { ok: false, error: "rank_too_long", field: "guestRanks" };
      }
      if (!cleaned.includes(v)) cleaned.push(v);
      if (cleaned.length >= MAX_RANK_ITEMS) break;
    }
    out.guestRanks = cleaned;
  }
  if (data.brideName !== undefined) {
    out.brideName = clampLocalized(data.brideName, MAX_BRIDE_NAME_LEN);
  }
  if (data.groomDisplayName !== undefined) {
    out.groomDisplayName = clampLocalized(data.groomDisplayName, MAX_BRIDE_NAME_LEN);
  }
  if (data.venue !== undefined) {
    out.venue = clampLocalized(data.venue, MAX_VENUE_LEN);
  }
  if (data.venueAddress !== undefined) {
    out.venueAddress = clampLocalized(data.venueAddress, MAX_VENUE_ADDR_LEN);
  }
  if (data.customMessage !== undefined) {
    out.customMessage = clampLocalized(data.customMessage, MAX_CUSTOM_MSG_LEN);
  }
  if (data.themeColor !== undefined) {
    const v = (data.themeColor ?? "").toString();
    if (!THEME_COLORS.has(v)) {
      return { ok: false, error: "invalid_theme_color", field: "themeColor" };
    }
    out.themeColor = v;
  }
  if (data.fontFamily !== undefined) {
    const v = (data.fontFamily ?? "").toString();
    if (!FONT_FAMILIES.has(v)) {
      return { ok: false, error: "invalid_font_family", field: "fontFamily" };
    }
    out.fontFamily = v;
  }
  if (data.templateId !== undefined) {
    const v = (data.templateId ?? "").toString();
    if (!TEMPLATE_IDS.has(v)) {
      return { ok: false, error: "invalid_template_id", field: "templateId" };
    }
    out.templateId = v;
  }
  if (data.story !== undefined) {
    out.story = clampLocalized(data.story, MAX_STORY_LEN);
  }
  if (data.events !== undefined) {
    if (!Array.isArray(data.events)) {
      return { ok: false, error: "invalid_events", field: "events" };
    }
    const cleaned: EventItem[] = [];
    for (const raw of data.events) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const e = raw as Record<string, unknown>;
      const item: EventItem = {
        icon: clampField(e.icon, MAX_EVENT_ICON_LEN),
        title: clampLocalized(e.title, MAX_EVENT_TITLE_LEN),
        time: clampLocalized(e.time, MAX_EVENT_TIME_LEN),
        venue: clampLocalized(e.venue, MAX_EVENT_VENUE_LEN),
        address: clampLocalized(e.address, MAX_EVENT_ADDR_LEN),
        mapUrl: clampField(e.mapUrl, MAX_MAP_URL_LEN),
      };
      // Drop entirely-empty rows so the editor's blank template doesn't persist.
      if (item.title || item.time || item.venue || item.address) {
        cleaned.push(item);
      }
      if (cleaned.length >= MAX_EVENTS) break;
    }
    out.events = cleaned;
  }
  if (data.giftIban !== undefined) {
    const v = (data.giftIban ?? "").toString().trim();
    if (v.length > MAX_GIFT_IBAN_LEN) {
      return { ok: false, error: "gift_iban_too_long", field: "giftIban" };
    }
    out.giftIban = v;
  }
  if (data.giftNote !== undefined) {
    out.giftNote = clampLocalized(data.giftNote, MAX_GIFT_NOTE_LEN);
  }
  if (data.musicUrl !== undefined) {
    const v = (data.musicUrl ?? "").toString().trim();
    if (v.length > MAX_MUSIC_URL_LEN) {
      return { ok: false, error: "music_url_too_long", field: "musicUrl" };
    }
    if (v.length > 0 && !/^https?:\/\//.test(v)) {
      return { ok: false, error: "music_url_invalid", field: "musicUrl" };
    }
    out.musicUrl = v;
  }
  // ── New luxury-design scalar text fields (all localized) ─────────────────
  const localizedScalars: [keyof MediaSettings, number][] = [
    ["eyebrow", MAX_EYEBROW_LEN],
    ["blessing", MAX_BLESSING_LEN],
    ["welcome", MAX_WELCOME_LEN],
    ["shareMessage", MAX_SHARE_MSG_LEN],
    ["monogram", MAX_MONOGRAM_LEN],
    ["venueCity", MAX_VENUE_CITY_LEN],
    ["accessNote", MAX_ACCESS_NOTE_LEN],
    ["dressCode", MAX_DRESS_CODE_LEN],
    ["title", MAX_DESIGN_TITLE_LEN], // groom-facing design label (NOT a DESIGN_FIELD → no demotion)
  ];
  for (const [key, max] of localizedScalars) {
    if (data[key] !== undefined) {
      (out as Record<string, Localized>)[key as string] = clampLocalized(data[key], max);
    }
  }

  // ── Story timeline ───────────────────────────────────────────────────────
  if (data.storyTimeline !== undefined) {
    if (!Array.isArray(data.storyTimeline)) {
      return { ok: false, error: "invalid_story_timeline", field: "storyTimeline" };
    }
    const cleaned: StoryItem[] = [];
    for (const raw of data.storyTimeline) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const e = raw as Record<string, unknown>;
      const item: StoryItem = {
        when: clampLocalized(e.when, MAX_STORY_WHEN_LEN),
        icon: clampField(e.icon, MAX_EVENT_ICON_LEN),
        title: clampLocalized(e.title, MAX_STORY_TITLE_LEN),
        body: clampLocalized(e.body, MAX_STORY_BODY_LEN),
      };
      if (item.when || item.title || item.body) cleaned.push(item);
      if (cleaned.length >= MAX_STORY_ITEMS) break;
    }
    out.storyTimeline = cleaned;
  }

  // ── Detail cards ─────────────────────────────────────────────────────────
  if (data.details !== undefined) {
    if (!Array.isArray(data.details)) {
      return { ok: false, error: "invalid_details", field: "details" };
    }
    const cleaned: DetailItem[] = [];
    for (const raw of data.details) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const e = raw as Record<string, unknown>;
      const item: DetailItem = {
        icon: clampField(e.icon, MAX_EVENT_ICON_LEN),
        meta: clampLocalized(e.meta, MAX_DETAIL_META_LEN),
        title: clampLocalized(e.title, MAX_DETAIL_TITLE_LEN),
        body: clampLocalized(e.body, MAX_DETAIL_BODY_LEN),
      };
      if (item.meta || item.title || item.body) cleaned.push(item);
      if (cleaned.length >= MAX_DETAIL_ITEMS) break;
    }
    out.details = cleaned;
  }

  // ── Nearby hotels ────────────────────────────────────────────────────────
  if (data.hotels !== undefined) {
    if (!Array.isArray(data.hotels)) {
      return { ok: false, error: "invalid_hotels", field: "hotels" };
    }
    const cleaned: HotelItem[] = [];
    for (const raw of data.hotels) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const e = raw as Record<string, unknown>;
      const item: HotelItem = {
        name: clampLocalized(e.name, MAX_HOTEL_NAME_LEN),
        walk: clampLocalized(e.walk, MAX_HOTEL_WALK_LEN),
      };
      if (item.name) cleaned.push(item);
      if (cleaned.length >= MAX_HOTEL_ITEMS) break;
    }
    out.hotels = cleaned;
  }

  // ── Guestbook wishes (groom-curated) ─────────────────────────────────────
  if (data.wishes !== undefined) {
    if (!Array.isArray(data.wishes)) {
      return { ok: false, error: "invalid_wishes", field: "wishes" };
    }
    const cleaned: WishItem[] = [];
    for (const raw of data.wishes) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const e = raw as Record<string, unknown>;
      const item: WishItem = {
        who: clampLocalized(e.who, MAX_WISH_WHO_LEN),
        what: clampLocalized(e.what, MAX_WISH_WHAT_LEN),
      };
      if (item.what) cleaned.push(item);
      if (cleaned.length >= MAX_WISH_ITEMS) break;
    }
    out.wishes = cleaned;
  }

  // ── RSVP meal options ────────────────────────────────────────────────────
  if (data.mealOptions !== undefined) {
    if (!Array.isArray(data.mealOptions)) {
      return { ok: false, error: "invalid_meal_options", field: "mealOptions" };
    }
    const cleaned: Localized[] = [];
    for (const r of data.mealOptions) {
      const v = clampLocalized(r, MAX_MEAL_OPTION_LEN);
      if (!v) continue;
      cleaned.push(v);
      if (cleaned.length >= MAX_MEAL_OPTIONS) break;
    }
    out.mealOptions = cleaned;
  }

  // ── Per-photo captions keyed by storagePath ──────────────────────────────
  if (data.mediaCaptions !== undefined) {
    if (
      !data.mediaCaptions ||
      typeof data.mediaCaptions !== "object" ||
      Array.isArray(data.mediaCaptions)
    ) {
      return { ok: false, error: "invalid_media_captions", field: "mediaCaptions" };
    }
    const cleaned: Record<string, Localized> = {};
    let count = 0;
    for (const [k, val] of Object.entries(data.mediaCaptions as Record<string, unknown>)) {
      if (count >= MAX_CAPTION_ENTRIES) break;
      const cap = clampLocalized(val, MAX_CAPTION_LEN);
      if (cap) {
        cleaned[k.slice(0, 200)] = cap;
        count++;
      }
    }
    out.mediaCaptions = cleaned;
  }

  // ── 3D envelope colour/star overrides ────────────────────────────────────
  if (data.envelope !== undefined) {
    const env = sanitizeEnvelope(data.envelope);
    if (!env.ok) return env;
    out.envelope = env.value;
  }

  // ── Custom background (fill / circles / image overlay) ────────────────────
  if (data.background !== undefined) {
    const bg = sanitizeBackground(data.background);
    if (!bg.ok) return bg;
    out.background = bg.value;
  }

  // ── Background starfield tuning (colour / size / clarity) ─────────────────
  if (data.starfield !== undefined) {
    const sf = sanitizeStarfield(data.starfield);
    if (!sf.ok) return sf;
    out.starfield = sf.value;
  }

  const boolKeys: (keyof MediaSettings)[] = [
    "storyEnabled",
    "eventsEnabled",
    "countdownEnabled",
    "galleryEnabled",
    "giftEnabled",
    "musicEnabled",
    "footerDockEnabled",
    "detailsEnabled",
    "venueEnabled",
    "guestbookEnabled",
    "envelopeEnabled",
    "rsvpCompanionsEnabled",
    "rsvpMealEnabled",
    "rsvpSongEnabled",
    "heroMediaEnabled",
    "immersive3d",
  ];
  for (const key of boolKeys) {
    if (data[key] !== undefined) {
      if (typeof data[key] !== "boolean") {
        return { ok: false, error: "invalid_toggle", field: key as string };
      }
      (out as Record<string, unknown>)[key] = data[key];
    }
  }
  return { ok: true, value: out };
}

function clampRange(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Sanitize the 3D-envelope override object: validate hex colours, clamp the star
 * sliders (clamp, never reject), and drop empty/absent overrides so partial
 * overrides persist cleanly with set({merge:true}). `null` / `{}` ⇒ reset all
 * overrides back to the theme/baseline defaults.
 */
function sanitizeEnvelope(v: unknown): Sanitized<EnvelopeSettings> {
  if (v === null) return { ok: true, value: {} };
  if (typeof v !== "object" || Array.isArray(v)) {
    return { ok: false, error: "invalid_envelope", field: "envelope" };
  }
  const o = v as Record<string, unknown>;
  const out: EnvelopeSettings = {};
  // Envelope opening STYLE — a short slug that selects the 3D open animation/look
  // ("classic" today; the groom picks it in the editor). Validated as a safe slug
  // rather than a fixed enum, so new styles can ship from the client without a
  // backend redeploy; unknown/empty → unset (falls back to the classic default).
  if (o.style !== undefined && o.style !== "") {
    if (typeof o.style !== "string" || !/^[a-z0-9_-]{1,32}$/.test(o.style)) {
      return { ok: false, error: "invalid_envelope_style", field: "envelope.style" };
    }
    out.style = o.style;
  }
  for (const key of ENVELOPE_COLOR_KEYS) {
    const raw = o[key];
    if (raw === undefined || raw === "") continue; // unset → fall back to default
    if (typeof raw !== "string" || !HEX_COLOR_RE.test(raw)) {
      return { ok: false, error: "invalid_envelope_color", field: `envelope.${key}` };
    }
    out[key] = raw.toLowerCase();
  }
  if (o.stars !== undefined) {
    if (typeof o.stars !== "boolean") {
      return { ok: false, error: "invalid_toggle", field: "envelope.stars" };
    }
    out.stars = o.stars;
  }
  if (o.sealStar !== undefined) {
    if (typeof o.sealStar !== "boolean") {
      return { ok: false, error: "invalid_toggle", field: "envelope.sealStar" };
    }
    out.sealStar = o.sealStar;
  }
  if (typeof o.starDensity === "number" && Number.isFinite(o.starDensity)) {
    out.starDensity = Math.round(clampRange(o.starDensity, STAR_DENSITY_MIN, STAR_DENSITY_MAX));
  }
  if (typeof o.starIntensity === "number" && Number.isFinite(o.starIntensity)) {
    out.starIntensity = clampRange(o.starIntensity, STAR_INTENSITY_MIN, STAR_INTENSITY_MAX);
  }
  return { ok: true, value: out };
}

/**
 * Sanitize the per-design custom-background object: validate hex colours, clamp
 * the numeric sliders (clamp, never reject), coerce booleans, and DROP empty/absent
 * keys so partial overrides persist cleanly with set({merge:true}). `image` is
 * SERVER-managed (written only by the upload route) and is always stripped from
 * client input. `null` / `{}` ⇒ reset all background customization to defaults.
 */
function sanitizeBackground(v: unknown): Sanitized<BackgroundSettings> {
  if (v === null) return { ok: true, value: {} };
  if (typeof v !== "object" || Array.isArray(v)) {
    return { ok: false, error: "invalid_background", field: "background" };
  }
  const o = v as Record<string, unknown>;
  const out: BackgroundSettings = {};
  for (const key of BACKGROUND_COLOR_KEYS) {
    const raw = o[key];
    if (raw === undefined || raw === "") continue; // unset → fall back to default
    if (typeof raw !== "string" || !HEX_COLOR_RE.test(raw)) {
      return { ok: false, error: "invalid_background_color", field: `background.${key}` };
    }
    out[key] = raw.toLowerCase();
  }
  for (const key of BACKGROUND_BOOL_KEYS) {
    const raw = o[key];
    if (raw === undefined) continue;
    if (typeof raw !== "boolean") {
      return { ok: false, error: "invalid_toggle", field: `background.${key}` };
    }
    out[key] = raw;
  }
  if (typeof o.circleCount === "number" && Number.isFinite(o.circleCount)) {
    out.circleCount = Math.round(clampRange(o.circleCount, BG_CIRCLE_COUNT_MIN, BG_CIRCLE_COUNT_MAX));
  }
  for (const key of ["circleSize", "circleOpacity", "circleSoftness", "imageOverlay"] as const) {
    const raw = o[key];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      out[key] = clampRange(raw, BG_UNIT_MIN, BG_UNIT_MAX);
    }
  }
  // `image` is intentionally NOT read from client input — the upload/remove routes
  // own it server-side. Anything the client sends here is ignored.
  return { ok: true, value: out };
}

/**
 * Sanitize the background-starfield override: validate the star colour as hex,
 * clamp size + opacity (clamp, never reject), and drop empty/absent keys so partial
 * overrides persist cleanly with set({merge:true}). `null` / `{}` ⇒ reset to defaults.
 */
function sanitizeStarfield(v: unknown): Sanitized<StarfieldSettings> {
  if (v === null) return { ok: true, value: {} };
  if (typeof v !== "object" || Array.isArray(v)) {
    return { ok: false, error: "invalid_starfield", field: "starfield" };
  }
  const o = v as Record<string, unknown>;
  const out: StarfieldSettings = {};
  if (o.color !== undefined && o.color !== "") {
    if (typeof o.color !== "string" || !HEX_COLOR_RE.test(o.color)) {
      return { ok: false, error: "invalid_starfield_color", field: "starfield.color" };
    }
    out.color = o.color.toLowerCase();
  }
  if (typeof o.size === "number" && Number.isFinite(o.size)) {
    out.size = clampRange(o.size, STARFIELD_SIZE_MIN, STARFIELD_SIZE_MAX);
  }
  if (typeof o.opacity === "number" && Number.isFinite(o.opacity)) {
    out.opacity = clampRange(o.opacity, STARFIELD_OPACITY_MIN, STARFIELD_OPACITY_MAX);
  }
  if (typeof o.speed === "number" && Number.isFinite(o.speed)) {
    out.speed = clampRange(o.speed, STARFIELD_SPEED_MIN, STARFIELD_SPEED_MAX);
  }
  return { ok: true, value: out };
}

/** Trim a possibly-non-string field to a max length. */
function clampField(v: unknown, max: number): string {
  return (typeof v === "string" ? v.trim() : "").slice(0, max);
}

/**
 * Sanitize a localized text field. Accepts a plain string (legacy / single
 * language) or a `{ ar, he }` object; trims + length-caps each present language
 * and drops empty ones. Returns "" when nothing remains — so the "drop empty
 * row" truthiness checks in sanitizeMediaSettings keep working unchanged.
 */
function clampLocalized(v: unknown, max: number): Localized {
  if (typeof v === "string") return v.trim().slice(0, max);
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const out: { ar?: string; he?: string } = {};
    if (typeof o.ar === "string" && o.ar.trim()) out.ar = o.ar.trim().slice(0, max);
    if (typeof o.he === "string" && o.he.trim()) out.he = o.he.trim().slice(0, max);
    return out.ar || out.he ? out : "";
  }
  return "";
}

export { coerceRanks, ilNational, sanitizeDigitalGuestCreate, sanitizeDigitalGuestPatch, sanitizeMediaSettings, clampField, clampLocalized };
