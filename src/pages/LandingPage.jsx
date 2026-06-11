// Public marketing landing page — "maison éditoriale" luxury redesign.
// Engraved-stationery aesthetic: oversized Amiri serif, thin gold hairlines,
// ghosted section numerals, grain + vignette atmosphere, GSAP scroll
// choreography (lazy CDN-loaded; the page is fully visible and static when
// GSAP is absent or prefers-reduced-motion is set — animation is additive,
// never gating).
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo.jsx";
import { C } from "../styles/theme.js";
import { useGsap } from "../hooks/useGsap.js";
import { prefersReducedMotion, REVEAL, attachMagnetic } from "../utils/motion.js";

// Page palette — every tint derives from the theme gold family. Centralized
// here so the page reads from one place (theme.js stays the source of the
// core tokens; these are the page-local tints layered on top of it).
const P = {
  bg: C.bg,                              // #07070a
  gold: C.gold,                          // #c9a84c
  bright: "#f0c84c",                     // polished gold (accents, numerals)
  cream: "#fff3c0",                      // brightest text
  soft: "#d8c9a6",                       // body text
  dim: C.dim,                            // #7a6a4a — captions
  line: "rgba(201,168,76,.16)",          // hairline rules
  lineStrong: "rgba(201,168,76,.34)",    // emphasized rules
  glow: "rgba(201,168,76,.14)",          // radial glows
  ghost: "rgba(240,200,76,.05)",         // ghost numerals
  violet: "#9b4bd4",                     // digital-offering accent
  violetSoft: "#c084fc",
};
const GOLD_TEXT = {
  background: `linear-gradient(135deg,${P.cream},${P.bright},${P.gold})`,
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
};

// ── Nav "scrolled" flag — state flips only when crossing the threshold ──────
function useScrolledPast(threshold = 60) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

// ── All GSAP choreography for the page ──────────────────────────────────────
// Lives in one effect: a gsap.context scoped to the page root, with
// matchMedia branches (reduced-motion users get nothing — the page is laid
// out fully visible by default). Re-runs when the language flips because the
// content nodes remount.
function useLandingMotion(rootRef, ready, lang) {
  useEffect(() => {
    if (!ready || prefersReducedMotion()) return undefined;
    const gsap = window.gsap;
    const root = rootRef.current;
    if (!gsap || !window.ScrollTrigger || !root) return undefined;

    const disposers = [];
    const mm = gsap.matchMedia();
    const ctx = gsap.context(() => {
      // ── Base branch: entrance + reveals + scrubs (all viewports) ──────────
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        // Hero entrance — only on a fresh page load. If GSAP arrived late
        // (slow CDN) the hero has been visible for a while; re-hiding it to
        // replay an entrance would feel broken, so we skip it.
        if (performance.now() < 3000) {
          gsap.timeline({ defaults: { ease: "power3.out" } })
            .from("[data-hrule]", { scaleX: 0, duration: 0.9 }, 0.15)
            .from('[data-h="eyebrow"]', { autoAlpha: 0, duration: 0.7 }, 0.2)
            .from('[data-h="logo"]', { autoAlpha: 0, y: 26, duration: 0.9 }, 0.3)
            .from('[data-h="title"]', { autoAlpha: 0, y: 34, scale: 0.97, duration: 1.1 }, 0.45)
            .from('[data-h="tag1"]', { autoAlpha: 0, y: 26, duration: 0.9 }, 0.7)
            .from('[data-h="tag2"]', { autoAlpha: 0, y: 22, duration: 0.9 }, 0.82)
            .from('[data-h="ctas"]', { autoAlpha: 0, y: 20, duration: 0.8 }, 0.95)
            .from('[data-h="chips"] > *', { autoAlpha: 0, y: 14, duration: 0.6, stagger: 0.07 }, 1.05)
            .from('[data-h="cue"]', { autoAlpha: 0, duration: 0.8 }, 1.25);
        }

        // Hero scrub — content recedes and rings breathe as you leave the fold.
        gsap.to("[data-hero-content]", {
          y: -70, autoAlpha: 0.25, ease: "none",
          scrollTrigger: { trigger: "[data-hero]", start: "top top", end: "+=55%", scrub: true },
        });
        gsap.to("[data-hero-rings] > *", {
          scale: 1.14, ease: "none",
          scrollTrigger: { trigger: "[data-hero]", start: "top top", end: "+=55%", scrub: true },
        });

        // House reveal cascade for everything tagged data-lr.
        window.ScrollTrigger.batch("[data-lr]", {
          start: "top 88%",
          once: true,
          onEnter: (els) =>
            gsap.fromTo(els,
              { autoAlpha: 0, y: REVEAL.y },
              { autoAlpha: 1, y: 0, duration: REVEAL.duration, ease: REVEAL.ease, stagger: REVEAL.stagger }),
        });

        // Process timeline rule draws downward as the steps pass.
        gsap.fromTo("[data-process-line]",
          { scaleY: 0 },
          {
            scaleY: 1, ease: "none", transformOrigin: "top center",
            scrollTrigger: { trigger: "[data-process]", start: "top 70%", end: "bottom 70%", scrub: true },
          });

        // Final CTA glow blooms in.
        gsap.fromTo("[data-cta-glow]",
          { scale: 0.85, autoAlpha: 0.4 },
          {
            scale: 1, autoAlpha: 1, ease: "none",
            scrollTrigger: { trigger: "[data-cta]", start: "top 85%", end: "center 55%", scrub: true },
          });

        // Magnetic gold CTAs (pointer-fine only — attachMagnetic guards).
        root.querySelectorAll("[data-magnetic]").forEach((el) => {
          disposers.push(attachMagnetic(el, gsap));
        });
        return () => { while (disposers.length) disposers.pop()(); };
      });

      // ── Desktop: the one pinned moment — showcase phone scene ─────────────
      mm.add("(min-width: 1024px) and (prefers-reduced-motion: no-preference)", () => {
        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: "[data-showcase]", start: "top top", end: "+=85%",
            pin: true, scrub: 0.6,
          },
        });
        tl.fromTo("[data-phone]", { rotationY: 16, y: 56 }, { rotationY: 0, y: 0 }, 0)
          .fromTo("[data-showcase-copy] > *", { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, stagger: 0.1 }, 0)
          .fromTo("[data-stat]",
            { textContent: 0 },
            { textContent: (i, el) => +el.dataset.stat || 0, snap: { textContent: 1 } }, 0.15);
      });

      // ── Mobile: showcase reveals plainly — no pin, no scroll-jacking ──────
      mm.add("(max-width: 1023.98px) and (prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-phone]", {
          autoAlpha: 0, y: 36, duration: REVEAL.duration, ease: REVEAL.ease,
          scrollTrigger: { trigger: "[data-showcase]", start: "top 80%", once: true },
        });
        gsap.from("[data-showcase-copy] > *", {
          autoAlpha: 0, y: REVEAL.y, duration: REVEAL.duration, ease: REVEAL.ease, stagger: 0.1,
          scrollTrigger: { trigger: "[data-showcase-copy]", start: "top 85%", once: true },
        });
      });
    }, root);

    return () => { mm.revert(); ctx.revert(); };
  // Language flip remounts the text nodes — rebuild the triggers for them.
  }, [rootRef, ready, lang]);
}

// ── Top nav — hairline editorial bar ────────────────────────────────────────
function TopNav({ t, lang, setLang, onEnterPortal, scrolled }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const links = [
    { id: "hero",     label: t("nav_home") },
    { id: "services", label: t("nav_services") },
    { id: "pricing",  label: t("nav_pricing") },
    { id: "faq",      label: t("nav_faq") },
  ];

  const handleScroll = (e, id) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setMenuOpen(false);
  };

  return (
    <header style={{
      position: "fixed", top: 0, insetInline: 0, zIndex: 100,
      background: scrolled ? "rgba(7,7,10,.88)" : "rgba(7,7,10,.30)",
      borderBottom: `1px solid rgba(201,168,76,${scrolled ? ".22" : ".08"})`,
      backdropFilter: "blur(22px)", WebkitBackdropFilter: "blur(22px)",
      transition: "background .35s ease, border-color .35s ease",
    }}>
      <div style={{
        maxWidth: 1280, margin: "0 auto", padding: "13px 22px",
        display: "flex", alignItems: "center", gap: 16,
      }}>
        <a href="#hero" onClick={(e) => handleScroll(e, "hero")} style={{
          display: "inline-flex", alignItems: "center", gap: 10,
          color: P.cream, textDecoration: "none",
          fontFamily: "'Amiri',serif", fontWeight: 700, fontSize: 23,
          flexShrink: 0, letterSpacing: ".5px",
        }}>
          <BrandLogo size={32} />
          <span>دعوة</span>
        </a>

        <nav className="dawa-topnav-links" style={{
          display: "flex", alignItems: "center", gap: 34,
          flex: 1, justifyContent: "center",
        }}>
          {links.map(l => (
            <a key={l.id} href={`#${l.id}`} onClick={(e) => handleScroll(e, l.id)} style={{
              color: P.soft, textDecoration: "none",
              fontSize: 12.5, fontWeight: 700, fontFamily: "inherit",
              letterSpacing: "1.5px", textTransform: "uppercase",
              transition: "color .25s ease", padding: "6px 2px",
              borderBottom: "1px solid transparent",
            }}
              onMouseEnter={e => { e.currentTarget.style.color = P.bright; e.currentTarget.style.borderBottomColor = P.lineStrong; }}
              onMouseLeave={e => { e.currentTarget.style.color = P.soft; e.currentTarget.style.borderBottomColor = "transparent"; }}
            >{l.label}</a>
          ))}
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, marginInlineStart: "auto" }}>
          <div style={{
            display: "inline-flex", gap: 1, padding: 3, borderRadius: 999,
            background: "rgba(255,255,255,.04)",
            border: `1px solid rgba(201,168,76,.22)`,
          }}>
            {["ar", "he"].map(code => (
              <button key={code} onClick={() => setLang(code)} style={{
                padding: "4px 12px", borderRadius: 999, border: "none",
                background: lang === code
                  ? `linear-gradient(135deg,${P.cream},${P.bright},${P.gold})`
                  : "transparent",
                color: lang === code ? P.bg : C.goldDim,
                fontSize: 10.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                letterSpacing: ".3px",
              }}>{code === "ar" ? "AR" : "HE"}</button>
            ))}
          </div>
          <button onClick={onEnterPortal} className="gold-btn dawa-topnav-cta" style={{
            padding: "8px 16px", fontSize: 12.5, fontWeight: 800, whiteSpace: "nowrap",
          }}>{t("nav_portal")}</button>
          <button onClick={() => setMenuOpen(!menuOpen)} aria-label="menu"
            className="dawa-topnav-burger"
            style={{
              display: "none", background: "transparent", border: `1px solid rgba(201,168,76,.30)`,
              color: P.bright, fontSize: 18, cursor: "pointer",
              width: 38, height: 38, borderRadius: 10, padding: 0,
              alignItems: "center", justifyContent: "center",
            }}>{menuOpen ? "✕" : "☰"}</button>
        </div>
      </div>

      {menuOpen && (
        <div className="dawa-topnav-mobile" style={{
          padding: "8px 22px 18px",
          borderTop: `1px solid rgba(201,168,76,.15)`,
          background: "rgba(7,7,10,.97)",
        }}>
          {links.map(l => (
            <a key={l.id} href={`#${l.id}`} onClick={(e) => handleScroll(e, l.id)} style={{
              display: "block", padding: "14px 0",
              color: P.soft, textDecoration: "none",
              fontSize: 15, fontWeight: 700, fontFamily: "inherit",
              borderBottom: `1px solid rgba(201,168,76,.08)`,
            }}>{l.label}</a>
          ))}
        </div>
      )}
    </header>
  );
}

// Local stylesheet — ambient CSS loops (cheaper than JS for infinite motion),
// responsive grids, and the reduced-motion kill-switch. NOTE: no reveal
// classes hide content here; GSAP owns initial states so a missing library
// can never trap the page invisible.
const PageStyles = () => (
  <style>{`
    html { scroll-behavior: smooth; scroll-padding-top: 78px; }

    @keyframes dawa-float-y { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
    @keyframes dawa-phone-float { 0%,100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-8px) rotate(-.5deg); } }
    @keyframes dawa-shimmer { 0% { background-position: -240px 0; } 100% { background-position: 240px 0; } }
    @keyframes dawa-hero-shimmer { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
    @keyframes dawa-gleam { 0%,100% { opacity: .9; transform: rotate(45deg) scale(1); } 50% { opacity: .45; transform: rotate(45deg) scale(1.3); } }

    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      .dawa-land *, .dawa-land *::before, .dawa-land *::after {
        animation: none !important;
        transition-duration: .01ms !important;
      }
    }

    @media (max-width: 900px) {
      .dawa-topnav-links { display: none !important; }
      .dawa-topnav-burger { display: inline-flex !important; }
    }
    @media (max-width: 480px) {
      .dawa-topnav-cta { display: none !important; }
    }

    @media (max-width: 820px) {
      .dawa-about-grid { grid-template-columns: 1fr !important; gap: 48px !important; }
      .dawa-showcase-grid { grid-template-columns: 1fr !important; gap: 56px !important; }
      .dawa-footer-grid { grid-template-columns: 1fr 1fr !important; gap: 36px !important; }
    }
    @media (max-width: 540px) {
      .dawa-footer-grid { grid-template-columns: 1fr !important; }
    }
  `}</style>
);

export function LandingPage({ onEnterPortal, t, lang, setLang }) {
  const rootRef = useRef(null);
  const scrolled = useScrolledPast(60);
  const gsapReady = useGsap();
  useLandingMotion(rootRef, gsapReady, lang);

  return (
    <div ref={rootRef} className="dawa-land" style={{ background: P.bg, color: P.cream, overflowX: "hidden", position: "relative" }}>
      <PageStyles />
      <GrainVignette />
      <TopNav t={t} lang={lang} setLang={setLang} onEnterPortal={onEnterPortal} scrolled={scrolled} />

      <HeroSection t={t} lang={lang} onEnterPortal={onEnterPortal} />
      <Divider />
      <AboutSection      t={t} lang={lang} />
      <Divider />
      <FeaturesSection   t={t} />
      <PersonalizationSection t={t} onEnterPortal={onEnterPortal} />
      <Divider />
      <ServicesSection   t={t} onEnterPortal={onEnterPortal} />
      <ProcessSection    t={t} />
      <ShowcaseSection   t={t} onEnterPortal={onEnterPortal} />
      <PricingSection    t={t} onEnterPortal={onEnterPortal} />
      <FaqSection        t={t} />
      <CtaSection        t={t} onEnterPortal={onEnterPortal} />
      <FooterSection     t={t} lang={lang} onEnterPortal={onEnterPortal} />
    </div>
  );
}

// Fixed film grain + vignette — the atmosphere layer that makes flat black
// feel like paper stock. Pure decoration: pointer-events none, very low
// opacity, zero animation cost (static tiled SVG noise).
function GrainVignette() {
  return (
    <>
      <div aria-hidden="true" style={{
        position: "fixed", inset: 0, zIndex: 90, pointerEvents: "none",
        opacity: 0.05,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        backgroundSize: "160px 160px",
      }} />
      <div aria-hidden="true" style={{
        position: "fixed", inset: 0, zIndex: 89, pointerEvents: "none",
        background: "radial-gradient(ellipse 130% 100% at 50% 38%, transparent 58%, rgba(0,0,0,.42) 100%)",
      }} />
    </>
  );
}

// Engraved divider — rule · diamond · rule.
function Divider() {
  return (
    <div aria-hidden="true" style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      gap: 14, padding: "0 24px",
    }}>
      <span style={{ height: 1, flex: "0 1 240px", background: `linear-gradient(90deg, transparent, ${P.lineStrong})` }} />
      <span style={{ width: 5, height: 5, transform: "rotate(45deg)", border: `1px solid rgba(201,168,76,.55)`, animation: "dawa-gleam 3.4s ease-in-out infinite" }} />
      <span style={{ height: 1, flex: "0 1 240px", background: `linear-gradient(90deg, ${P.lineStrong}, transparent)` }} />
    </div>
  );
}

// Oversized ghosted numeral behind a section head — the editorial signature.
function GhostNumeral({ n }) {
  return (
    <div aria-hidden="true" style={{
      position: "absolute", top: -30, insetInlineStart: "50%",
      transform: "translateX(-50%)",
      fontFamily: "'Amiri',serif", fontWeight: 900,
      fontSize: "clamp(110px,18vw,200px)", lineHeight: 1,
      color: P.ghost, pointerEvents: "none", userSelect: "none", zIndex: 0,
    }}>{n}</div>
  );
}

// ── HERO ────────────────────────────────────────────────────────────────────
function HeroSection({ t, lang, onEnterPortal }) {
  const trustChips = t("trust_chips") || [];

  return (
    <section id="hero" data-hero style={{
      minHeight: "100vh", position: "relative",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      textAlign: "center",
      padding: "120px 24px 140px",
      overflow: "hidden",
    }}>
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0,
        background:
          `radial-gradient(ellipse 70% 55% at 50% 30%, ${P.glow} 0%, transparent 60%),` +
          `radial-gradient(ellipse 60% 50% at 50% 90%, rgba(201,168,76,.06) 0%, transparent 70%)`,
      }} />
      <div data-hero-rings aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {[300, 480, 680, 920, 1180].map((s, i) => (
          <div key={i} style={{
            position: "absolute", width: s, height: s, borderRadius: "50%",
            border: `1px solid rgba(201,168,76,${0.06 - i * 0.008})`,
            top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          }} />
        ))}
      </div>

      <div aria-hidden="true" style={{
        position: "absolute", top: "20%", insetInlineEnd: "11%", opacity: 0.5,
        animation: "dawa-float-y 6s 1s ease-in-out infinite",
      }}>
        <span style={{ fontSize: 30, color: P.gold }}>✦</span>
      </div>
      <div aria-hidden="true" style={{
        position: "absolute", bottom: "24%", insetInlineStart: "9%", opacity: 0.35,
        animation: "dawa-float-y 7.5s .6s ease-in-out infinite",
      }}>
        <span style={{ fontSize: 20, color: P.gold }}>❀</span>
      </div>

      <div data-hero-content style={{ position: "relative" }}>
        <div data-h="eyebrow" style={{
          fontSize: 11, color: P.bright, fontWeight: 800,
          letterSpacing: 5, textTransform: "uppercase",
          marginBottom: 30,
          display: "inline-flex", alignItems: "center", gap: 16,
        }}>
          <span data-hrule style={{ width: 44, height: 1, background: `linear-gradient(90deg, transparent, ${P.gold})` }} />
          {t("landing_eyebrow")}
          <span data-hrule style={{ width: 44, height: 1, background: `linear-gradient(90deg, ${P.gold}, transparent)` }} />
        </div>

        <div data-h="logo" style={{ marginBottom: 26, display: "block" }}>
          <BrandLogo size={110} withText />
        </div>

        <h1 data-h="title" style={{
          fontSize: "clamp(64px,12.5vw,150px)", fontWeight: 900,
          fontFamily: "'Amiri',serif", lineHeight: 1.18,
          background: `linear-gradient(135deg,${P.cream} 0%,${P.bright} 35%,${P.gold} 70%,#a0832c 100%)`,
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          backgroundClip: "text", marginBottom: 12,
          letterSpacing: 0, paddingBlock: 8,
          textShadow: "0 0 90px rgba(201,168,76,.30)",
        }}>{lang === "he" ? "דעוה" : "دعوة"}</h1>

        <div aria-hidden="true" style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 30,
        }}>
          <span style={{ height: 1, width: 90, background: `linear-gradient(90deg, transparent, ${P.lineStrong})` }} />
          <span style={{ width: 4, height: 4, transform: "rotate(45deg)", background: P.gold, opacity: .8 }} />
          <span style={{ height: 1, width: 90, background: `linear-gradient(90deg, ${P.lineStrong}, transparent)` }} />
        </div>

        <p data-h="tag1" style={{
          fontSize: "clamp(20px,3vw,30px)", color: "#ffffff",
          maxWidth: 720, margin: "0 auto 16px",
          lineHeight: 1.7, fontWeight: 500,
          fontFamily: "'Amiri',serif",
        }}>{t("hero_tagline1")}</p>

        <p data-h="tag2" style={{
          fontSize: "clamp(14px,1.8vw,17px)", color: P.soft,
          maxWidth: 560, margin: "0 auto 44px",
          lineHeight: 1.85, fontStyle: "italic",
          fontFamily: "'Amiri',serif",
        }}>{t("hero_tagline2")} · {t("hero_brand_pitch")}</p>

        <div data-h="ctas" style={{
          display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center",
          marginBottom: 52,
        }}>
          <button data-magnetic className="gold-btn" style={{ fontSize: 16, padding: "16px 40px" }} onClick={onEnterPortal}>
            {t("hero_cta_start")}
          </button>
          <a href="#how" className="ghost-btn" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
            {t("portal_cta_secondary")}
          </a>
        </div>

        <div data-h="chips" style={{
          display: "flex", gap: "10px 26px", flexWrap: "wrap", justifyContent: "center",
          maxWidth: 760, margin: "0 auto",
        }}>
          {trustChips.map((chip) => (
            <span key={chip} style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              color: P.cream, fontSize: 12.5, fontWeight: 600, letterSpacing: ".4px",
            }}>
              <span aria-hidden="true" style={{ width: 4, height: 4, transform: "rotate(45deg)", background: P.bright, opacity: .85, flexShrink: 0 }} />
              {chip}
            </span>
          ))}
        </div>
      </div>

      <div data-h="cue" style={{
        position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
        animation: "dawa-hero-shimmer 2.4s ease-in-out infinite",
      }}>
        <span style={{
          fontFamily: "'Amiri',serif", fontStyle: "italic",
          fontSize: 11, color: P.gold, letterSpacing: 3, textTransform: "uppercase",
        }}>{t("scroll_cue")}</span>
        <span style={{
          width: 1, height: 40, display: "block",
          background: `linear-gradient(180deg, ${P.gold} 0%, transparent 100%)`,
        }} />
      </div>
    </section>
  );
}

// ── Shared section header — engraved: flanked eyebrow, serif title, rule ────
function SectionHead({ eyebrow, title, sub }) {
  return (
    <div data-lr style={{ position: "relative", textAlign: "center", marginBottom: 64, maxWidth: 720, marginInline: "auto", zIndex: 1 }}>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 14,
        fontSize: 11, color: P.bright, fontWeight: 800,
        letterSpacing: 4.5, textTransform: "uppercase", marginBottom: 18,
        opacity: 0.9,
      }}>
        <span style={{ width: 30, height: 1, background: `linear-gradient(90deg, transparent, ${P.gold})` }} />
        {eyebrow}
        <span style={{ width: 30, height: 1, background: `linear-gradient(90deg, ${P.gold}, transparent)` }} />
      </div>
      <h2 style={{
        fontFamily: "'Amiri',serif", fontWeight: 700,
        fontSize: "clamp(38px,5.5vw,64px)", lineHeight: 1.3,
        ...GOLD_TEXT,
        marginBottom: 14, letterSpacing: 0, paddingBlock: 6,
      }}>{title}</h2>
      <div aria-hidden="true" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ height: 1, width: 56, background: `linear-gradient(90deg, transparent, ${P.lineStrong})` }} />
        <span style={{ width: 4, height: 4, transform: "rotate(45deg)", background: P.gold, opacity: .8 }} />
        <span style={{ height: 1, width: 56, background: `linear-gradient(90deg, ${P.lineStrong}, transparent)` }} />
      </div>
      {sub && (
        <p style={{
          color: P.soft, fontSize: 15,
          fontFamily: "'Amiri',serif", fontStyle: "italic",
          lineHeight: 1.85, paddingTop: 2,
        }}>{sub}</p>
      )}
    </div>
  );
}

// ── ABOUT — editorial split ─────────────────────────────────────────────────
function AboutSection({ t, lang }) {
  return (
    <section id="about" style={{ padding: "150px 24px", maxWidth: 1100, margin: "0 auto", position: "relative" }}>
      <GhostNumeral n="01" />
      <div className="dawa-about-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center", position: "relative", zIndex: 1 }}>
        <div data-lr>
          <div style={{
            fontSize: 11, color: P.bright, fontWeight: 800,
            letterSpacing: 4.5, textTransform: "uppercase", marginBottom: 20, opacity: 0.9,
          }}>{t("about_eyebrow")}</div>
          <h2 style={{
            fontFamily: "'Amiri',serif", fontWeight: 700,
            fontSize: "clamp(36px,4.4vw,56px)", lineHeight: 1.35,
            color: "#ffffff", marginBottom: 24,
            letterSpacing: 0, paddingBlock: 6,
          }}>{t("about_title")}</h2>
          <div aria-hidden="true" style={{ width: 120, height: 1, background: `linear-gradient(90deg, ${P.lineStrong}, transparent)` }} />
        </div>
        <div data-lr style={{
          position: "relative", aspectRatio: "1/1",
          maxWidth: 420, marginInlineStart: "auto",
          display: "flex", alignItems: "center", justifyContent: "center",
          border: `1px solid ${P.line}`, borderRadius: "50%",
        }}>
          <div aria-hidden="true" style={{
            position: "absolute", inset: 22, borderRadius: "50%",
            border: `1px solid rgba(201,168,76,.10)`,
          }} />
          <div style={{ position: "relative" }}>
            <BrandLogo size={190} withText />
          </div>
          {[
            { ic: "✦", top: "8%",  end: "12%",  delay: 0   },
            { ic: "♛", top: "72%", end: "6%",   delay: 1.5 },
            { ic: "♥", top: "52%", start: "2%", delay: 0.8 },
            { ic: "❀", top: "14%", start: "9%", delay: 2.2 },
          ].map((g, i) => (
            <span key={i} style={{
              position: "absolute",
              top: g.top,
              insetInlineEnd: g.end || "auto", insetInlineStart: g.start || "auto",
              fontSize: 21, color: P.gold, opacity: 0.65,
              animation: `dawa-float-y 4s ${g.delay}s ease-in-out infinite`,
            }}>{g.ic}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── FEATURES — ruled editorial blocks ───────────────────────────────────────
function FeaturesSection({ t }) {
  const [hover, setHover] = useState(null);
  const items = [
    { icon: "✉",  title: t("feat1_title"), body: t("feat1_body"), bullets: t("feat1_bullets") || [] },
    { icon: "📱", title: t("feat2_title"), body: t("feat2_body"), bullets: t("feat2_bullets") || [] },
    { icon: "⏳", title: t("feat3_title"), body: t("feat3_body"), bullets: [] },
    { icon: "💎", title: t("feat4_title"), body: t("feat4_body"), bullets: [] },
  ];
  return (
    <section style={{ padding: "130px 24px", maxWidth: 1100, margin: "0 auto", position: "relative" }}>
      <GhostNumeral n="02" />
      <SectionHead eyebrow={t("features_eyebrow")} title={t("features_title")} sub={t("features_sub")} />
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "56px 44px", position: "relative", zIndex: 1,
      }}>
        {items.map((f, i) => (
          <div key={i}
            data-lr
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{
              borderTop: `1px solid ${hover === i ? P.lineStrong : P.line}`,
              paddingTop: 26,
              transition: "transform .5s cubic-bezier(.2,.95,.25,1.1), border-color .35s ease",
              transform: hover === i ? "translateY(-4px)" : "translateY(0)",
              cursor: "default",
            }}>
            <div style={{
              display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16,
            }}>
              <span style={{
                fontFamily: "'Amiri',serif", fontWeight: 900, fontSize: 15,
                color: P.bright, letterSpacing: 2, opacity: 0.9,
              }}>{String(i + 1).padStart(2, "0")}</span>
              <span style={{
                fontSize: 24, color: P.gold,
                opacity: hover === i ? 1 : 0.75,
                transition: "opacity .3s",
              }}>{f.icon}</span>
            </div>
            <h3 style={{
              fontFamily: "'Amiri',serif", fontWeight: 700,
              fontSize: 23, color: "#ffffff", marginBottom: 14, lineHeight: 1.5,
            }}>{f.title}</h3>
            <p style={{
              fontSize: 14, color: P.soft, lineHeight: 1.95, maxWidth: "36ch",
            }}>{f.body}</p>
            {f.bullets.length > 0 && (
              <ul style={{
                marginTop: 14, paddingInlineStart: 18,
                color: P.soft, fontSize: 13, lineHeight: 1.9,
                listStyle: "disc", maxWidth: "36ch",
              }}>
                {f.bullets.map((b, bi) => (
                  <li key={bi} style={{ marginBottom: 6 }}>{b}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── PERSONALIZATION — engraved framed manifesto ─────────────────────────────
function PersonalizationSection({ t, onEnterPortal }) {
  const lines = t("pers_body_full") || [];
  return (
    <section style={{ padding: "130px 24px", maxWidth: 880, margin: "0 auto", position: "relative" }}>
      <GhostNumeral n="03" />
      <div data-lr style={{
        position: "relative",
        padding: 10,
        border: `1px solid ${P.lineStrong}`,
        borderRadius: 4,
        zIndex: 1,
      }}>
        <div style={{
          border: `1px solid ${P.line}`,
          borderRadius: 2,
          padding: "clamp(40px, 6vw, 72px) clamp(24px, 5vw, 64px)",
          textAlign: "center",
          background: "linear-gradient(180deg, rgba(201,168,76,.04), transparent 55%)",
        }}>
          <span aria-hidden="true" style={{ display: "block", fontSize: 26, color: P.gold, opacity: .7, marginBottom: 14 }}>❦</span>
          <h2 style={{
            fontFamily: "'Amiri',serif", fontWeight: 700,
            fontSize: "clamp(30px,4.6vw,50px)", lineHeight: 1.3,
            ...GOLD_TEXT,
            marginBottom: 36, letterSpacing: 0, paddingBlock: 6,
          }}>{t("pers_title")}</h2>
          <div style={{ color: P.soft, fontSize: 15, lineHeight: 2.1, marginBottom: 40 }}>
            {lines.map((line, i) => {
              const isBullet = typeof line === "string" && line.startsWith("•");
              const isLast = i === lines.length - 1;
              return (
                <p key={i} style={{
                  marginBottom: isBullet ? 6 : 18,
                  textAlign: isBullet ? "start" : "center",
                  fontWeight: isLast ? 700 : 400,
                  color: isLast ? P.cream : P.soft,
                  fontFamily: isLast ? "'Amiri',serif" : "inherit",
                  fontSize: isLast ? 17 : 15,
                  maxWidth: isBullet ? "60ch" : "none",
                  marginInline: isBullet ? "auto" : 0,
                }}>{line}</p>
              );
            })}
          </div>
          <div style={{ textAlign: "center" }}>
            <button data-magnetic className="gold-btn" onClick={onEnterPortal}>{t("pers_cta")}</button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── SERVICES — paper vs digital, two ruled panels ───────────────────────────
function ServicesSection({ t, onEnterPortal }) {
  const tab1Lines = t("delivery_body_lines") || [];
  const tab2Bullets = t("services_tab2_bullets") || [];
  return (
    <section id="services" style={{ padding: "130px 24px", maxWidth: 1000, margin: "0 auto", position: "relative" }}>
      <GhostNumeral n="04" />
      <SectionHead
        eyebrow={t("services_label")}
        title={t("services_title")}
        sub={t("services_subtitle")}
      />
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))",
        gap: 28, position: "relative", zIndex: 1,
      }}>
        {/* ── الدعوات الورقية (Paper) ── */}
        <div data-lr style={{
          padding: "42px 34px", borderRadius: 4,
          background: "linear-gradient(180deg, rgba(201,168,76,.05), transparent 60%)",
          border: `1px solid rgba(201,168,76,.30)`,
          borderTop: `2px solid rgba(201,168,76,.55)`,
          transition: "transform .5s cubic-bezier(.2,.95,.25,1.1), border-color .35s ease, box-shadow .35s ease",
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-6px)"; e.currentTarget.style.borderColor = "rgba(201,168,76,.55)"; e.currentTarget.style.boxShadow = "0 28px 60px -24px rgba(0,0,0,.55), 0 0 50px rgba(201,168,76,.12)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = "rgba(201,168,76,.30)"; e.currentTarget.style.boxShadow = "none"; }}
        >
          <div style={{ fontSize: 38, marginBottom: 18, color: P.gold }}>✉</div>
          <div style={{ fontSize: 11, color: P.bright, letterSpacing: 3.5, textTransform: "uppercase", fontWeight: 800, marginBottom: 10 }}>
            {t("delivery_subtitle")}
          </div>
          <h3 style={{
            fontFamily: "'Amiri',serif", color: P.cream, fontWeight: 700,
            fontSize: 26, marginBottom: 14, lineHeight: 1.45,
          }}>{t("services_tab1_label")}</h3>
          <div style={{ color: P.soft, fontSize: 14, lineHeight: 1.9, marginBottom: 20 }}>
            {t("delivery_title")}
          </div>
          <ul style={{ color: P.soft, fontSize: 14, lineHeight: 1.95, listStyle: "none", padding: 0, margin: 0 }}>
            {tab1Lines.map((l, i) => (
              <li key={i} style={{ marginBottom: 8, borderBottom: i < tab1Lines.length - 1 ? `1px solid rgba(201,168,76,.08)` : "none", paddingBottom: 8 }}>
                <span style={{ color: P.gold, marginInlineEnd: 8 }}>✓</span>{l}
              </li>
            ))}
          </ul>
        </div>

        {/* ── الدعوات الرقمية (Digital) ── */}
        <div data-lr style={{
          padding: "42px 34px", borderRadius: 4,
          background: "linear-gradient(180deg, rgba(155,75,212,.07), transparent 60%)",
          border: `1px solid rgba(155,75,212,.38)`,
          borderTop: `2px solid rgba(155,75,212,.65)`,
          transition: "transform .5s cubic-bezier(.2,.95,.25,1.1), border-color .35s ease, box-shadow .35s ease",
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-6px)"; e.currentTarget.style.borderColor = "rgba(192,132,252,.6)"; e.currentTarget.style.boxShadow = "0 28px 60px -24px rgba(0,0,0,.55), 0 0 50px rgba(155,75,212,.16)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = "rgba(155,75,212,.38)"; e.currentTarget.style.boxShadow = "none"; }}
        >
          <div style={{ fontSize: 38, marginBottom: 18 }}>📱</div>
          <div style={{ fontSize: 11, color: P.violetSoft, letterSpacing: 3.5, textTransform: "uppercase", fontWeight: 800, marginBottom: 10 }}>
            DIGITAL
          </div>
          <h3 style={{
            fontFamily: "'Amiri',serif", color: P.cream, fontWeight: 700,
            fontSize: 26, marginBottom: 14, lineHeight: 1.45,
          }}>{t("services_tab2_label")}</h3>
          <div style={{ color: P.soft, fontSize: 14, lineHeight: 1.9, marginBottom: 12, fontWeight: 700 }}>
            {t("services_tab2_title")}
          </div>
          <p style={{ color: P.soft, fontSize: 14, lineHeight: 1.9, marginBottom: 20 }}>
            {t("services_tab2_body")}
          </p>
          <ul style={{ color: P.soft, fontSize: 14, lineHeight: 1.95, listStyle: "none", padding: 0, margin: 0 }}>
            {tab2Bullets.map((b, i) => (
              <li key={i} style={{ marginBottom: 8, borderBottom: i < tab2Bullets.length - 1 ? "1px solid rgba(155,75,212,.10)" : "none", paddingBottom: 8 }}>
                <span style={{ color: P.violetSoft, marginInlineEnd: 8 }}>✓</span>{b}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ── PROCESS — scroll-drawn vertical timeline ────────────────────────────────
function ProcessSection({ t }) {
  const steps = t("process_steps") || [];
  return (
    <section id="how" data-process style={{ padding: "150px 24px", maxWidth: 1000, margin: "0 auto", position: "relative" }}>
      <GhostNumeral n="05" />
      <SectionHead eyebrow={t("process_eyebrow")} title={t("process_title")} />
      <div style={{ position: "relative", paddingInlineStart: 56, zIndex: 1 }}>
        <div data-process-line style={{
          position: "absolute", insetInlineStart: 20, top: 14, bottom: 14, width: 1,
          background: `linear-gradient(180deg, transparent, rgba(201,168,76,.5) 8%, rgba(201,168,76,.5) 92%, transparent)`,
        }} />
        {steps.map((s, i) => (
          <div key={i} data-lr style={{
            position: "relative", paddingBlock: 26,
            borderBottom: i < steps.length - 1 ? `1px solid rgba(201,168,76,.10)` : "none",
          }}>
            <div style={{
              position: "absolute", insetInlineStart: -50, top: 24,
              width: 42, height: 42, borderRadius: "50%",
              background: P.bg,
              border: `1px solid rgba(201,168,76,.45)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'Amiri',serif", fontWeight: 900,
              color: P.bright, fontSize: 17,
              boxShadow: `0 0 0 4px ${P.bg}, 0 0 24px rgba(240,200,76,.18)`,
            }}>{i + 1}</div>
            <div style={{ fontSize: 24, color: P.gold, marginBottom: 8, opacity: 0.85 }}>{s.ic}</div>
            <h3 style={{
              fontFamily: "'Amiri',serif", fontWeight: 700,
              fontSize: 25, color: "#ffffff", marginBottom: 12, lineHeight: 1.4,
            }}>{s.title}</h3>
            <p style={{
              fontSize: 14.5, color: P.soft, lineHeight: 1.95, maxWidth: "52ch",
            }}>{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── SHOWCASE — pinned phone scene (desktop) / plain reveal (mobile) ─────────
function ShowcaseSection({ t, onEnterPortal }) {
  const bullets = t("showcase_bullets") || [];
  return (
    <section data-showcase style={{ padding: "150px 24px", maxWidth: 1100, margin: "0 auto", position: "relative" }}>
      <GhostNumeral n="06" />
      <div className="dawa-showcase-grid" style={{
        display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 56, alignItems: "center",
        perspective: 1100, position: "relative", zIndex: 1,
      }}>
        <div style={{ position: "relative" }}>
          <div data-phone style={{
            position: "relative",
            width: "100%", maxWidth: 360,
            aspectRatio: "9/19.5",
            margin: "0 auto",
            borderRadius: 44,
            background: "linear-gradient(145deg, #1a1a22, #0a0a10)",
            padding: 12,
            willChange: "transform",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,.06), " +
              "0 40px 80px -20px rgba(0,0,0,.7), " +
              "0 0 0 1px rgba(201,168,76,.22), " +
              "0 0 80px rgba(201,168,76,.18)",
            animation: "dawa-phone-float 6s ease-in-out infinite",
          }}>
            <div style={{
              width: "100%", height: "100%",
              borderRadius: 34,
              background: "linear-gradient(180deg, #07070a, #0c0c11)",
              padding: "32px 16px 16px",
              display: "flex", flexDirection: "column", gap: 12,
              position: "relative", overflow: "hidden",
            }}>
              <div style={{
                position: "absolute", top: 8, left: 0, right: 0,
                display: "flex", justifyContent: "space-between",
                padding: "0 28px",
                fontSize: 10, color: C.goldDim, fontWeight: 700,
              }}>
                <span>9:41</span>
                <span>● ● ●</span>
              </div>
              <div style={{
                position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)",
                width: 80, height: 22, borderRadius: 12, background: "#0a0a10",
              }} />
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 9, color: P.dim, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 800, marginBottom: 6 }}>
                  {t("dash_welcome")}
                </div>
                <div style={{ fontFamily: "'Amiri',serif", fontWeight: 900, color: P.bright, fontSize: 18 }}>
                  {t("dash_subtitle")}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { v: 187, l: t("stat_delivered"), c: "#4cc97a" },
                  { v: 23,  l: t("stat_enroute"),   c: C.blue },
                ].map(s => (
                  <div key={s.l} style={{
                    background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)",
                    borderRadius: 10, padding: "10px 12px",
                  }}>
                    <div data-stat={s.v} style={{ fontFamily: "'Amiri',serif", color: s.c, fontSize: 22, fontWeight: 900, lineHeight: 1 }}>{s.v}</div>
                    <div style={{ fontSize: 9, color: P.dim, marginTop: 4, letterSpacing: 1, textTransform: "uppercase" }}>{s.l}</div>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 9, color: P.dim, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>{t("progress_label")}</span>
                  <span style={{ fontSize: 10, color: P.bright, fontWeight: 800 }}>89%</span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,.04)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: "89%",
                    background: `linear-gradient(90deg,${P.gold},${P.bright},${P.gold})`,
                    backgroundSize: "200% 100%",
                    borderRadius: 999,
                    animation: "dawa-shimmer 3s linear infinite",
                  }} />
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                {[
                  { n: "أحمد محمد", s: "✓", c: "#4cc97a" },
                  { n: "ليلى سعيد", s: "🚗", c: C.blue },
                  { n: "يوسف خالد", s: "⌛", c: C.goldDim },
                ].map((g, i) => (
                  <div key={i} style={{
                    display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 8, alignItems: "center",
                    padding: "7px 9px",
                    background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)",
                    borderRadius: 8,
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%",
                      background: "rgba(201,168,76,.12)",
                      border: "1px solid rgba(201,168,76,.30)",
                      color: P.gold,
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10,
                    }}>✦</div>
                    <div style={{ fontSize: 10.5, color: C.goldLight, fontWeight: 700 }}>{g.n}</div>
                    <div style={{ fontSize: 11, color: g.c }}>{g.s}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <span aria-hidden="true" style={{
            position: "absolute", top: "10%", insetInlineEnd: 8,
            fontSize: 24, color: P.gold, opacity: 0.55,
            animation: "dawa-float-y 5s ease-in-out infinite",
          }}>✦</span>
          <span aria-hidden="true" style={{
            position: "absolute", bottom: "12%", insetInlineStart: 8,
            fontSize: 18, color: P.gold, opacity: 0.45,
            animation: "dawa-float-y 7s 1s ease-in-out infinite",
          }}>♥</span>
        </div>

        <div data-showcase-copy>
          <div style={{
            fontSize: 11, color: P.bright, fontWeight: 800,
            letterSpacing: 4.5, textTransform: "uppercase",
            marginBottom: 20, opacity: 0.9,
          }}>{t("showcase_eyebrow")}</div>
          <h2 style={{
            fontFamily: "'Amiri',serif", fontWeight: 700,
            fontSize: "clamp(36px,4.4vw,56px)", lineHeight: 1.35,
            color: "#ffffff", marginBottom: 24, letterSpacing: 0, paddingBlock: 6,
          }}>{t("showcase_title")}</h2>
          <p style={{ fontSize: 16, color: P.soft, lineHeight: 1.95, marginBottom: 30, maxWidth: "44ch" }}>
            {t("showcase_body")}
          </p>
          <ul style={{ listStyle: "none", padding: 0, marginBottom: 30 }}>
            {bullets.map((b, i) => (
              <li key={i} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "11px 0",
                borderBottom: i < bullets.length - 1 ? `1px solid rgba(201,168,76,.10)` : "none",
                color: P.cream, fontSize: 15, fontFamily: "'Amiri',serif",
              }}>
                <span aria-hidden="true" style={{
                  width: 5, height: 5, transform: "rotate(45deg)",
                  background: `linear-gradient(135deg,${P.bright},${P.gold})`,
                  boxShadow: "0 0 8px rgba(240,200,76,.5)",
                  flexShrink: 0,
                }} />
                {b}
              </li>
            ))}
          </ul>
          <button data-magnetic className="gold-btn" onClick={onEnterPortal}>{t("portal_cta_inline")}</button>
        </div>
      </div>
    </section>
  );
}

// ── PRICING — Physical (top row) + Digital (bottom row) ruled panels ────────
function PricingSection({ t, onEnterPortal }) {
  return (
    <section id="pricing" style={{ padding: "150px 24px", maxWidth: 1000, margin: "0 auto", position: "relative" }}>
      <GhostNumeral n="07" />
      <SectionHead eyebrow={t("pricing_label")} title={t("pricing_title")} sub={t("pricing_subtitle")} />
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))",
        gap: 28, position: "relative", zIndex: 1,
      }}>
        {/* ── Card 1: المكاتيب الفاخرة (Physical luxury — antique gold) ── */}
        <div data-lr style={{
          position: "relative", padding: "42px 34px", borderRadius: 4,
          background: "linear-gradient(180deg, rgba(184,132,60,.07), transparent 55%)",
          border: "1px solid rgba(212,168,71,.35)",
          borderTop: "2px solid rgba(212,168,71,.6)",
          transition: "transform .5s cubic-bezier(.2,.95,.25,1.1), border-color .35s ease, box-shadow .35s ease",
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-6px)"; e.currentTarget.style.borderColor = "rgba(212,168,71,.6)"; e.currentTarget.style.boxShadow = "0 28px 60px -24px rgba(0,0,0,.55), 0 0 50px rgba(184,132,60,.16)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = "rgba(212,168,71,.35)"; e.currentTarget.style.boxShadow = "none"; }}
        >
          <div style={{ fontSize: 38, marginBottom: 18, color: "#e8c485" }}>✉</div>
          <div style={{ fontSize: 11, color: "#e8c485", letterSpacing: 3.5, textTransform: "uppercase", fontWeight: 800, marginBottom: 10 }}>LUXURY PRINT</div>
          <h3 style={{ fontFamily: "'Amiri',serif", color: "#ffe8c4", fontWeight: 700, fontSize: 27, marginBottom: 18, lineHeight: 1.4 }}>{t("price_phys1_label")}</h3>
          <div style={{ color: "#e0c8a0", fontSize: 14, lineHeight: 1.85, marginBottom: 20 }}>
            {t("price_phys1_sub")}
          </div>
          <ul style={{
            listStyle: "none", padding: 0, margin: "0 0 26px",
            color: "#e0c8a0", fontSize: 13, lineHeight: 1.95,
          }}>
            {(t("price_phys1_bullets") || []).map((b, bi) => (
              <li key={bi} style={{ marginBottom: 6 }}>
                <span style={{ color: "#e8c485", marginInlineEnd: 6 }}>✓</span>{b}
              </li>
            ))}
          </ul>
          <button className="ghost-btn" style={{ width: "100%" }} onClick={onEnterPortal}>{t("price_contact")}</button>
        </div>

        {/* ── Card 2: المكاتيب المميزة (Physical mid-tier — champagne gold) ── */}
        <div data-lr style={{
          position: "relative", padding: "42px 34px", borderRadius: 4,
          background: "linear-gradient(180deg, rgba(201,184,122,.06), transparent 55%)",
          border: "1px solid rgba(201,184,122,.32)",
          borderTop: "2px solid rgba(201,184,122,.55)",
          transition: "transform .5s cubic-bezier(.2,.95,.25,1.1), border-color .35s ease, box-shadow .35s ease",
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-6px)"; e.currentTarget.style.borderColor = "rgba(201,184,122,.55)"; e.currentTarget.style.boxShadow = "0 28px 60px -24px rgba(0,0,0,.55), 0 0 50px rgba(201,184,122,.14)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = "rgba(201,184,122,.32)"; e.currentTarget.style.boxShadow = "none"; }}
        >
          <div style={{ fontSize: 38, marginBottom: 18, color: "#d4c89a" }}>✦</div>
          <div style={{ fontSize: 11, color: "#d4c89a", letterSpacing: 3.5, textTransform: "uppercase", fontWeight: 800, marginBottom: 10 }}>SIGNATURE PRINT</div>
          <h3 style={{ fontFamily: "'Amiri',serif", color: "#f5edc4", fontWeight: 700, fontSize: 27, marginBottom: 12, lineHeight: 1.4 }}>{t("price_phys2_label")}</h3>
          <div style={{
            display: "inline-block",
            background: "linear-gradient(135deg, #c9b87a, #f0e4b8)",
            color: "#1a1408", padding: "5px 14px", borderRadius: 999,
            fontSize: 11.5, fontWeight: 900, letterSpacing: 0.8,
            boxShadow: "0 4px 14px rgba(201,184,122,.35)",
            marginBottom: 18,
          }}>{t("price_phys2_cheaper_badge")}</div>
          <div style={{ color: "#d4c894", fontSize: 14, lineHeight: 1.85, marginBottom: 20 }}>
            {t("price_phys2_sub")}
          </div>
          <ul style={{
            listStyle: "none", padding: 0, margin: "0 0 26px",
            color: "#d4c894", fontSize: 13, lineHeight: 1.95,
          }}>
            {(t("price_phys2_bullets") || []).map((b, bi) => (
              <li key={bi} style={{ marginBottom: 6 }}>
                <span style={{ color: "#c9b87a", marginInlineEnd: 6 }}>✓</span>{b}
              </li>
            ))}
          </ul>
          <button className="ghost-btn" style={{ width: "100%" }} onClick={onEnterPortal}>{t("price_contact")}</button>
        </div>

        {/* ── Card 3: PREMIUM digital ── */}
        <div data-lr style={{
          position: "relative", padding: "42px 34px", borderRadius: 4,
          background: "linear-gradient(180deg, rgba(201,168,76,.05), transparent 55%)",
          border: "1px solid rgba(201,168,76,.28)",
          borderTop: "2px solid rgba(201,168,76,.5)",
          transition: "transform .5s cubic-bezier(.2,.95,.25,1.1), border-color .35s ease, box-shadow .35s ease",
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-6px)"; e.currentTarget.style.borderColor = "rgba(201,168,76,.5)"; e.currentTarget.style.boxShadow = "0 28px 60px -24px rgba(0,0,0,.55), 0 0 50px rgba(201,168,76,.12)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = "rgba(201,168,76,.28)"; e.currentTarget.style.boxShadow = "none"; }}
        >
          <div style={{ fontSize: 38, marginBottom: 18, color: P.bright }}>✦</div>
          <div style={{ fontSize: 11, color: P.bright, letterSpacing: 3.5, textTransform: "uppercase", fontWeight: 800, marginBottom: 10 }}>PREMIUM</div>
          <h3 style={{ fontFamily: "'Amiri',serif", color: P.cream, fontWeight: 700, fontSize: 27, marginBottom: 18, lineHeight: 1.4 }}>{t("price_pkg1_label")}</h3>
          <div style={{
            fontFamily: "'Amiri',serif", fontWeight: 900,
            fontSize: 46, lineHeight: 1.25, marginBottom: 18,
            ...GOLD_TEXT,
            paddingBlock: 4,
          }}>{t("price_pkg1_price")}</div>
          <div style={{ color: P.soft, fontSize: 14, lineHeight: 1.85, marginBottom: 20 }}>
            {t("price_pkg1_sub")}
          </div>
          <ul style={{
            listStyle: "none", padding: 0, margin: "0 0 26px",
            color: P.soft, fontSize: 13, lineHeight: 1.95,
          }}>
            {(t("price_pkg1_bullets") || []).map((b, bi) => (
              <li key={bi} style={{ marginBottom: 6 }}>
                <span style={{ color: P.gold, marginInlineEnd: 6 }}>✓</span>{b}
              </li>
            ))}
          </ul>
          <button className="ghost-btn" style={{ width: "100%" }} onClick={onEnterPortal}>{t("price_contact")}</button>
        </div>

        {/* ── Card 4: VIP digital ── */}
        <div data-lr style={{
          position: "relative", padding: "42px 34px", borderRadius: 4,
          background: "linear-gradient(180deg, rgba(155,75,212,.08), transparent 55%)",
          border: `1px solid ${P.violet}`,
          borderTop: `2px solid ${P.violetSoft}`,
          boxShadow: "0 28px 70px -28px rgba(155,75,212,.45), 0 0 50px rgba(155,75,212,.12)",
          transition: "transform .5s cubic-bezier(.2,.95,.25,1.1), box-shadow .35s ease",
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-6px)"; e.currentTarget.style.boxShadow = "0 36px 80px -28px rgba(155,75,212,.55), 0 0 70px rgba(155,75,212,.2)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 28px 70px -28px rgba(155,75,212,.45), 0 0 50px rgba(155,75,212,.12)"; }}
        >
          <div style={{
            position: "absolute", top: -14, insetInlineStart: "50%", transform: "translateX(-50%)",
            background: `linear-gradient(135deg,${P.violet},${P.violetSoft})`, color: "#fff",
            padding: "6px 20px", borderRadius: 999, fontSize: 11, fontWeight: 900, whiteSpace: "nowrap",
            letterSpacing: 1.5, boxShadow: "0 6px 20px rgba(155,75,212,.4)",
          }}>{t("price_vip_badge")}</div>
          <div style={{ fontSize: 38, marginBottom: 18, color: P.violetSoft }}>♛</div>
          <div style={{ fontSize: 11, color: P.violetSoft, letterSpacing: 3.5, textTransform: "uppercase", fontWeight: 800, marginBottom: 10 }}>VIP ROYAL</div>
          <h3 style={{ fontFamily: "'Amiri',serif", color: P.cream, fontWeight: 700, fontSize: 27, marginBottom: 14, lineHeight: 1.4 }}>{t("price_vip_title")}</h3>
          <div style={{ color: P.soft, fontSize: 14, lineHeight: 1.85, marginBottom: 22 }}>
            {t("price_vip_body")}
          </div>
          <div style={{ marginBottom: 18, paddingTop: 16, borderTop: "1px solid rgba(192,132,252,.25)" }}>
            <div style={{
              fontFamily: "'Amiri',serif", fontWeight: 900,
              fontSize: 46, lineHeight: 1.2,
              background: `linear-gradient(135deg,#fff,${P.violetSoft},${P.violet})`,
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              paddingBlock: 2,
            }}>{t("price_pkg2_price")}</div>
            <div style={{ color: P.soft, fontSize: 13, lineHeight: 1.75, marginTop: 8, marginBottom: 14 }}>
              {t("price_pkg2_sub")}
            </div>
            <ul style={{
              listStyle: "none", padding: 0, margin: 0,
              color: P.soft, fontSize: 13, lineHeight: 1.9,
            }}>
              {(t("price_pkg2_bullets") || []).map((b, bi) => (
                <li key={bi} style={{ marginBottom: 6 }}>
                  <span style={{ color: P.violetSoft, marginInlineEnd: 6 }}>✓</span>{b}
                </li>
              ))}
            </ul>
          </div>
          <button className="gold-btn" style={{ width: "100%", marginTop: 8 }} onClick={onEnterPortal}>{t("price_contact")}</button>
        </div>
      </div>
    </section>
  );
}

// ── FAQ — minimal ruled accordion ───────────────────────────────────────────
function FaqSection({ t }) {
  const faqs = t("faqs") || [];
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" style={{ padding: "150px 24px", maxWidth: 820, margin: "0 auto", position: "relative" }}>
      <GhostNumeral n="08" />
      <div style={{ position: "relative", zIndex: 1 }}>
        <SectionHead eyebrow={t("faq_eyebrow")} title={t("faq_title")} />
        {faqs.map((f, i) => {
          const isOpen = open === i;
          return (
            <div key={i} data-lr style={{ borderBottom: `1px solid ${P.line}` }}>
              <button
                onClick={() => setOpen(isOpen ? -1 : i)}
                aria-expanded={isOpen}
                style={{
                  width: "100%", textAlign: "start",
                  background: "transparent", border: "none", padding: "26px 4px",
                  cursor: "pointer", display: "flex", alignItems: "center",
                  justifyContent: "space-between", gap: 18,
                  color: P.cream,
                  fontFamily: "'Amiri',serif", fontWeight: 700, fontSize: 19,
                  lineHeight: 1.5,
                  transition: "color .25s ease",
                }}
                onMouseEnter={e => e.currentTarget.style.color = "#ffffff"}
                onMouseLeave={e => e.currentTarget.style.color = P.cream}
              >
                <span style={{ flex: 1, display: "flex", alignItems: "baseline", gap: 14 }}>
                  <span aria-hidden="true" style={{
                    fontFamily: "'Amiri',serif", fontWeight: 900, fontSize: 13,
                    color: P.bright, opacity: .75, letterSpacing: 1, flexShrink: 0,
                  }}>{String(i + 1).padStart(2, "0")}</span>
                  {f.q}
                </span>
                <span style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: isOpen ? "rgba(201,168,76,.16)" : "transparent",
                  border: `1px solid rgba(201,168,76,.30)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: P.gold, fontSize: 18, fontWeight: 400,
                  transition: "transform .4s cubic-bezier(.2,.95,.25,1.1), background .25s ease",
                  transform: isOpen ? "rotate(45deg)" : "rotate(0)",
                  flexShrink: 0,
                }}>+</span>
              </button>
              <div style={{
                overflow: "hidden",
                maxHeight: isOpen ? 320 : 0,
                opacity: isOpen ? 1 : 0,
                transition: "max-height .55s cubic-bezier(.2,.7,.2,1), opacity .45s ease",
              }}>
                <p style={{
                  paddingBlock: "0 26px",
                  paddingInlineStart: 32, paddingInlineEnd: 50,
                  color: P.soft, fontSize: 15, lineHeight: 1.9,
                }}>{f.a}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── CTA — final conversion block ────────────────────────────────────────────
function CtaSection({ t, onEnterPortal }) {
  return (
    <section id="contact" data-cta style={{ padding: "150px 24px", maxWidth: 880, margin: "0 auto", textAlign: "center", position: "relative" }}>
      <div data-cta-glow aria-hidden="true" style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse 70% 60% at 50% 50%, rgba(201,168,76,.11), transparent 70%)`,
        pointerEvents: "none",
      }} />
      <div data-lr style={{ position: "relative" }}>
        <span aria-hidden="true" style={{ fontSize: 40, color: P.gold, display: "block", marginBottom: 20, opacity: 0.7 }}>✦</span>
        <h2 style={{
          fontFamily: "'Amiri',serif", fontWeight: 700,
          fontSize: "clamp(40px,6vw,72px)", lineHeight: 1.25,
          ...GOLD_TEXT,
          marginBottom: 24, letterSpacing: 0, paddingBlock: 6,
        }}>{t("cta_title")}</h2>
        <div aria-hidden="true" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 26 }}>
          <span style={{ height: 1, width: 70, background: `linear-gradient(90deg, transparent, ${P.lineStrong})` }} />
          <span style={{ width: 4, height: 4, transform: "rotate(45deg)", background: P.gold, opacity: .8 }} />
          <span style={{ height: 1, width: 70, background: `linear-gradient(90deg, ${P.lineStrong}, transparent)` }} />
        </div>
        <p style={{
          fontFamily: "'Amiri',serif", fontStyle: "italic",
          color: P.soft, fontSize: 17, lineHeight: 1.8,
          maxWidth: 600, marginInline: "auto", marginBottom: 38,
        }}>{t("cta_sub")}</p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <button data-magnetic className="gold-btn" style={{ fontSize: 16, padding: "16px 40px" }} onClick={onEnterPortal}>
            {t("hero_cta_start")}
          </button>
          <button className="ghost-btn" onClick={onEnterPortal}>{t("price_contact")}</button>
        </div>
      </div>
    </section>
  );
}

// ── FOOTER — multi-column ───────────────────────────────────────────────────
// Each footer column's items map by index to an action: scroll to section,
// open the portal, or navigate to a route.
const FOOTER_ACTIONS = {
  product:   [{ type: "scroll", target: "services" }, { type: "scroll", target: "pricing" }],
  company:   [{ type: "scroll", target: "about" },    { type: "scroll", target: "contact" }],
  resources: [{ type: "portal" },                      { type: "scroll", target: "faq" }],
  legal:     [{ type: "route",  target: "/terms" }],
};

function FooterSection({ t, lang, onEnterPortal }) {
  const cols = t("footer_cols") || {};
  const navigate = useNavigate();

  const handleAction = (action) => {
    if (!action) return;
    if (action.type === "scroll") {
      const el = document.getElementById(action.target);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (action.type === "portal") {
      onEnterPortal();
    } else if (action.type === "route") {
      navigate(action.target);
    }
  };

  const scrollToHero = () => {
    const el = document.getElementById("hero");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <footer style={{
      borderTop: `1px solid rgba(201,168,76,.14)`,
      padding: "80px 24px 40px",
      background: "linear-gradient(180deg, transparent, rgba(201,168,76,.02))",
    }}>
      <div style={{ maxWidth: 1100, marginInline: "auto" }}>
        <div data-lr className="dawa-footer-grid" style={{
          display: "grid",
          gridTemplateColumns: "1.4fr repeat(4, 1fr)",
          gap: 40, marginBottom: 60,
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <BrandLogo size={36} />
              <span style={{
                fontFamily: "'Amiri',serif", fontSize: 27, fontWeight: 700,
                ...GOLD_TEXT,
              }}>{lang === "he" ? "דעוה" : "دعوة"}</span>
            </div>
            <p style={{ color: P.soft, fontSize: 13, lineHeight: 1.85, maxWidth: "32ch", marginBottom: 20 }}>
              {t("footer_tagline")}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              {["✉", "📱", "♥", "✦"].map((g, i) => (
                <button key={i} onClick={scrollToHero} aria-label="back to top" style={{
                  width: 36, height: 36, borderRadius: "50%",
                  border: `1px solid rgba(201,168,76,.22)`,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  color: P.gold, fontSize: 14, background: "transparent",
                  cursor: "pointer", padding: 0, fontFamily: "inherit",
                  transition: "all .3s cubic-bezier(.2,.95,.25,1.1)",
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = P.gold; e.currentTarget.style.color = P.cream; e.currentTarget.style.transform = "translateY(-3px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(201,168,76,.22)"; e.currentTarget.style.color = P.gold; e.currentTarget.style.transform = "translateY(0)"; }}
                >{g}</button>
              ))}
            </div>
          </div>
          {Object.entries(cols).map(([k, col]) => (
            <div key={k}>
              <div style={{
                fontSize: 10.5, color: P.gold, fontWeight: 800,
                letterSpacing: 2.8, textTransform: "uppercase",
                marginBottom: 18, opacity: 0.85,
              }}>{col.title}</div>
              <ul style={{ listStyle: "none", padding: 0 }}>
                {col.items.map((item, i) => (
                  <li key={i}>
                    <button
                      onClick={() => handleAction(FOOTER_ACTIONS[k]?.[i])}
                      style={{
                        display: "block", width: "100%",
                        padding: "7px 0",
                        color: P.soft, fontSize: 13.5,
                        background: "transparent", border: "none",
                        textAlign: "start", cursor: "pointer",
                        fontFamily: "inherit",
                        transition: "color .25s ease, transform .35s cubic-bezier(.2,.95,.25,1.1)",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = P.cream; e.currentTarget.style.transform = "translateX(-3px)"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = P.soft; e.currentTarget.style.transform = "translateX(0)"; }}
                    >{item}</button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div style={{
          paddingTop: 28,
          borderTop: `1px solid rgba(201,168,76,.12)`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexWrap: "wrap", gap: 16,
        }}>
          <div style={{ color: P.dim, fontSize: 12 }}>
            © {new Date().getFullYear()} {lang === "he" ? "דעוה" : "دعوة"} · {t("footer_tagline")}
          </div>
          <button onClick={onEnterPortal} style={{
            background: "transparent", border: `1px solid rgba(201,168,76,.30)`,
            color: P.gold, fontFamily: "inherit",
            padding: "8px 18px", borderRadius: 999, fontSize: 12, fontWeight: 700,
            cursor: "pointer",
            transition: "all .25s ease",
          }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(201,168,76,.10)"; e.currentTarget.style.borderColor = P.gold; e.currentTarget.style.color = P.cream; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "rgba(201,168,76,.30)"; e.currentTarget.style.color = P.gold; }}
          >{t("nav_portal")} ←</button>
        </div>
      </div>
    </footer>
  );
}
