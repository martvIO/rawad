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
import { DigitalInvitationView } from "../DigitalInvitationView.jsx";
import { TEMPLATES, DEFAULT_TEMPLATE_ID } from "@dawa/core/data/digitalTemplates.js";

export const TEMPLATE_REGISTRY = {
  classic: {
    ...TEMPLATES.classic,
    Component: DigitalInvitationView,
  },
  // Additional templates register their Component here as they're built —
  // each entry pairs one shared/digitalTemplates.js metadata row with the
  // template's own top-level view component.
};

export const TEMPLATE_IDS = Object.keys(TEMPLATE_REGISTRY);

export function getTemplate(templateId) {
  return TEMPLATE_REGISTRY[templateId] || TEMPLATE_REGISTRY[DEFAULT_TEMPLATE_ID];
}
