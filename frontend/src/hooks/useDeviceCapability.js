import { useMemo } from "react";

// Decides whether a device should run the immersive WebGL world, and at what
// quality tier. Policy: lean INTO the 3D — only an explicit reduced-motion /
// data-saver opt-in or a total lack of WebGL drops to tier 0 (the 2D CSS floor
// + no envelope). Software GPUs and in-app browsers still ATTEMPT the 3D at the
// lowest tier; the runtime FPS guard is the real safety net for anything the
// heuristics get wrong.
//
//   tier 0 → no WebGL, render the existing 2D ambience (the guaranteed floor)
//   tier 1 → low    (≈2.6k motes, dpr 1)
//   tier 2 → mid    (≈7k motes,   dpr 1.5)   ← typical modern phone
//   tier 3 → high   (≈16k motes,  dpr 2)     ← desktop / strong GPU
//
// This is intentionally conservative and hand-rolled (no detect-gpu dependency —
// it ships a large benchmark DB and does a hidden render). The engine's runtime
// FPS guard is the real safety net for anything these heuristics get wrong.

function detect() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { tier: 0, webgl: false, reducedMotion: false, saveData: false, inApp: false };
  }

  const reducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const conn = navigator.connection || {};
  // Only trust the explicit data-saver opt-in and the categorical slow-network
  // buckets. `downlink` is a rounded, fluctuating estimate that flags fast
  // connections as slow (it mislabels desktop-on-localhost), so it's not used.
  const saveData =
    conn.saveData === true ||
    conn.effectiveType === "slow-2g" ||
    conn.effectiveType === "2g";

  // WebGL probe — release the throwaway context immediately.
  let webgl = false;
  let renderer = "";
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
    if (gl) {
      webgl = true;
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "");
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    webgl = false;
  }

  const ua = navigator.userAgent || "";
  // Known social in-app browsers can mis-render WebGL and are the worst-
  // performing contexts; they now still ATTEMPT the 3D at the lowest quality
  // tier (capped below) rather than being forced off it — the FPS guard +
  // context-loss handler are the safety net.
  const hardInApp = /(FBAN|FBAV|Instagram|Line\/|Twitter|Snapchat|Pinterest|KAKAOTALK|MicroMessenger)/i.test(ua);
  // Generic Android WebView (incl. WhatsApp on Android) — capable but unknown;
  // allow 3D but cap quality and lean on the FPS guard.
  const genericWebView = /; wv\)/i.test(ua);

  const softwareGpu = /SwiftShader|llvmpipe|Software|Microsoft Basic|ANGLE \(Google/i.test(renderer);

  // Only hard-stops force the no-envelope / 2D-floor path now: an explicit
  // reduced-motion or data-saver opt-in, or no WebGL at all. Software GPUs and
  // in-app browsers are allowed onto the 3D path (capped to tier 1 below).
  if (reducedMotion || saveData || !webgl) {
    return { tier: 0, webgl, reducedMotion, saveData, inApp: hardInApp || genericWebView };
  }

  const mem = navigator.deviceMemory; // undefined on iOS Safari — don't penalise
  const cores = navigator.hardwareConcurrency || 0;
  const coarse =
    typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;

  let tier = coarse ? 2 : 3; // touch → assume mobile/mid, fine pointer → desktop/high
  if (typeof mem === "number" && mem < 4) tier = Math.min(tier, 1);
  if (typeof mem === "number" && mem < 2) tier = 0;
  if (cores && cores <= 4) tier = Math.min(tier, coarse ? 1 : 2);
  // Risky-but-allowed contexts run at the lowest quality and lean on the guard.
  if (genericWebView || hardInApp || softwareGpu) tier = Math.min(tier, 1);

  return { tier, webgl, reducedMotion, saveData, inApp: genericWebView || hardInApp };
}

export function useDeviceCapability() {
  // Capability is stable for the page's lifetime — compute once.
  return useMemo(detect, []);
}
