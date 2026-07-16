// Digital-invitation TEMPLATE registry metadata — the single source of truth
// for which templates exist, shared by the web editor (DigitalDesignEditor.jsx),
// the native app editor (app design.jsx), and the frontend-only structural
// registry (frontend/src/components/digital/templates/registry.js, which adds
// the React component references this file can't carry). Mirrors the shape of
// digitalThemes.js. Keeping one list here prevents the two editors from drifting.
//
// A template's own component tree lives entirely in the frontend bundle; this
// file only carries what a picker UI needs to render (id/label/thumbnail) plus
// the presentation defaults applied when a groom picks a template (§ groom
// editor "mid-edit switch" semantics — content is never touched, only these
// presentation knobs are reset to the template's defaults).
//
// The backend allowlist (`TEMPLATE_IDS` in
// backend/functions/src/api/routes/digital/constants.ts) is the AUTHORITATIVE
// enum for persistence — this list must be kept in sync with it by hand (a unit
// test asserts the two stay set-equal); this file is not imported by the backend
// since it lives in `shared/` alongside other frontend/native-only data.

export const DEFAULT_TEMPLATE_ID = "classic";

// Two optional fields distinguish the newer BESPOKE templates from `classic`:
//
//   bespoke: true
//     Marks a template whose component tree is a standalone design (its own
//     hero, opening intro, ornaments, effects) rather than the shared
//     section stack. The web editor uses this flag to hide the classic-only
//     controls (3D envelope, background starfield, custom 2D background) that
//     a bespoke tree never mounts, and to interpret `showEnvelope` as the
//     template's own sealed-tap intro instead of the 3D envelope. A bespoke
//     template ALWAYS defaults `envelopeEnabled:false` (its intro is the
//     `showEnvelope` prop, not the classic envelope toggle).
//
//   themes: [<digitalThemes key>, ...]
//     An ordered CURATED palette list (native palette first — and
//     `defaults.themeColor` must equal `themes[0]`). The editor's theme picker
//     shows only these keys for this template, instead of the full global
//     list, so a bespoke design is only ever recolored into palettes we
//     actually designed + tested for it. Keys (not embedded palette objects) —
//     digitalThemes.js stays the single palette store and the backend
//     THEME_COLORS enum keeps mirroring its keys. Classic omits `themes`
//     entirely → the picker falls back to the full list (unchanged behavior).
export const TEMPLATES = {
  classic: {
    id: "classic",
    label_ar: "الكلاسيكي",
    label_he: "הקלאסי",
    thumbnail: "classic",
    defaults: {
      themeColor: "gold",
      fontFamily: "amiri",
      envelopeEnabled: true,
      envelopeStyle: "classic",
    },
  },
  // Destination Love (رحلة الحب / מסע האהבה) — a travel / boarding-pass theme:
  // a sealed boarding pass that a paper plane flies in to "stamp" open, then a
  // journey through the wedding as flight legs on a dashed route. Inspired-by
  // reinterpretation of webgency's "Destination Love"; no source text/photos.
  "destination-love": {
    id: "destination-love",
    label_ar: "رحلة الحب",
    label_he: "מסע האהבה",
    thumbnail: "destination-love",
    bespoke: true,
    themes: ["voyage", "voyageAzure", "voyageSand"],
    defaults: {
      themeColor: "voyage",
      fontFamily: "aref",
      envelopeEnabled: false,
      envelopeStyle: "classic",
    },
  },
  // Dolce Vita (الحياة الحلوة / החיים המתוקים) — Italian-riviera stationery: a
  // wax-sealed ivory letter that opens, a scratch-to-reveal wedding date, and a
  // schedule told as a seaside day. Inspired-by reinterpretation of webgency's
  // "Dolce Vita"; no source text/photos. Accent = the in-brand blue family.
  "dolce-vita": {
    id: "dolce-vita",
    label_ar: "الحياة الحلوة",
    label_he: "החיים המתוקים",
    thumbnail: "dolce-vita",
    bespoke: true,
    themes: ["dolceVita", "dolceVitaNotte", "dolceVitaLimone"],
    defaults: {
      themeColor: "dolceVita",
      fontFamily: "messiri",
      envelopeEnabled: false,
      envelopeStyle: "classic",
    },
  },

  // The Sacred Garden (حديقة الفرح / גן השמחה) — a walled garden: an embossed
  // floral envelope closed with a monogrammed wax seal, torn-paper section edges,
  // drifting petals and botanical garlands. Inspired-by reinterpretation of
  // webgency's "The Sacred Garden"; no source text/photos. Accent = in-brand green.
  "sacred-garden": {
    id: "sacred-garden",
    label_ar: "حديقة الفرح",
    label_he: "גן השמחה",
    thumbnail: "sacred-garden",
    bespoke: true,
    themes: ["sacredGarden", "sacredGardenNight", "sacredGardenRose"],
    defaults: {
      themeColor: "sacredGarden",
      fontFamily: "reem",
      envelopeEnabled: false,
      envelopeStyle: "classic",
    },
  },

  // Blossom & Oud (زهر وعود / פריחה ועוד) — Arabian floral: content framed by a
  // mihrab arch, an arabesque-embossed envelope with a gold seal, blush + gold.
  // Inspired-by reinterpretation of webgency's "Blossom & Oud"; no source
  // text/photos. Accent = the in-brand rose family.
  "blossom-oud": {
    id: "blossom-oud",
    label_ar: "زهر وعود",
    label_he: "פריחה ועוד",
    thumbnail: "blossom-oud",
    bespoke: true,
    themes: ["blossomOud", "blossomOudNight", "blossomOudGold"],
    defaults: {
      themeColor: "blossomOud",
      fontFamily: "scheherazade",
      envelopeEnabled: false,
      envelopeStyle: "classic",
    },
  },

  // Additional templates land here one at a time as they're built — each
  // bespoke entry adds `bespoke:true` + a curated `themes` list, and its
  // `defaults` (themeColor === themes[0], fontFamily, envelopeEnabled:false,
  // envelopeStyle), never touching another template's entry.
};

export const DIGITAL_TEMPLATE_KEYS = Object.keys(TEMPLATES);

export function getDigitalTemplate(id) {
  return TEMPLATES[id] || TEMPLATES[DEFAULT_TEMPLATE_ID];
}

// The curated palette keys a template's theme picker should offer, or `null`
// when the template opts out of curation (classic → the caller shows the full
// global list). Never returns an empty array — a template that declared
// `themes: []` by mistake also falls back to the full list.
export function getTemplateThemeKeys(id) {
  const t = TEMPLATES[id];
  return Array.isArray(t?.themes) && t.themes.length ? t.themes : null;
}

// Opening-envelope STYLE options (the "شكل فتح المكتوب" picker) — relocated
// here (was previously trapped inline in the web `DigitalDesignEditor.jsx`) so
// both the web and native editors read the identical list instead of a
// hand-copied duplicate. Persists as `envelope.style`, validated backend-side
// as a free safe-slug (`sanitize.ts`), so a new style key needs no backend
// redeploy — only a new entry here + its look in the 3D engine
// (frontend/src/components/digital/celestial/envelopeStyles/registry.js).
export const ENVELOPE_STYLES = [
  { key: "classic", icon: "✉️", label_ar: "المكتوب العادي", label_he: "המעטפה הרגילה" },
];
