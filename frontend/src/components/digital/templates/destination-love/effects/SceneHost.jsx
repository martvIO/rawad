// Picks the ambient effects tier for Destination Love, exactly like
// CelestialAmbience does for the classic world:
//   • tier 0 (no WebGL / reduced-motion / data-saver) OR a prior FPS downgrade
//     → the 2D CSS floor only (Ambience2D).
//   • otherwise → the 2D floor as the base (gradient + twinkles show through the
//     alpha canvas) PLUS the lazy three.js parallax scene layered on top.
// The 2D floor is also the Suspense placeholder, so nothing flashes while the
// three chunk downloads. A runtime FPS downgrade latches for the session
// (celDowngraded) so we don't re-attempt the 3D on the next mount.
import { lazy, Suspense, useState, useCallback } from "react";
import { Ambience2D } from "./Ambience2D.jsx";
import { useDeviceCapability } from "../../../../../hooks/useDeviceCapability.js";
import { celDowngraded, markCelDowngraded } from "../../../celestial/downgradeStore.js";

const Scene3D = lazy(() => import("./Scene3D.jsx"));

export function SceneHost({ t, fixed = true }) {
  const cap = useDeviceCapability();
  const [downgraded, setDowngraded] = useState(celDowngraded);

  const onDowngrade = useCallback(() => {
    markCelDowngraded();
    setDowngraded(true);
  }, []);

  // Only attempt the heavy three.js scene on the real guest page (`fixed`); the
  // editor/admin preview stays on the light 2D floor (no tall-canvas cost).
  const use3d = fixed && cap.tier > 0 && cap.webgl && !downgraded;

  return (
    <>
      <Ambience2D t={t} fixed={fixed} />
      {use3d && (
        <Suspense fallback={null}>
          <Scene3D t={t} tier={cap.tier} fixed={fixed} onDowngrade={onDowngrade} />
        </Suspense>
      )}
    </>
  );
}
