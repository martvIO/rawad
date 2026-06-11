// Lazily injects GSAP core + ScrollTrigger from CDN (SRI-pinned, same pattern
// as useLeaflet). Returns true once window.gsap + window.ScrollTrigger exist
// and the plugin is registered. Consumers MUST treat `false` as "render the
// static, fully-visible page" — animation is additive, never gating.
import { useState, useEffect } from "react";
import { GSAP } from "../config/index.js";

function registerST() {
  try {
    if (window.gsap && window.ScrollTrigger) {
      window.gsap.registerPlugin(window.ScrollTrigger); // idempotent in GSAP 3
      return true;
    }
  } catch { /* ignore — caller stays in static mode */ }
  return false;
}

export function useGsap() {
  const [ready, setReady] = useState(() =>
    typeof window !== "undefined" && !!window.gsap && !!window.ScrollTrigger
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.gsap && window.ScrollTrigger) { registerST(); setReady(true); return; }

    // ScrollTrigger is injected from the core script's onload so the plugin
    // never races its host library.
    const injectST = () => {
      if (window.ScrollTrigger) { registerST(); setReady(true); return; }
      if (document.querySelector("script[data-dawa-gsap-st]")) return; // poller below resolves
      const st = document.createElement("script");
      st.src = GSAP.ST_URL;
      st.setAttribute("data-dawa-gsap-st", "");
      if (GSAP.ST_SRI) st.integrity = GSAP.ST_SRI;
      st.crossOrigin = "anonymous";
      st.onload = () => { registerST(); setReady(true); };
      st.onerror = () => setReady(false);
      document.head.appendChild(st);
    };

    const existing = document.querySelector("script[data-dawa-gsap]");
    if (!existing) {
      const script = document.createElement("script");
      script.src = GSAP.CORE_URL;
      script.setAttribute("data-dawa-gsap", "");
      if (GSAP.CORE_SRI) script.integrity = GSAP.CORE_SRI;
      script.crossOrigin = "anonymous";
      script.onload = injectST;
      script.onerror = () => setReady(false);
      document.head.appendChild(script);
    } else {
      // Tags already injected by another mount — poll until both globals land.
      const interval = setInterval(() => {
        if (window.gsap && window.ScrollTrigger) {
          registerST();
          setReady(true);
          clearInterval(interval);
        } else if (window.gsap) {
          injectST();
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, []);

  return ready;
}
