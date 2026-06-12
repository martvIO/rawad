// Proof-photo URL bridge — resolves `proofPhotoPath` storage paths into
// download URLs and decorates the guest list with a legacy-compatible
// `proofImg` field for the proof viewer. Extracted from usePortalState.
import { useEffect, useMemo, useState } from "react";
import { proofDownloadUrl } from "../../services/proofs.js";
import { logErr } from "../../utils/logger.js";

export function usePortalProofs({ guests }) {
  // Bridge legacy `guest.proofImg` → resolved storage URL for the proof viewer.
  // The JSX slices check `g.proofImg` strings; for new records we expose a
  // matching `proofImg` field populated from `proofPhotoPath`.
  const [proofUrlCache, setProofUrlCache] = useState({});
  useEffect(() => {
    let cancelled = false;
    const need = guests
      .filter(g => g.proofPhotoPath && /^proofs\//.test(g.proofPhotoPath))
      .filter(g => !(g.id in proofUrlCache));
    if (need.length === 0) return;
    (async () => {
      const adds = {};
      for (const g of need) {
        try { adds[g.id] = await proofDownloadUrl(g.proofPhotoPath); }
        catch (err) { logErr("proof.url", err); }
      }
      if (!cancelled) setProofUrlCache((prev) => ({ ...prev, ...adds }));
    })();
    return () => { cancelled = true; };
  }, [guests, proofUrlCache]);

  const decoratedGuests = useMemo(
    () => guests.map((g) => {
      if (g.proofPhotoPath && /^proofs\//.test(g.proofPhotoPath)) {
        const url = proofUrlCache[g.id];
        return { ...g, proofImg: url || g.proofPhotoPath };
      }
      if (g.proofPhotoPath && !g.proofImg) return { ...g, proofImg: g.proofPhotoPath };
      return g;
    }),
    [guests, proofUrlCache],
  );

  return { decoratedGuests };
}
