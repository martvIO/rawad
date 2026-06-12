// Lazily injects Leaflet (CSS + JS) from CDN. Returns true once window.L is ready.
import { useState, useEffect } from "react";
import { LEAFLET } from "../config/index.js";

export function useLeaflet() {
  const [ready, setReady] = useState(() =>
    typeof window !== "undefined" && !!window.L
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.L) { setReady(true); return; }

    // Inject CSS once. `integrity` (SRI) + `crossOrigin` pin the exact bytes,
    // so a tampered CDN asset is rejected by the browser instead of executing.
    if (!document.querySelector("link[data-dawa-leaflet]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET.CSS_URL;
      link.setAttribute("data-dawa-leaflet", "");
      if (LEAFLET.CSS_SRI) link.integrity = LEAFLET.CSS_SRI;
      link.crossOrigin = "anonymous";
      document.head.appendChild(link);
    }

    // Inject JS once (SRI-pinned, same rationale as the CSS above).
    const existing = document.querySelector("script[data-dawa-leaflet]");
    if (!existing) {
      const script = document.createElement("script");
      script.src = LEAFLET.JS_URL;
      script.setAttribute("data-dawa-leaflet", "");
      if (LEAFLET.JS_SRI) script.integrity = LEAFLET.JS_SRI;
      script.crossOrigin = "anonymous";
      script.onload = () => setReady(true);
      script.onerror = () => setReady(false);
      document.head.appendChild(script);
    } else {
      // Script tag is there — poll until window.L is defined
      const interval = setInterval(() => {
        if (window.L) { setReady(true); clearInterval(interval); }
      }, 100);
      return () => clearInterval(interval);
    }
  }, []);

  return ready;
}
