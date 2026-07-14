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
  // Additional templates land here one at a time as they're built — each
  // entry contributes its own `defaults` (themeColor/fontFamily/envelopeEnabled/
  // envelopeStyle), never touching another template's entry.
};

export const DIGITAL_TEMPLATE_KEYS = Object.keys(TEMPLATES);

export function getDigitalTemplate(id) {
  return TEMPLATES[id] || TEMPLATES[DEFAULT_TEMPLATE_ID];
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
