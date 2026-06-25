import { useEffect } from "react";

const clamp = (v) => Math.max(-1, Math.min(1, v));

// Drives parallax from pointer movement (desktop) and device tilt (phones),
// writing into refs the celestial loop reads each frame. iOS 13+ gates
// DeviceOrientation behind a permission prompt that must be triggered from a
// real user gesture, so we request it once on the first tap anywhere on the
// page — which naturally coincides with the envelope-open tap, but also works
// when the envelope is disabled. If the guest denies, we silently keep just
// scroll + ambient drift; nothing breaks.
export function useTiltParallax(pointerRef, tiltRef, enabled, { gyro = true } = {}) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;

    const fine =
      typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;

    const onPointerMove = (e) => {
      pointerRef.current = [
        (e.clientX / window.innerWidth) * 2 - 1,
        (e.clientY / window.innerHeight) * 2 - 1,
      ];
    };

    const onOrient = (e) => {
      if (e.gamma == null || e.beta == null) return;
      // gamma: left/right tilt, beta: front/back tilt.
      tiltRef.current = [clamp(e.gamma / 40), clamp((e.beta - 50) / 40)];
    };

    let orientationAttached = false;
    const attachOrientation = () => {
      if (orientationAttached) return;
      orientationAttached = true;
      window.addEventListener("deviceorientation", onOrient, true);
    };

    const D = window.DeviceOrientationEvent;
    const needsPermission = D && typeof D.requestPermission === "function";

    const requestOnce = () => {
      window.removeEventListener("pointerdown", requestOnce);
      window.removeEventListener("touchend", requestOnce);
      try {
        D.requestPermission()
          .then((state) => { if (state === "granted") attachOrientation(); })
          .catch(() => {});
      } catch {
        /* denied / unsupported — stay on scroll + drift */
      }
    };

    if (fine) window.addEventListener("pointermove", onPointerMove, { passive: true });

    // Marketing surfaces (landing hero) want pointer parallax but must NOT pop a
    // motion-permission prompt — that reads as sketchy and hurts conversion.
    if (!gyro) {
      return () => window.removeEventListener("pointermove", onPointerMove);
    }

    if (needsPermission) {
      // iOS — wait for the first user gesture, then prompt.
      window.addEventListener("pointerdown", requestOnce, { once: true });
      window.addEventListener("touchend", requestOnce, { once: true });
    } else {
      // Android / older devices — no prompt required.
      attachOrientation();
    }

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("deviceorientation", onOrient, true);
      window.removeEventListener("pointerdown", requestOnce);
      window.removeEventListener("touchend", requestOnce);
    };
  }, [pointerRef, tiltRef, enabled]);
}
