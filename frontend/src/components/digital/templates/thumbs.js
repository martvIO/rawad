// Bundled template preview thumbnails, split out of registry.js so surfaces that
// only need a picture (the public gallery page, the landing-page template strip)
// can import thumbnails WITHOUT pulling in registry.js — which eagerly imports
// the full classic <DigitalInvitationView/> tree and would bloat those chunks.
//
// This is only the BUILD-TIME fallback art. An admin-uploaded cover (stored in
// Firebase Storage, pointed to by appConfig/templateAssets) takes precedence at
// runtime via the useTemplateAssets resolver — this file is the last rung of the
// uploaded → bundled → label-only chain.
import destinationLoveThumb from "../../../assets/templates/destination-love.jpg";
import dolceVitaThumb from "../../../assets/templates/dolce-vita.jpg";
import sacredGardenThumb from "../../../assets/templates/sacred-garden.jpg";
import blossomOudThumb from "../../../assets/templates/blossom-oud.jpg";
import gildedOrchardThumb from "../../../assets/templates/gilded-orchard.jpg";

export const BUNDLED_THUMBS = {
  "destination-love": destinationLoveThumb,
  "dolce-vita": dolceVitaThumb,
  "sacred-garden": sacredGardenThumb,
  "blossom-oud": blossomOudThumb,
  "gilded-orchard": gildedOrchardThumb,
  // classic has no bundled thumbnail (picker/gallery render a label-only card).
};

// The bundled thumbnail asset URL for a template, or null when none is bundled.
export function getTemplateThumb(templateId) {
  return BUNDLED_THUMBS[templateId] || null;
}
