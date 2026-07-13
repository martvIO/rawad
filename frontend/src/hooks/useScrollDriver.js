import { useEffect } from "react";

// Writes normalized page-scroll progress (0..1) into a ref so the celestial loop
// reads `ref.current` each frame without ever re-rendering the component.
//
// The POSITION is sampled every animation frame (rAF), NOT from 'scroll' events:
// mobile browsers throttle — and during a momentum flick often SUPPRESS — scroll
// events, so an event-only driver left the scroll-flown camera frozen mid-scroll
// on phones (the "stars stream in on desktop but not on mobile" bug). rAF keeps
// running through momentum scrolling, so the camera streams smoothly on phone
// exactly like desktop. `scrollY` is a cheap cached read; the scrollable HEIGHT
// (which forces layout) is only re-measured on the events that can change it.
// Disabled in the editor preview (the dashboard's own scroll must not hijack the
// camera).
export function useScrollDriver(scrollRef, enabled) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;
    let raf = 0;
    let max = 0;
    const measure = () => {
      max = document.documentElement.scrollHeight - window.innerHeight;
    };
    const loop = () => {
      const y = window.scrollY || window.pageYOffset || 0;
      scrollRef.current = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
      raf = requestAnimationFrame(loop);
    };
    measure();
    raf = requestAnimationFrame(loop);
    // Re-measure the scrollable height only when it can actually change (content
    // reveal / images loading fire scroll+resize; rotation fires orientation).
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure, { passive: true });
    window.addEventListener("orientationchange", measure, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [scrollRef, enabled]);
}
