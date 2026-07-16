// Resolves a template's preview cover through the fallback chain:
//
//   admin-uploaded (Storage, via appConfig/templateAssets)
//     → bundled build asset (templates/thumbs.js)
//       → null (caller renders a themed, text-free ornament)
//
// The pointer map is fetched ONCE per page load and memoized at module scope:
// the landing strip, the gallery, and the picker can all call this without
// N duplicate requests, and a slow/failed fetch simply leaves every template on
// its bundled art (getTemplateAssetsPublic never throws).
import { useEffect, useState } from "react";
import { getTemplateAssetsPublic } from "../services/digitalInvitation.js";
import { getTemplateThumb } from "../components/digital/templates/thumbs.js";

// Module-scope cache shared by every consumer of the hook.
let cache = null; // resolved asset map, once loaded
let inflight = null; // de-dupes concurrent first calls

function loadAssets() {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = getTemplateAssetsPublic()
      .then((assets) => {
        cache = assets || {};
        return cache;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

// Test seam: drop the memoized map so a suite can re-fetch with fresh mocks.
export function __resetTemplateAssetsCache() {
  cache = null;
  inflight = null;
}

export function useTemplateAssets() {
  const [assets, setAssets] = useState(() => cache || {});

  useEffect(() => {
    let active = true;
    loadAssets().then((a) => {
      if (active) setAssets(a);
    });
    return () => {
      active = false;
    };
  }, []);

  // uploaded → bundled → null
  const resolveThumb = (templateId) => assets?.[templateId]?.url || getTemplateThumb(templateId) || null;

  return { assets, resolveThumb };
}
