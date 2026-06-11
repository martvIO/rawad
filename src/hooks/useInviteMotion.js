// All GSAP choreography for the public digital invitation. One hook, two
// effects: (A) scroll choreography — reveal cascade, story-line draw, venue
// route trace; (B) the hero entrance timeline, which waits for the envelope
// (`heroGo` flips true when the envelope finishes / is skipped / is absent).
//
// Hard rules:
//   - Public mode only. The editor/admin preview renders static (it lives in
//     a nested scroll box where window-scroller triggers can never fire).
//   - Animation is additive: nothing in markup or CSS hides content, so when
//     GSAP is missing or prefers-reduced-motion is set, the page is simply
//     static and fully visible.
import { useEffect } from "react";
import { prefersReducedMotion, REVEAL } from "../utils/motion.js";

export function useInviteMotion(rootRef, ready, isPublic, design, lang, heroGo) {
  // ── A: scroll choreography ────────────────────────────────────────────────
  useEffect(() => {
    if (!isPublic || !ready || prefersReducedMotion()) return undefined;
    const gsap = window.gsap;
    const ST = window.ScrollTrigger;
    const root = rootRef.current;
    if (!gsap || !ST || !root) return undefined;

    const ctx = gsap.context(() => {
      // House reveal cascade — every `.dawa-inv-reveal` block rises in as it
      // enters view. fromTo on enter means a missing GSAP never hides them.
      ST.batch(root.querySelectorAll(".dawa-inv-reveal"), {
        start: "top 88%",
        once: true,
        onEnter: (els) =>
          gsap.fromTo(els,
            { autoAlpha: 0, y: 36 },
            { autoAlpha: 1, y: 0, duration: REVEAL.duration, ease: REVEAL.ease, stagger: 0.1 }),
      });

      // Story timeline center rule draws downward as the story scrolls.
      // The rule is a ::before — we tween the CSS var it reads its scale from.
      const timeline = root.querySelector(".dawa-inv-timeline");
      if (timeline) {
        gsap.fromTo(timeline,
          { "--dawa-draw": 0 },
          {
            "--dawa-draw": 1, ease: "none",
            scrollTrigger: { trigger: timeline, start: "top 75%", end: "bottom 72%", scrub: true },
          });
      }

      // Venue route traces once when the map scrolls in (replaces the old
      // infinite loop — calmer, and free after it finishes).
      const route = root.querySelector(".dawa-inv-route");
      if (route) {
        gsap.fromTo(route,
          { strokeDashoffset: 280 },
          {
            strokeDashoffset: 0, duration: 2.4, ease: "power2.out",
            scrollTrigger: { trigger: route, start: "top 82%", once: true },
          });
      }
    }, root);

    return () => ctx.revert();
  }, [rootRef, ready, isPublic, design, lang]);

  // ── B: hero entrance — chained off the envelope ──────────────────────────
  useEffect(() => {
    if (!isPublic || !ready || !heroGo || prefersReducedMotion()) return undefined;
    const gsap = window.gsap;
    const root = rootRef.current;
    if (!gsap || !root) return undefined;

    const ctx = gsap.context(() => {
      gsap.timeline({ defaults: { ease: "power3.out" } })
        .from(".dawa-inv-hero-frame", { autoAlpha: 0, scale: 1.02, duration: 1.3 }, 0.05)
        .from(".dawa-inv-hero-logo", { autoAlpha: 0, y: 24, duration: 0.8 }, 0.05)
        .from(".dawa-inv-hero-flourish", { autoAlpha: 0, y: 18, duration: 0.8 }, 0.15)
        .from(".dawa-inv-hero-eyebrow", { autoAlpha: 0, duration: 0.7 }, 0.22)
        .from(".dawa-inv-monogram", { autoAlpha: 0, scale: 0.92, y: 20, duration: 1 }, 0.3)
        .from(".dawa-inv-couple", { autoAlpha: 0, y: 30, duration: 1, stagger: 0.16 }, 0.45)
        .from(".dawa-inv-amp", { autoAlpha: 0, duration: 0.7 }, 0.6)
        .from(".dawa-inv-dateline", { autoAlpha: 0, y: 20, duration: 0.8 }, 0.85)
        .from(".dawa-inv-greet", { autoAlpha: 0, y: 20, duration: 0.8 }, 1.0)
        .from(".dawa-inv-hero-media", { autoAlpha: 0, y: 26, duration: 0.9 }, 1.12)
        .from(".dawa-inv-cue", { autoAlpha: 0, duration: 0.7 }, 1.25);
    }, root);

    return () => ctx.revert();
  }, [rootRef, ready, isPublic, heroGo, lang]);
}
