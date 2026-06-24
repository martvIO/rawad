import { useEffect, useRef } from "react";
import { createCelestialWorld } from "./celestialEngine.js";
import { themeToUniforms } from "../../../utils/themeToUniforms.js";
import { useScrollDriver } from "../../../hooks/useScrollDriver.js";
import { useTiltParallax } from "../../../hooks/useTiltParallax.js";

// Lazy-loaded host for the WebGL world. Importing this file is what pulls
// `three` (via celestialEngine) into a separate async chunk, so non-invite
// pages never download it. The component holds no render state — it owns one
// engine instance and feeds it input through refs.
//
// The <canvas> is created imperatively per mount (not via JSX) so that disposing
// the engine — which force-loses the GL context to free it immediately — never
// poisons a reused canvas. React StrictMode's mount→unmount→remount, and any
// real remount, each get a brand-new canvas.
export default function CelestialCanvas({ theme, mode = "public", fixed = true, tier = 2, onFpsDowngrade, envelope = null, onReady, elevated = false }) {
  const containerRef = useRef(null);
  const worldRef = useRef(null);
  const scrollRef = useRef(0);
  const pointerRef = useRef([0, 0]);
  const tiltRef = useRef([0, 0]);
  const fpsCbRef = useRef(onFpsDowngrade);
  fpsCbRef.current = onFpsDowngrade;
  const themeRef = useRef(theme);
  themeRef.current = theme;
  // Envelope config is captured at mount (the engine builds it once); a ref
  // avoids re-running the create effect when the parent re-renders.
  const envelopeRef = useRef(envelope);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // public (guest invite): scroll + pointer + device tilt (asks gyro permission)
  // landing (marketing hero): scroll + pointer, no gyro prompt
  // preview (editor): ambient drift only — no input hijacking the dashboard
  const interactive = mode === "public" || mode === "landing";
  const gyro = mode === "public";

  useScrollDriver(scrollRef, interactive);
  useTiltParallax(pointerRef, tiltRef, interactive, { gyro });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const canvas = document.createElement("canvas");
    canvas.setAttribute("data-testid", "celestial-canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
    container.appendChild(canvas);

    let world;
    try {
      world = createCelestialWorld(canvas, {
        uniforms: themeToUniforms(themeRef.current),
        tier: interactive ? tier : Math.min(tier, 1),
        interactive,
        inputRefs: { scrollRef, pointerRef, tiltRef },
        envelope: envelopeRef.current,
        onFpsDowngrade: () => fpsCbRef.current && fpsCbRef.current(),
      });
    } catch (err) {
      // WebGL init can still fail past the capability probe (context limit,
      // driver quirk) — log for diagnostics and bail to the 2D floor.
      // eslint-disable-next-line no-console
      console.warn("[celestial] WebGL init failed, falling back to 2D:", err);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      if (fpsCbRef.current) fpsCbRef.current();
      return undefined;
    }
    worldRef.current = world;
    world.setTheme(themeToUniforms(themeRef.current));
    // Hand the engine up so the parent can drive openEnvelope() from the tap.
    if (onReadyRef.current) onReadyRef.current(world);

    // The engine reads scrollRef/pointerRef/tiltRef directly (passed as
    // inputRefs), so there's no separate pump loop here.
    // Pause whenever the tab is hidden OR the canvas is scrolled off-screen —
    // the landing hero and editor preview are non-fixed and scroll away, so
    // without this they'd keep the GPU loop alive while invisible. The fixed
    // invite canvas always covers the viewport, so onScreen stays true there.
    let docHidden = document.hidden;
    let onScreen = true;
    const applyPaused = () => world.setPaused(docHidden || !onScreen);

    const onVisibility = () => { docHidden = document.hidden; applyPaused(); };
    document.addEventListener("visibilitychange", onVisibility);

    let io;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        ([entry]) => { onScreen = entry.isIntersecting; applyPaused(); },
        { threshold: 0 },
      );
      io.observe(container);
    }

    const onResize = () => world.resize();
    window.addEventListener("resize", onResize, { passive: true });

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
      if (io) io.disconnect();
      world.dispose();
      worldRef.current = null;
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
    // Engine is created once; theme changes are pushed via the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live theme re-skin — uniform-only update, no rebuild, so switching theme
  // (or AR/HE) restyles the world instantly.
  useEffect(() => {
    worldRef.current?.setTheme(themeToUniforms(theme));
  }, [theme]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      style={{
        position: fixed ? "fixed" : "absolute",
        inset: 0,
        // Elevated above the DOM hero (z 6) while the envelope intro covers the
        // page; drops behind everything for the normal scene.
        zIndex: elevated ? 999 : 0,
        pointerEvents: "none",
      }}
    />
  );
}
