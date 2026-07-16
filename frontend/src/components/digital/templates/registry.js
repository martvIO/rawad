// Frontend structural TEMPLATE registry — maps a `templateId` to the actual
// React component tree that renders it. This is the piece
// shared/src/data/digitalTemplates.js can't carry (React component refs and
// bundled thumbnail assets can't cross into the native bundle); that file
// remains the source of truth for the id/label/defaults list this registry
// merges in.
//
// `getTemplate()` falls back to "classic" for any unrecognized/undefined key —
// this is the single point that guarantees an already-sent link (whose
// designSnapshot locked in a templateId at mint time) never renders blank,
// even for a legacy design created before this field existed, or a template
// later renamed/removed from the registry.
import { lazy } from "react";
import { DigitalInvitationView } from "../DigitalInvitationView.jsx";
import { TEMPLATES, DEFAULT_TEMPLATE_ID } from "@dawa/core/data/digitalTemplates.js";
import { BUNDLED_THUMBS } from "./thumbs.js";

// Bespoke templates: module-scope lazy() (see the note below on why not inline).
const DestinationLoveView = lazy(() => import("./destination-love/index.js"));
const DolceVitaView = lazy(() => import("./dolce-vita/index.js"));
const SacredGardenView = lazy(() => import("./sacred-garden/index.js"));

// `classic` is imported EAGERLY (not lazy): it is the fallback for every
// unknown/legacy id, so it must be able to render synchronously and must never
// itself suspend. Bespoke templates are heavier (bespoke sections + a lazy
// three.js effects scene), so each registers a `lazy()` Component — the
// <Suspense> boundary in TemplateRenderer.jsx covers the chunk fetch. Create
// the `lazy()` at MODULE SCOPE (as below), never inside getTemplate(): the
// editor preview re-renders TemplateRenderer on every keystroke, and a lazy
// component recreated per render would re-suspend and flash on each edit.
//
//   import { lazy } from "react";
//   const DestinationLoveView = lazy(() => import("./destination-love/index.js"));
//   // register the bundled thumbnail in ./thumbs.js (BUNDLED_THUMBS), not here
//   ...
//   "destination-love": {
//     ...TEMPLATES["destination-love"],
//     Component: DestinationLoveView,
//     thumb: BUNDLED_THUMBS["destination-love"],
//   },
export const TEMPLATE_REGISTRY = {
  classic: {
    ...TEMPLATES.classic,
    Component: DigitalInvitationView,
  },
  "destination-love": {
    ...TEMPLATES["destination-love"],
    Component: DestinationLoveView,
    thumb: BUNDLED_THUMBS["destination-love"],
  },
  "dolce-vita": {
    ...TEMPLATES["dolce-vita"],
    Component: DolceVitaView,
    thumb: BUNDLED_THUMBS["dolce-vita"],
  },
  "sacred-garden": {
    ...TEMPLATES["sacred-garden"],
    Component: SacredGardenView,
    thumb: BUNDLED_THUMBS["sacred-garden"],
  },
  // Additional templates register their lazy Component + thumb here as they're
  // built — each entry pairs one shared/digitalTemplates.js metadata row with
  // the template's own top-level view component.
};

export const TEMPLATE_IDS = Object.keys(TEMPLATE_REGISTRY);

export function getTemplate(templateId) {
  return TEMPLATE_REGISTRY[templateId] || TEMPLATE_REGISTRY[DEFAULT_TEMPLATE_ID];
}

// Bundled preview thumbnail for the editor's template picker (frontend-only —
// the shared metadata carries a plain slug, since Vite asset imports can't
// cross into the native bundle). Returns null for templates without one.
export function getTemplateThumb(templateId) {
  return TEMPLATE_REGISTRY[templateId]?.thumb || null;
}
