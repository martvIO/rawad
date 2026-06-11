// Envelope intro — a realistic 2.5D paper envelope, sealed with the couple's
// wax monogram. The guest presses the seal: it cracks in two, the back flap
// unfolds in 3D, the invitation card slides out and blooms into the page.
//
// CSS owns the geometry (clip-path folds, perspective, paper grain); GSAP
// owns the motion. Plays on EVERY visit (the old once-per-device localStorage
// gate is gone) with an always-visible skip chip + Escape key. Without GSAP
// the envelope renders static and a tap simply fades the overlay — content is
// never trapped behind a failed animation. The orchestrator never mounts this
// component when prefers-reduced-motion is set.
import { useEffect, useRef, useState } from "react";
import { useGsap } from "../../hooks/useGsap.js";
import { makeT } from "../../i18n/index.js";
import { ON_GOLD } from "./inviteShared.jsx";

const SPARKS = [
  { x: 30, y: -34 }, { x: -34, y: -26 }, { x: 20, y: -46 },
  { x: -18, y: -40 }, { x: 40, y: -14 }, { x: -28, y: -12 },
];

export function EnvelopeIntro({ guestName, monogram, groomName, brideName, theme, font, lang, onDone }) {
  const t = makeT(lang);
  const ready = useGsap();
  const rootRef = useRef(null);
  const flapRef = useRef(null);
  const tlRef = useRef(null);
  const startedRef = useRef(false);
  const doneRef = useRef(false);
  const [gone, setGone] = useState(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setGone(true);
    onDone?.();
  };

  // Build the idle loops + the main opening timeline once GSAP is here.
  useEffect(() => {
    if (!ready || !rootRef.current) return undefined;
    const gsap = window.gsap;
    if (!gsap) return undefined;

    const ctx = gsap.context(() => {
      const idle = [
        gsap.to("[data-env-scene]", { y: 7, duration: 3, ease: "sine.inOut", yoyo: true, repeat: -1 }),
        gsap.to("[data-env-seal]", { scale: 1.045, duration: 1.7, ease: "sine.inOut", yoyo: true, repeat: -1 }),
        gsap.to("[data-env-hint]", { opacity: 0.45, duration: 1.6, ease: "sine.inOut", yoyo: true, repeat: -1 }),
      ];

      // The card starts tucked inside the envelope, slightly small.
      gsap.set("[data-env-card]", { scale: 0.92, yPercent: 0 });

      const tl = gsap.timeline({ paused: true, onComplete: finish })
        .add(() => idle.forEach((tw) => tw.kill()), 0)
        // 1 — press: the envelope answers the touch
        .to("[data-env-scene]", { scale: 0.97, duration: 0.11, ease: "power2.in" }, 0)
        .to("[data-env-scene]", { scale: 1, duration: 0.24, ease: "back.out(2.5)" }, 0.11)
        // 2 — crack: the wax seal splits and falls away, sparks fly
        .to("[data-env-seal-l]", { rotation: -24, x: -13, y: 12, autoAlpha: 0, duration: 0.5, ease: "power2.in" }, 0.18)
        .to("[data-env-seal-r]", { rotation: 24, x: 13, y: 12, autoAlpha: 0, duration: 0.5, ease: "power2.in" }, 0.18)
        .to("[data-env-spark]", {
          x: (i) => SPARKS[i % SPARKS.length].x,
          y: (i) => SPARKS[i % SPARKS.length].y,
          autoAlpha: 0, scale: 0.4, duration: 0.55, ease: "power2.out",
        }, 0.2)
        // 3 — unfold: the flap swings up and back in 3D; the scene leans
        .to("[data-env-flap]", { rotationX: -178, duration: 0.85, ease: "power3.inOut" }, 0.52)
        .to("[data-env-scene]", { rotationX: 8, duration: 0.85, ease: "power3.inOut" }, 0.52)
        .add(() => flapRef.current?.classList.add("is-behind"), 0.94)
        // 4 — slide: the invitation card rises out of the pocket
        .to("[data-env-card]", { yPercent: -56, scale: 1, duration: 0.8, ease: "power2.out" }, 1.15)
        // 5 — bloom: the card expands toward the viewer as the page appears
        .to("[data-env-card]", { scale: 1.5, autoAlpha: 0, duration: 0.8, ease: "power3.inOut" }, 1.8)
        .to("[data-env-body]", { autoAlpha: 0, y: 44, duration: 0.7, ease: "power3.inOut" }, 1.85)
        .to(rootRef.current, { autoAlpha: 0, duration: 0.75, ease: "power2.inOut" }, 1.9);

      tlRef.current = tl;
    }, rootRef);

    return () => { ctx.revert(); tlRef.current = null; };
    // finish is stable via refs; theme/font changes remount the whole view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const open = () => {
    if (startedRef.current) return;
    startedRef.current = true;
    const tl = tlRef.current;
    if (tl) { tl.play(0); return; }
    // No GSAP — plain CSS fade so the guest is never stuck.
    const el = rootRef.current;
    if (el) {
      el.style.transition = "opacity .45s ease";
      el.style.opacity = "0";
      el.style.pointerEvents = "none";
    }
    setTimeout(finish, 460);
  };

  const skip = () => {
    const tl = tlRef.current;
    if (tl) {
      startedRef.current = true;
      tl.progress(1, false); // run the z-flip callback + onComplete
    } else {
      finish();
    }
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") skip(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (gone) return null;

  const initial = (monogram || "د").trim();
  const coupleLine = [groomName, brideName].filter(Boolean).join(lang === "he" ? " ו" : " و ");
  const grain = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='72' viewBox='0 0 72 72'%3E%3Cg fill='none' stroke='${encodeURIComponent(theme.accent)}' stroke-width='1'%3E%3Cpath d='M36 12 L48 36 L36 60 L24 36 Z'/%3E%3Ccircle cx='36' cy='36' r='3'/%3E%3C/g%3E%3C/svg%3E")`;

  return (
    <div
      ref={rootRef}
      className="dawa-env-overlay"
      role="dialog"
      aria-label={t("inv_envelope_seal")}
      style={{ fontFamily: font.family }}
    >
      <style>{`
        .dawa-env-overlay {
          position: fixed; inset: 0; z-index: 1000;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 32px;
          background: radial-gradient(ellipse 85% 65% at 50% 38%, ${theme.accentMuted}, transparent 62%), ${theme.bg};
        }
        .dawa-env-persp { perspective: 1200px; }
        .dawa-env-scene {
          position: relative;
          width: min(420px, 86vw);
          aspect-ratio: 1.45 / 1;
          transform-style: preserve-3d;
          cursor: pointer;
          will-change: transform;
          outline: none;
        }
        .dawa-env-scene:focus-visible { filter: drop-shadow(0 0 14px ${theme.sparkleGlow}); }
        .dawa-env-body { position: absolute; inset: 0; transform-style: preserve-3d; }

        /* paper back */
        .dawa-env-back {
          position: absolute; inset: 0; border-radius: 10px;
          background: ${theme.cardBg};
          border: 1px solid ${theme.accentLine};
          box-shadow: 0 36px 90px -24px rgba(0,0,0,.65), 0 0 70px ${theme.accentMuted};
        }
        .dawa-env-back::after {
          content: ""; position: absolute; inset: 0; border-radius: 10px;
          opacity: .05; background-image: ${grain}; background-size: 72px 72px;
        }

        /* the invitation card inside */
        .dawa-env-card {
          position: absolute; inset: 5% 7%;
          border-radius: 8px;
          background: linear-gradient(180deg, ${theme.bg}, ${theme.overlay || theme.bg});
          border: 1px solid ${theme.accentLine};
          box-shadow: 0 -10px 34px -16px rgba(0,0,0,.6);
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 8px; text-align: center; padding: 18px;
          will-change: transform;
          z-index: 2;
        }
        .dawa-env-card::before {
          content: ""; position: absolute; inset: 7px; border-radius: 5px;
          border: 1px solid ${theme.accentLine}; pointer-events: none; opacity: .8;
        }
        .dawa-env-card-mono {
          font-weight: 900; font-size: clamp(30px, 8vw, 44px); line-height: 1.3;
          color: ${theme.text};
        }
        .dawa-env-card-names {
          font-size: clamp(13px, 3vw, 16px); color: ${theme.textSoft}; letter-spacing: .5px;
        }

        /* front pocket — lower trapezoid + side folds (the 2.5D read) */
        .dawa-env-pocket {
          position: absolute; inset: 0; border-radius: 10px; z-index: 3;
          pointer-events: none;
          background: linear-gradient(180deg, transparent 38%, ${theme.bg} 39%);
          clip-path: polygon(0 38%, 50% 64%, 100% 38%, 100% 100%, 0 100%);
          border: 1px solid ${theme.accentLine};
          box-shadow: inset 0 14px 30px -18px rgba(0,0,0,.55);
        }
        .dawa-env-pocket::before, .dawa-env-pocket::after {
          content: ""; position: absolute; inset: 0;
          background: ${theme.accentMuted}; opacity: .5;
        }
        .dawa-env-pocket::before { clip-path: polygon(0 38%, 50% 64%, 0 100%); }
        .dawa-env-pocket::after  { clip-path: polygon(100% 38%, 50% 64%, 100% 100%); }

        /* top flap — folds up from its top edge */
        .dawa-env-flap {
          position: absolute; inset: 0; z-index: 4;
          transform-origin: 50% 0%;
          transform-style: preserve-3d;
          backface-visibility: hidden;
          will-change: transform;
          background: linear-gradient(180deg, ${theme.bg} 0%, ${theme.overlay || theme.bg} 100%);
          clip-path: polygon(0 0, 100% 0, 50% 60%);
          border-radius: 10px 10px 0 0;
          box-shadow: inset 0 -10px 26px -14px rgba(0,0,0,.5);
        }
        .dawa-env-flap::before {
          content: ""; position: absolute; inset: 0;
          clip-path: polygon(0 0, 100% 0, 50% 60%);
          background: ${theme.accentMuted}; opacity: .35;
        }
        .dawa-env-flap::after {
          content: ""; position: absolute; inset: 0;
          clip-path: polygon(1.5% 1%, 98.5% 1%, 50% 58%);
          border-radius: 10px 10px 0 0;
          background: transparent;
          border-bottom: 1px solid ${theme.accentLine};
        }
        .dawa-env-flap.is-behind { z-index: 1; }

        /* wax seal — two clip-path halves so the crack reads physically */
        .dawa-env-seal {
          position: absolute; top: 49%; left: 50%;
          width: clamp(72px, 20vw, 92px); height: clamp(72px, 20vw, 92px);
          transform: translate(-50%, -50%);
          z-index: 5; pointer-events: none;
          filter: drop-shadow(0 10px 22px ${theme.accentMuted});
        }
        .dawa-env-seal-half {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          font-weight: 900; font-size: clamp(26px, 7vw, 36px);
          color: ${ON_GOLD};
          background: radial-gradient(circle at 32% 30%, ${theme.gradientStops[1]} 0%, ${theme.accent} 64%);
          border-radius: 53% 47% 52% 48% / 51% 53% 47% 49%;
          box-shadow: inset 0 2px 5px rgba(255,255,255,.45), inset 0 -3px 7px rgba(0,0,0,.28);
          will-change: transform;
        }
        .dawa-env-seal-half.l { clip-path: inset(0 50% 0 0); }
        .dawa-env-seal-half.r { clip-path: inset(0 0 0 50%); }
        .dawa-env-spark {
          position: absolute; top: 50%; left: 50%;
          width: 5px; height: 5px; border-radius: 50%;
          background: ${theme.sparkle};
          box-shadow: 0 0 10px ${theme.sparkleGlow};
          opacity: 0;
        }

        .dawa-env-name {
          margin-top: 36px; font-weight: 900;
          font-size: clamp(26px, 5vw, 42px); line-height: 1.4;
          color: ${theme.text}; text-align: center;
          text-shadow: 0 0 40px ${theme.accentMuted};
        }
        .dawa-env-hint {
          margin-top: 14px; color: ${theme.accent};
          font-size: 12.5px; letter-spacing: 3px; text-transform: uppercase; font-style: italic;
          text-align: center;
        }
        .dawa-env-skip {
          position: absolute; bottom: 18px; inset-inline-end: 18px;
          appearance: none; cursor: pointer;
          background: ${theme.chipBg}; color: ${theme.accent};
          border: 1px solid ${theme.chipBorder}; border-radius: 999px;
          padding: 8px 16px; font-size: 11.5px; font-weight: 700;
          letter-spacing: 1.5px; text-transform: uppercase;
          font-family: inherit; opacity: .65;
          transition: opacity .25s ease;
        }
        .dawa-env-skip:hover, .dawa-env-skip:focus-visible { opacity: 1; }
      `}</style>

      <div className="dawa-env-persp">
        <div
          className="dawa-env-scene"
          data-env-scene
          role="button"
          tabIndex={0}
          aria-label={t("inv_envelope_seal")}
          onClick={open}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && open()}
        >
          <div className="dawa-env-body" data-env-body>
            <div className="dawa-env-back" />
            <div className="dawa-env-card" data-env-card aria-hidden="true">
              <span className="dawa-env-card-mono">{initial}</span>
              {coupleLine && <span className="dawa-env-card-names">{coupleLine}</span>}
            </div>
            <div className="dawa-env-pocket" aria-hidden="true" />
            <div className="dawa-env-flap" ref={flapRef} data-env-flap aria-hidden="true" />
            <div className="dawa-env-seal" data-env-seal aria-hidden="true">
              <span className="dawa-env-seal-half l" data-env-seal-l>{initial}</span>
              <span className="dawa-env-seal-half r" data-env-seal-r>{initial}</span>
              {SPARKS.map((_, i) => <span key={i} className="dawa-env-spark" data-env-spark />)}
            </div>
          </div>
        </div>
      </div>

      {guestName && <div className="dawa-env-name">{guestName}</div>}
      <div className="dawa-env-hint" data-env-hint>— {t("inv_envelope_hint")} —</div>
      <button className="dawa-env-skip" data-testid="dawa-env-skip" type="button" onClick={skip}>
        {t("inv_envelope_skip")}
      </button>
    </div>
  );
}
