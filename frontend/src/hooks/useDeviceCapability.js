import { useMemo } from "react";

// Decides whether a device should run the immersive WebGL world, and at what
// quality tier. The guiding rule of the whole feature: a guest must NEVER get a
// broken or janky invite, so anything uncertain falls back to the 2D CSS floor.
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
  // Known social in-app browsers mis-render WebGL despite reporting support;
  // they're also the worst-performing contexts. Default them straight to 2D.
  const hardInApp = /(FBAN|FBAV|Instagram|Line\/|Twitter|Snapchat|Pinterest|KAKAOTALK|MicroMessenger)/i.test(ua);
  // Generic Android WebView (incl. WhatsApp on Android) — capable but unknown;
  // allow 3D but cap quality and lean on the FPS guard.
  const genericWebView = /; wv\)/i.test(ua);

  const softwareGpu = /SwiftShader|llvmpipe|Software|Microsoft Basic|ANGLE \(Google/i.test(renderer);

  if (reducedMotion || saveData || !webgl || hardInApp || softwareGpu) {
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
  if (genericWebView) tier = Math.min(tier, 1);

  return { tier, webgl, reducedMotion, saveData, inApp: genericWebView };
}

export function useDeviceCapability() {
  // Capability is stable for the page's lifetime — compute once.
  return useMemo(detect, []);
}
