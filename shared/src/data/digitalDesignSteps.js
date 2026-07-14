// Guided-wizard step model for the digital-invitation design editor — the single
// source of truth for HOW the ~20 design sections are grouped into a small number
// of "cards that go back and forth", shared by the web editor
// (DigitalDesignEditor.jsx) and the native app editor (app design.jsx) so the two
// wizards can't drift. This is a PRESENTATION grouping only — the underlying
// fields/persistence stay defined by digitalDesignSchema.js; the editors keep
// autosaving per field on blur regardless of which step is showing.
//
// Each step lists the field KEYS it owns so a platform that renders one flat list
// of scalars/arrays/toggles (the native app) can filter that list by step. The web
// editor already renders discrete <Section> blocks, so it maps each section to a
// step id instead — either way the grouping below is authoritative.

// Ordered step ids. `review` is the final preview + submit card.
export const WIZARD_STEP_IDS = [
  "essentials",
  "venue",
  "story",
  "rsvp",
  "style",
  "advanced",
  "review",
];

// Per-step field membership + inline-localized card title/subtitle. Titles are
// inline { ar, he } (matching the editor's existing tt() style) so neither editor
// has to couple to the i18n registry for wizard chrome.
export const WIZARD_STEPS = [
  {
    id: "essentials",
    icon: "💛",
    titleAr: "الأساسيات", titleHe: "היסודות",
    subtitleAr: "الأسماء، التاريخ، وصورة", subtitleHe: "שמות, תאריך ותמונה",
    // `title` is the groom-only internal design label. The web editor renders it as
    // separate always-visible chrome (and ignores these scalar lists), but the flat-
    // list native editor filters by these, so it's grouped into essentials there.
    scalars: ["title", "groomDisplayName", "brideName", "monogram", "eyebrow", "blessing", "welcome"],
    arrays: [],
    toggles: ["heroMediaEnabled"],
    extras: ["weddingDate", "hero"],
    nested: [],
  },
  {
    id: "venue",
    icon: "📍",
    titleAr: "المكان والتفاصيل", titleHe: "מקום ופרטים",
    subtitleAr: "القاعة، العنوان، تفاصيل اليوم", subtitleHe: "אולם, כתובת ופרטי היום",
    scalars: ["venue", "venueCity", "venueAddress", "accessNote", "dressCode"],
    arrays: ["hotels", "details"],
    toggles: ["venueEnabled", "detailsEnabled", "countdownEnabled"],
    extras: [],
    nested: [],
  },
  {
    id: "story",
    icon: "📖",
    titleAr: "قصتكم والصور", titleHe: "הסיפור והתמונות",
    subtitleAr: "الخط الزمني وألبوم الصور", subtitleHe: "ציר הזמן ואלבום התמונות",
    scalars: [],
    arrays: ["storyTimeline"],
    toggles: ["storyEnabled", "galleryEnabled"],
    extras: ["gallery"],
    nested: [],
  },
  {
    id: "rsvp",
    icon: "✉️",
    titleAr: "الحضور والإضافات", titleHe: "אישור הגעה ותוספות",
    subtitleAr: "تأكيد الحضور، التهاني، الهدية، الموسيقى", subtitleHe: "אישור הגעה, ברכות, מתנה, מוזיקה",
    scalars: ["giftNote", "giftIban", "musicUrl"],
    arrays: ["mealOptions", "wishes"],
    toggles: ["rsvpCompanionsEnabled", "rsvpMealEnabled", "rsvpSongEnabled", "giftEnabled", "musicEnabled", "guestbookEnabled"],
    extras: ["shareMessage"],
    nested: [],
  },
  {
    id: "style",
    icon: "🎨",
    titleAr: "المظهر", titleHe: "המראה",
    subtitleAr: "لون التصميم والخط", subtitleHe: "צבע העיצוב והגופן",
    scalars: [],
    arrays: [],
    toggles: [],
    extras: ["template", "theme", "font"],
    nested: [],
  },
  {
    id: "advanced",
    icon: "🎛",
    advanced: true,
    titleAr: "لمسات متقدمة (اختياري)", titleHe: "כוונון מתקדם (רשות)",
    subtitleAr: "المظروف، نجوم الخلفية، الخلفية المخصّصة", subtitleHe: "מעטפה, כוכבי רקע, רקע מותאם",
    scalars: [],
    arrays: [],
    toggles: ["envelopeEnabled", "immersive3d", "footerDockEnabled"],
    extras: [],
    nested: ["envelope", "starfield", "background"],
  },
  {
    id: "review",
    icon: "✅",
    review: true,
    titleAr: "المراجعة والإرسال", titleHe: "סקירה ושליחה",
    subtitleAr: "عاين دعوتك ثم أرسلها للاعتماد", subtitleHe: "צפו בהזמנה ושלחו לאישור",
    scalars: [],
    arrays: [],
    toggles: [],
    extras: [],
    nested: [],
  },
];

const STEP_BY_ID = WIZARD_STEPS.reduce((acc, s) => { acc[s.id] = s; return acc; }, {});

export const getWizardStep = (id) => STEP_BY_ID[id] || null;

// Localized title/subtitle helpers (lang = "ar" | "he").
export const stepTitle = (id, lang) => {
  const s = STEP_BY_ID[id];
  if (!s) return "";
  return lang === "he" ? s.titleHe : s.titleAr;
};
export const stepSubtitle = (id, lang) => {
  const s = STEP_BY_ID[id];
  if (!s) return "";
  return lang === "he" ? s.subtitleHe : s.subtitleAr;
};

// Which step a given scalar / array / toggle key belongs to (for the flat-list
// native editor). Returns the step id, or null if the key isn't wizard-grouped.
export const stepForScalarKey = (key) => (WIZARD_STEPS.find((s) => s.scalars.includes(key)) || {}).id || null;
export const stepForArrayKey = (key) => (WIZARD_STEPS.find((s) => s.arrays.includes(key)) || {}).id || null;
export const stepForToggleKey = (key) => (WIZARD_STEPS.find((s) => s.toggles.includes(key)) || {}).id || null;
