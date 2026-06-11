// Shared motion helpers for the GSAP-animated surfaces (landing page,
// digital invitation). Pure functions — no GSAP import; the library arrives
// as a window global via useGsap() and is passed in where needed.

/**
 * True when the user asked the OS to minimise motion. Every GSAP timeline
 * and ScrollTrigger registration must be skipped (not merely shortened)
 * when this returns true — content is laid out fully visible by default,
 * so "no animation" is automatically the accessible path.
 */
export function prefersReducedMotion() {
  try {
    return typeof window !== "undefined"
      && typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * House reveal tween: how far elements travel, how long, with what ease and
 * stagger. Single source of truth so the landing page and the invitation
 * cascade with the same rhythm.
 */
export const REVEAL = {
  y: 28,
  duration: 0.9,
  ease: "power3.out",
  stagger: 0.12,
};

/**
 * Magnetic hover for CTAs: the element leans a few px toward the pointer.
 * Desktop-only by design — coarse pointers (touch) get a no-op disposer.
 * Returns a cleanup function that removes listeners and resets transforms.
 */
export function attachMagnetic(el, gsap, strength = 0.3) {
  if (!el || !gsap) return () => {};
  try {
    if (!window.matchMedia("(pointer: fine)").matches) return () => {};
  } catch {
    return () => {};
  }

  const xTo = gsap.quickTo(el, "x", { duration: 0.4, ease: "power3.out" });
  const yTo = gsap.quickTo(el, "y", { duration: 0.4, ease: "power3.out" });

  const onMove = (e) => {
    const r = el.getBoundingClientRect();
    xTo((e.clientX - (r.left + r.width / 2)) * strength);
    yTo((e.clientY - (r.top + r.height / 2)) * strength);
  };
  const onLeave = () => { xTo(0); yTo(0); };

  el.addEventListener("mousemove", onMove);
  el.addEventListener("mouseleave", onLeave);
  return () => {
    el.removeEventListener("mousemove", onMove);
    el.removeEventListener("mouseleave", onLeave);
    xTo(0); yTo(0);
  };
}
