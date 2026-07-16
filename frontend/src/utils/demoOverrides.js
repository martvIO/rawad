// Pure demo-link override layering — extracted from DigitalInvitationPage.jsx so
// it is independently unit-testable and shared by the demo route. Given a base
// design (the admin-published `appConfig/demoDesign` snapshot, or the built-in
// fallback) and the URL search params, it returns a NEW design doc with the
// personalized overrides applied. The guest NAME is handled separately (it lives
// on tokenRec, not the design), so ?name is intentionally ignored here.
//
// Order matters:
//   1. ?template — switch which template renders the shared demo content. When a
//      valid, different template is chosen we ALSO reset the presentation knobs
//      (theme/font/envelope) to that template's defaults, mirroring the groom
//      editor's mid-edit switch (onPickTemplate). This is required, not
//      cosmetic: a bespoke template only renders its curated palettes, and the
//      demo doc may be saved with a classic (non-curated) theme — without the
//      reset a bespoke demo would try to paint a palette it never designed for.
//   2. ?theme — applied AFTER the template reset, and only when valid for the
//      EFFECTIVE template (curated list honored; classic accepts any global key).
//   3. ?font — applied only when it's a known font key.
//   4. ?date — parsed to an epoch when present.
import {
  DIGITAL_TEMPLATE_KEYS,
  getDigitalTemplate,
  getTemplateThemeKeys,
} from "@dawa/core/data/digitalTemplates.js";
import { DIGITAL_THEME_KEYS, DIGITAL_FONT_KEYS } from "../styles/digitalThemes.js";

// Resolve the effective templateId from the base doc + ?template override.
// Unknown ids are ignored (the registry's classic fallback still guards render).
export function resolveDemoTemplateId(base, search) {
  const raw = search?.get?.("template");
  if (raw && DIGITAL_TEMPLATE_KEYS.includes(raw)) return raw;
  return base?.templateId || undefined;
}

export function applyDemoOverrides(base, search) {
  const src = base || {};
  const themeParam = search?.get?.("theme");
  const fontParam = search?.get?.("font");
  const dateParam = search?.get?.("date");

  const requested = search?.get?.("template");
  const switching = requested && DIGITAL_TEMPLATE_KEYS.includes(requested) && requested !== src.templateId;

  let out = { ...src };

  if (switching) {
    const tpl = getDigitalTemplate(requested);
    const d = tpl.defaults || {};
    out.templateId = requested;
    out.themeColor = d.themeColor || src.themeColor;
    out.fontFamily = d.fontFamily || src.fontFamily;
    out.envelopeEnabled = d.envelopeEnabled;
    out.envelope = { ...(src.envelope || {}), style: d.envelopeStyle || "classic" };
  }

  const effectiveTemplateId = out.templateId;
  const curated = getTemplateThemeKeys(effectiveTemplateId); // null → any global key allowed

  // ?theme — valid global key AND (when the template curates) in the curated set.
  if (themeParam && DIGITAL_THEME_KEYS.includes(themeParam) && (!curated || curated.includes(themeParam))) {
    out.themeColor = themeParam;
  }

  // ?font — valid font key only.
  if (fontParam && DIGITAL_FONT_KEYS.includes(fontParam)) {
    out.fontFamily = fontParam;
  }

  // ?date — parse to epoch; ignore an unparseable value.
  if (dateParam) {
    const t = new Date(dateParam).getTime();
    if (!Number.isNaN(t)) out.weddingDate = t;
  }

  return out;
}
