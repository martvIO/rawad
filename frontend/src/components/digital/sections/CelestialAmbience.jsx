import { lazy, Suspense, useState, useEffect } from "react";
import { Ambience } from "./InviteAmbience.jsx";
import { useDeviceCapability } from "../../../hooks/useDeviceCapability.js";
import { celDowngraded, markCelDowngraded } from "../celestial/downgradeStore.js";

// Drop-in replacement for <Ambience>. Decides — per device capability and the
// groom's `immersive3d` flag — whether to mount the WebGL celestial world or
// fall back to the existing 2D CSS ambience. The 2D floor is BOTH the fallback
// and the Suspense placeholder, so the page is never blank or broken while the
// (lazy) three.js chunk loads.
const CelestialCanvas = lazy(() => import("../celestial/CelestialCanvas.jsx"));

export function CelestialAmbience({ theme, mode = "public", fixed = true, immersive3d = true }) {
  const cap = useDeviceCapability();
  const [downgraded, setDowngraded] = useState(celDowngraded);

  // Honor a mid-session "reduce motion" toggle by tearing the world down live.
  // (The first-paint case is already handled in useDeviceCapability → tier 0,
  // but capability is sampled once, so we watch the query here for live flips.)
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduceMotion(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const wantWebGL = immersive3d && cap.tier >= 1 && !downgraded && !reduceMotion;
  if (!wantWebGL) return <Ambience theme={theme} fixed={fixed} />;

  const onFpsDowngrade = () => {
    markCelDowngraded();
    setDowngraded(true);
  };

  return (
    <Suspense fallback={<Ambience theme={theme} fixed={fixed} />}>
      <CelestialCanvas theme={theme} mode={mode} fixed={fixed} tier={cap.tier} onFpsDowngrade={onFpsDowngrade} />
    </Suspense>
  );
}
