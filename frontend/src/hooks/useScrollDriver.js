import { useEffect } from "react";

// Writes normalized page-scroll progress (0..1) into a ref on every scroll. No
// React state is touched, so the celestial loop reads `ref.current` each frame
// without ever re-rendering the component. Disabled in editor preview (the
// dashboard's own scroll must not hijack the camera).
export function useScrollDriver(scrollRef, enabled) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;
    const read = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      scrollRef.current = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    };
    read();
    window.addEventListener("scroll", read, { passive: true });
    window.addEventListener("resize", read, { passive: true });
    return () => {
      window.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
    };
  }, [scrollRef, enabled]);
}
