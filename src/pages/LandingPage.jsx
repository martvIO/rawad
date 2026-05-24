// Public marketing landing page — luxury redesign.
// No top nav: the page reads as a pure editorial composition.
// Language toggle floats as a discreet chip top-right.
// Portal CTA is woven through hero / showcase / pricing / CTA / footer.
import { useState, useEffect, useRef } from "react";
import { BrandLogo } from "../components/BrandLogo.jsx";
import { C } from "../styles/theme.js";

// ── Scroll position hook ────────────────────────────────────────────────────
function useScrollPos() {
  const [y, setY] = useState(0);
  useEffect(() => {
    const onScroll = () => setY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return y;
}

// IntersectionObserver-driven reveal cascade.
function useReveal(deps = []) {
  useEffect(() => {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("is-in"); });
    }, { threshold: 0.14, rootMargin: "0px 0px -60px 0px" });
    document.querySelectorAll(".dawa-reveal:not(.is-in)").forEach(el => io.observe(el));
    return () => io.disconnect();
  // deps are passed in by the caller and intentionally drive re-observation
  // when the language flips and content nodes re-mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// Animated number ticker — starts when scrolled into view.
function CountUp({ to = 0, decimals = 0, suffix = "", duration = 1500, locale = "ar-EG" }) {
  const ref = useRef(null);
  const [val, setVal] = useState(0);
  const triggered = useRef(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !triggered.current) {
        triggered.current = true;
        const start = performance.now();
        const tick = (t) => {
          const p = Math.min(1, (t - start) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          setVal(to * eased);
          if (p < 1) requestAnimationFrame(tick);
          else setVal(to);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.3 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, [to, duration]);
  return (
    <span ref={ref}>
      {val.toFixed(decimals).toLocaleString(locale)}{suffix}
    </span>
  );
}

// Discreet floating language toggle (replaces the old nav-bar control).
function LangChip({ lang, setLang, scrolled }) {
  return (
    <div style={{
      position: "fixed", top: 18, insetInlineEnd: 18, zIndex: 90,
      display: "inline-flex", gap: 1, padding: 3,
      borderRadius: 999,
      background: scrolled ? "rgba(7,7,10,.78)" : "rgba(255,255,255,.04)",
      border: `1px solid rgba(201,168,76,${scrolled ? .35 : .22})`,
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      transition: "background .35s ease, border-color .35s ease",
      boxShadow: scrolled ? "0 10px 30px -10px rgba(0,0,0,.55)" : "none",
    }}>
      {["ar", "he"].map(code => (
        <button key={code} onClick={() => setLang(code)} style={{
          padding: "4px 12px", borderRadius: 999, border: "none",
          background: lang === code
            ? "linear-gradient(135deg,#fff3c0,#f0c84c,#c9a84c)"
            : "transparent",
          color: lang === code ? "#07070a" : "#a09070",
          fontSize: 10.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
          transition: "background .3s, color .3s",
          letterSpacing: ".3px",
        }}>{code === "ar" ? "AR" : "HE"}</button>
      ))}
    </div>
  );
}

// Local stylesheet for animations and reveal cascade.
const PageStyles = () => (
  <style>{`
    .dawa-reveal {
      opacity: 0; transform: translateY(28px);
      transition: opacity .9s cubic-bezier(.2,.7,.2,1), transform .9s cubic-bezier(.2,.7,.2,1);
    }
    .dawa-reveal.is-in { opacity: 1; transform: none; }
    .dawa-reveal.delay-1 { transition-delay: .12s; }
    .dawa-reveal.delay-2 { transition-delay: .24s; }
    .dawa-reveal.delay-3 { transition-delay: .36s; }
    .dawa-reveal.delay-4 { transition-delay: .48s; }

    @keyframes dawa-hero-fade-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes dawa-hero-rise   { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: none; } }
    @keyframes dawa-hero-shimmer { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
    @keyframes dawa-float-y { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
    @keyframes dawa-phone-float { 0%,100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-8px) rotate(-.5deg); } }
    @keyframes dawa-shimmer { 0% { background-position: -240px 0; } 100% { background-position: 240px 0; } }

    @media (prefers-reduced-motion: reduce) {
      .dawa-reveal { opacity: 1 !important; transform: none !important; transition: none !important; }
    }

    @media (max-width: 820px) {
      .dawa-about-grid { grid-template-columns: 1fr !important; gap: 48px !important; }
      .dawa-showcase-grid { grid-template-columns: 1fr !important; gap: 56px !important; }
      .dawa-footer-grid { grid-template-columns: 1fr 1fr !important; gap: 36px !important; }
    }
    @media (max-width: 720px) {
      .dawa-stats-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 32px 0 !important; }
      .dawa-stats-grid > div { padding: 14px 8px !important; }
    }
    @media (max-width: 540px) {
      .dawa-footer-grid { grid-template-columns: 1fr !important; }
    }
  `}</style>
);

export function LandingPage({ onEnterPortal, t, lang, setLang }) {
  const scrollY = useScrollPos();
  useReveal([lang]);

  return (
    <div style={{ background: C.bg, color: "#fff3c0", overflowX: "hidden", position: "relative" }}>
      <PageStyles />
      <LangChip lang={lang} setLang={setLang} scrolled={scrollY > 100} />

      <HeroSection t={t} lang={lang} onEnterPortal={onEnterPortal} scrollY={scrollY} />
      <Divider />
      <AboutSection      t={t} lang={lang} />
      <Divider />
      <FeaturesSection   t={t} />
      <PersonalizationSection t={t} onEnterPortal={onEnterPortal} />
      <Divider />
      <ServicesSection   t={t} onEnterPortal={onEnterPortal} />
      <StatsSection      t={t} lang={lang} />
      <ProcessSection    t={t} />
      <ShowcaseSection   t={t} onEnterPortal={onEnterPortal} />
      <TestimonialsSection t={t} />
      <PricingSection    t={t} onEnterPortal={onEnterPortal} />
      <FaqSection        t={t} />
      <CtaSection        t={t} onEnterPortal={onEnterPortal} />
      <FooterSection     t={t} lang={lang} onEnterPortal={onEnterPortal} />
    </div>
  );
}

// Curved hairline divider between sections.
function Divider() {
  return (
    <div aria-hidden="true" style={{
      height: 1, margin: 0,
      background: "linear-gradient(90deg, transparent, rgba(201,168,76,.18) 30%, rgba(201,168,76,.18) 70%, transparent)",
    }} />
  );
}

// ── HERO ────────────────────────────────────────────────────────────────────
function HeroSection({ t, lang, onEnterPortal, scrollY }) {
  const parallax = Math.min(scrollY * 0.25, 80);
  const opacity  = Math.max(0, 1 - scrollY / 600);
  const trustChips = t("trust_chips") || [];

  return (
    <section id="hero" style={{
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
          "radial-gradient(ellipse 70% 55% at 50% 30%, rgba(201,168,76,.14) 0%, transparent 60%)," +
          "radial-gradient(ellipse 60% 50% at 50% 90%, rgba(201,168,76,.06) 0%, transparent 70%)",
      }} />
      {[260, 420, 600, 820, 1040].map((s, i) => (
        <div key={i} aria-hidden="true" style={{
          position: "absolute", width: s, height: s, borderRadius: "50%",
          border: "1px solid rgba(201,168,76,.05)",
          top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          opacity, animation: `dawa-hero-fade-in 1.${i + 4}s ease both`,
        }} />
      ))}

      <div aria-hidden="true" style={{
        position: "absolute", top: "22%", insetInlineEnd: "10%",
        opacity: opacity * 0.55,
        animation: "dawa-float-y 6s 1s ease-in-out infinite",
      }}>
        <span style={{ fontSize: 36, color: "#c9a84c" }}>✦</span>
      </div>

      <div style={{ position: "relative", transform: `translateY(${-parallax * 0.4}px)`, opacity }}>
        <div style={{
          fontSize: 11, color: "#f0c84c", fontWeight: 800,
          letterSpacing: 4, textTransform: "uppercase",
          marginBottom: 26,
          display: "inline-flex", alignItems: "center", gap: 14,
          animation: "dawa-hero-rise .9s ease both",
        }}>
          <span style={{ width: 28, height: 1, background: "linear-gradient(90deg, transparent, #c9a84c)" }} />
          {t("landing_eyebrow")}
          <span style={{ width: 28, height: 1, background: "linear-gradient(90deg, #c9a84c, transparent)" }} />
        </div>

        <div style={{ marginBottom: 32, animation: "dawa-hero-rise 1s .1s ease both", display: "inline-block" }}>
          <BrandLogo size={130} withText />
        </div>

        <h1 style={{
          fontSize: "clamp(58px,11vw,128px)", fontWeight: 900,
          fontFamily: "'Amiri',serif", lineHeight: 1.25,
          background: "linear-gradient(135deg,#fff3c0 0%,#f0c84c 35%,#c9a84c 70%,#a0832c 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          backgroundClip: "text", marginBottom: 32,
          letterSpacing: 0, paddingBlock: 8,
          animation: "dawa-hero-rise 1.1s .2s cubic-bezier(.2,.7,.2,1) both",
          textShadow: "0 0 80px rgba(201,168,76,.35)",
        }}>{lang === "he" ? "דעוה" : "دعوة"}</h1>

        <p style={{
          fontSize: "clamp(20px,3vw,30px)", color: "#ffffff",
          maxWidth: 720, margin: "0 auto 18px",
          lineHeight: 1.7, fontWeight: 500,
          animation: "dawa-hero-rise 1.1s .35s cubic-bezier(.2,.7,.2,1) both",
        }}>{t("hero_tagline1")}</p>

        <p style={{
          fontSize: "clamp(14px,1.8vw,18px)", color: "#d8c9a6",
          maxWidth: 560, margin: "0 auto 46px",
          lineHeight: 1.8,
          animation: "dawa-hero-rise 1.1s .5s cubic-bezier(.2,.7,.2,1) both",
        }}>{t("hero_tagline2")} · {t("hero_brand_pitch")}</p>

        <div style={{
          display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center",
          marginBottom: 56,
          animation: "dawa-hero-rise 1.1s .65s cubic-bezier(.2,.7,.2,1) both",
        }}>
          <button className="gold-btn" style={{ fontSize: 16, padding: "16px 38px" }} onClick={onEnterPortal}>
            {t("hero_cta_start")}
          </button>
          <a href="#how" className="ghost-btn" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
            {t("portal_cta_secondary")}
          </a>
        </div>

        <div style={{
          display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center",
          maxWidth: 720, margin: "0 auto",
          animation: "dawa-hero-rise 1.1s .8s ease both",
        }}>
          {trustChips.map((chip) => (
            <span key={chip} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 999,
              background: "rgba(201,168,76,.06)",
              border: "1px solid rgba(201,168,76,.20)",
              backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
              color: "#fff3c0", fontSize: 12, fontWeight: 700,
              letterSpacing: ".3px",
            }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#f0c84c" }} />
              {chip}
            </span>
          ))}
        </div>
      </div>

      <div style={{
        position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
        opacity: opacity * 0.85,
        animation: "dawa-hero-shimmer 2.4s ease-in-out infinite",
      }}>
        <span style={{
          fontFamily: "'Amiri',serif", fontStyle: "italic",
          fontSize: 11, color: "#c9a84c", letterSpacing: 3, textTransform: "uppercase",
        }}>{t("scroll_cue")}</span>
        <span style={{
          width: 1, height: 40, display: "block",
          background: "linear-gradient(180deg, #c9a84c 0%, transparent 100%)",
        }} />
      </div>
    </section>
  );
}

// ── Shared section header ───────────────────────────────────────────────────
function SectionHead({ eyebrow, title, sub }) {
  return (
    <div className="dawa-reveal" style={{ textAlign: "center", marginBottom: 64, maxWidth: 720, marginInline: "auto" }}>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 14,
        fontSize: 11, color: "#f0c84c", fontWeight: 800,
        letterSpacing: 4, textTransform: "uppercase", marginBottom: 16,
        opacity: 0.9,
      }}>
        <span style={{ width: 28, height: 1, background: "linear-gradient(90deg, transparent, #c9a84c)" }} />
        {eyebrow}
        <span style={{ width: 28, height: 1, background: "linear-gradient(90deg, #c9a84c, transparent)" }} />
      </div>
      <h2 style={{
        fontFamily: "'Amiri',serif", fontWeight: 900,
        fontSize: "clamp(34px,5vw,56px)", lineHeight: 1.3,
        background: "linear-gradient(135deg,#fff3c0,#f0c84c,#c9a84c)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        marginBottom: 18, letterSpacing: 0, paddingBlock: 6,
      }}>{title}</h2>
      {sub && (
        <p style={{
          color: "#d8c9a6", fontSize: 15,
          fontFamily: "'Amiri',serif", fontStyle: "italic",
          lineHeight: 1.85, paddingTop: 4,
        }}>{sub}</p>
      )}
    </div>
  );
}

// ── ABOUT — editorial split ─────────────────────────────────────────────────
function AboutSection({ t, lang }) {
  return (
    <section id="about" style={{ padding: "140px 24px", maxWidth: 1100, margin: "0 auto" }}>
      <div className="dawa-about-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
        <div className="dawa-reveal">
          <div style={{
            fontSize: 11, color: "#f0c84c", fontWeight: 800,
            letterSpacing: 4, textTransform: "uppercase", marginBottom: 18, opacity: 0.9,
          }}>{t("about_eyebrow")}</div>
          <h2 style={{
            fontFamily: "'Amiri',serif", fontWeight: 900,
            fontSize: "clamp(34px,4vw,52px)", lineHeight: 1.35,
            color: "#ffffff", marginBottom: 24,
            letterSpacing: 0, paddingBlock: 6,
          }}>{t("about_title")}</h2>
          <div style={{
            fontFamily: "'Amiri',serif", fontStyle: "italic",
            fontSize: 20, color: "#fff3c0", lineHeight: 1.7,
            paddingInlineStart: 20,
            borderInlineStart: "2px solid #c9a84c",
            marginBottom: 18,
          }}>“{t("about_quote")}”</div>
          <div style={{
            fontSize: 12, color: "#a09070",
            letterSpacing: 2, textTransform: "uppercase", fontWeight: 700,
          }}>{t("about_attrib")}</div>
        </div>
        <div className="dawa-reveal delay-2" style={{
          position: "relative", aspectRatio: "1/1",
          maxWidth: 420, marginInlineStart: "auto",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ position: "relative" }}>
            <BrandLogo size={200} withText />
          </div>
          {[
            { ic: "✦", top: "10%", end: "8%",  delay: 0   },
            { ic: "♛", top: "70%", end: "5%",  delay: 1.5 },
            { ic: "♥", top: "50%", start: "0%", delay: 0.8 },
            { ic: "❀", top: "15%", start: "5%", delay: 2.2 },
          ].map((g, i) => (
            <span key={i} style={{
              position: "absolute",
              top: g.top,
              insetInlineEnd: g.end || "auto", insetInlineStart: g.start || "auto",
              fontSize: 22, color: "#c9a84c", opacity: 0.7,
              animation: `dawa-float-y 4s ${g.delay}s ease-in-out infinite`,
            }}>{g.ic}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── FEATURES — editorial blocks ─────────────────────────────────────────────
function FeaturesSection({ t }) {
  const [hover, setHover] = useState(null);
  const items = [
    { icon: "✉",  title: t("feat1_title"), body: t("feat1_body"), bullets: t("feat1_bullets") || [] },
    { icon: "📱", title: t("feat2_title"), body: t("feat2_body"), bullets: t("feat2_bullets") || [] },
    { icon: "⏳", title: t("feat3_title"), body: t("feat3_body"), bullets: [] },
    { icon: "💎", title: t("feat4_title"), body: t("feat4_body"), bullets: [] },
  ];
  return (
    <section style={{ padding: "120px 24px", maxWidth: 1100, margin: "0 auto" }}>
      <SectionHead eyebrow={t("features_eyebrow")} title={t("about_title")} sub={t("features_sub")} />
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "64px 40px",
      }}>
        {items.map((f, i) => (
          <div key={i}
            className={`dawa-reveal delay-${(i % 4) + 1}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{
              transition: "transform .5s cubic-bezier(.2,.95,.25,1.1), opacity .3s ease",
              transform: hover === i ? "translateY(-4px)" : "translateY(0)",
              cursor: "default",
            }}>
            <div style={{
              fontSize: 30, color: "#c9a84c", marginBottom: 18,
              opacity: hover === i ? 1 : 0.8,
              transition: "opacity .3s, transform .5s cubic-bezier(.2,.95,.25,1.1)",
              transform: hover === i ? "translateY(-2px)" : "translateY(0)",
            }}>{f.icon}</div>
            <div style={{
              fontSize: 10.5, color: "#c9a84c", fontWeight: 800,
              letterSpacing: 3, textTransform: "uppercase",
              marginBottom: 10, opacity: 0.85,
            }}>{String(i + 1).padStart(2, "0")}</div>
            <h3 style={{
              fontFamily: "'Amiri',serif", fontWeight: 700,
              fontSize: 22, color: "#ffffff", marginBottom: 14, lineHeight: 1.5,
            }}>{f.title}</h3>
            <p style={{
              fontSize: 14, color: "#d8c9a6", lineHeight: 1.95, maxWidth: "36ch",
            }}>{f.body}</p>
            {f.bullets.length > 0 && (
              <ul style={{
                marginTop: 14, paddingInlineStart: 18,
                color: "#d8c9a6", fontSize: 13, lineHeight: 1.9,
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

// ── PERSONALIZATION — "think with me for a minute" narrative section ───────
function PersonalizationSection({ t, onEnterPortal }) {
  const lines = t("pers_body_full") || [];
  return (
    <section style={{ padding: "120px 24px", maxWidth: 820, margin: "0 auto", textAlign: "center" }}>
      <div className="dawa-reveal" style={{ textAlign: "center", marginBottom: 48 }}>
        <h2 style={{
          fontFamily: "'Amiri',serif", fontWeight: 900,
          fontSize: "clamp(34px,5vw,56px)", lineHeight: 1.3,
          background: "linear-gradient(135deg,#fff3c0,#f0c84c,#c9a84c)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          marginBottom: 18, letterSpacing: 0, paddingBlock: 6,
        }}>{t("pers_title")}</h2>
      </div>
      <div className="dawa-reveal" style={{ color: "#d8c9a6", fontSize: 15, lineHeight: 2.1, marginBottom: 48 }}>
        {lines.map((line, i) => {
          const isBullet = typeof line === "string" && line.startsWith("•");
          const isLast = i === lines.length - 1;
          return (
            <p key={i} style={{
              marginBottom: isBullet ? 6 : 18,
              textAlign: isBullet ? "start" : "center",
              fontWeight: isLast ? 700 : 400,
              color: isLast ? "#fff3c0" : "#d8c9a6",
              maxWidth: isBullet ? "60ch" : "none",
              marginInline: isBullet ? "auto" : 0,
            }}>{line}</p>
          );
        })}
      </div>
      <div className="dawa-reveal" style={{ textAlign: "center" }}>
        <button className="gold-btn" onClick={onEnterPortal}>{t("pers_cta")}</button>
      </div>
    </section>
  );
}

// ── SERVICES — two-tab invitation type showcase ────────────────────────────
function ServicesSection({ t, onEnterPortal }) {
  const [tab, setTab] = useState(0);
  const tab1Label = t("services_tab1_label");
  const tab2Label = t("services_tab2_label");
  const tab2Bullets = t("services_tab2_bullets") || [];
  const tab1Lines = t("delivery_body_lines") || [];
  return (
    <section style={{ padding: "120px 24px", maxWidth: 1000, margin: "0 auto" }}>
      <SectionHead
        eyebrow={t("services_label")}
        title={t("services_title")}
        sub={t("services_subtitle")}
      />
      <div className="dawa-reveal" style={{
        display: "flex", gap: 12, marginBottom: 48, justifyContent: "center", flexWrap: "wrap",
      }}>
        {[tab1Label, tab2Label].map((label, i) => (
          <button key={i}
            className={i === tab ? "gold-btn" : "ghost-btn"}
            style={{ minWidth: 160 }}
            onClick={() => setTab(i)}>{label}</button>
        ))}
      </div>
      {tab === 0 && (
        <div className="dawa-reveal" style={{
          padding: "40px 32px", borderRadius: 24,
          background: "linear-gradient(180deg, rgba(201,168,76,.06), rgba(201,168,76,.01))",
          border: "1px solid rgba(201,168,76,.30)",
          backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
          maxWidth: 720, margin: "0 auto",
        }}>
          <div style={{ fontSize: 11, color: "#f0c84c", letterSpacing: 3, textTransform: "uppercase", fontWeight: 800, marginBottom: 10 }}>
            {t("delivery_subtitle")}
          </div>
          <h3 style={{
            fontFamily: "'Amiri',serif", color: "#fff3c0", fontWeight: 900,
            fontSize: 26, marginBottom: 22, lineHeight: 1.4,
          }}>{t("delivery_title")}</h3>
          <ul style={{ color: "#d8c9a6", fontSize: 14.5, lineHeight: 2, listStyle: "none", padding: 0, margin: 0 }}>
            {tab1Lines.map((l, i) => (
              <li key={i} style={{ marginBottom: 8, paddingInlineStart: 4 }}>
                <span style={{ color: "#c9a84c", marginInlineEnd: 8 }}>✓</span>{l}
              </li>
            ))}
          </ul>
        </div>
      )}
      {tab === 1 && (
        <div className="dawa-reveal" style={{
          padding: "40px 32px", borderRadius: 24,
          background: "linear-gradient(180deg, rgba(155,75,212,.10), rgba(155,75,212,.02))",
          border: "1px solid rgba(155,75,212,.40)",
          backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
          maxWidth: 720, margin: "0 auto",
        }}>
          <div style={{ fontSize: 11, color: "#c084fc", letterSpacing: 3, textTransform: "uppercase", fontWeight: 800, marginBottom: 10 }}>
            DIGITAL
          </div>
          <h3 style={{
            fontFamily: "'Amiri',serif", color: "#fff3c0", fontWeight: 900,
            fontSize: 26, marginBottom: 18, lineHeight: 1.4,
          }}>{t("services_tab2_title")}</h3>
          <p style={{ color: "#d8c9a6", fontSize: 15, lineHeight: 1.95, marginBottom: 24 }}>
            {t("services_tab2_body")}
          </p>
          <ul style={{ color: "#d8c9a6", fontSize: 14.5, lineHeight: 2, listStyle: "none", padding: 0, margin: 0 }}>
            {tab2Bullets.map((b, i) => (
              <li key={i} style={{ marginBottom: 8, paddingInlineStart: 4 }}>
                <span style={{ color: "#c084fc", marginInlineEnd: 8 }}>✓</span>{b}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ── STATS — animated counters on hairline strip ────────────────────────────
function StatsSection({ t, lang }) {
  const items = t("stats_items") || [];
  const locale = lang === "he" ? "he-IL" : "ar-EG";
  return (
    <section style={{ padding: "100px 24px", maxWidth: 1100, margin: "0 auto" }}>
      <div className="dawa-reveal dawa-stats-grid" style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
        gap: 0, padding: "48px 0",
        borderBlock: "1px solid rgba(201,168,76,.18)",
      }}>
        {items.map((s, i) => (
          <div key={i} style={{
            textAlign: "center",
            paddingInline: 8,
            borderInlineStart: i > 0 ? "1px solid rgba(201,168,76,.16)" : "none",
          }}>
            <div style={{
              fontFamily: "'Amiri',serif", fontWeight: 900,
              fontSize: "clamp(36px, 6vw, 64px)",
              background: "linear-gradient(135deg,#fff3c0,#f0c84c,#c9a84c)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              lineHeight: 1.25, fontVariantNumeric: "tabular-nums",
              textShadow: "0 0 50px rgba(201,168,76,.25)",
              marginBottom: 14, paddingBlock: 4,
            }}>
              <CountUp to={s.v} decimals={s.dec || 0} suffix={s.s} locale={locale} />
            </div>
            <div style={{
              fontFamily: "'Amiri',serif", fontStyle: "italic",
              color: "#c9a84c", fontSize: 11.5,
              letterSpacing: 2.5, textTransform: "uppercase",
              opacity: 0.85,
            }}>{s.l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── PROCESS — connected vertical timeline ──────────────────────────────────
function ProcessSection({ t }) {
  const steps = t("process_steps") || [];
  return (
    <section id="how" style={{ padding: "140px 24px", maxWidth: 1000, margin: "0 auto" }}>
      <SectionHead eyebrow={t("process_eyebrow")} title={t("process_title")} />
      <div className="dawa-reveal" style={{ position: "relative", paddingInlineStart: 56 }}>
        <div style={{
          position: "absolute", insetInlineStart: 20, top: 14, bottom: 14, width: 1,
          background: "linear-gradient(180deg, transparent, rgba(201,168,76,.45) 10%, rgba(201,168,76,.45) 90%, transparent)",
        }} />
        {steps.map((s, i) => (
          <div key={i} className={`dawa-reveal delay-${(i % 4) + 1}`} style={{
            position: "relative", paddingBlock: 24,
            borderBottom: i < steps.length - 1 ? "1px solid rgba(201,168,76,.10)" : "none",
          }}>
            <div style={{
              position: "absolute", insetInlineStart: -50, top: 22,
              width: 42, height: 42, borderRadius: "50%",
              background: "#07070a",
              border: "1px solid rgba(201,168,76,.40)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'Amiri',serif", fontWeight: 900,
              color: "#f0c84c", fontSize: 17,
              boxShadow: "0 0 0 4px #07070a, 0 0 24px rgba(240,200,76,.18)",
            }}>{i + 1}</div>
            <div style={{ fontSize: 26, color: "#c9a84c", marginBottom: 8, opacity: 0.85 }}>{s.ic}</div>
            <h3 style={{
              fontFamily: "'Amiri',serif", fontWeight: 700,
              fontSize: 24, color: "#ffffff", marginBottom: 12, lineHeight: 1.4,
            }}>{s.title}</h3>
            <p style={{
              fontSize: 14.5, color: "#d8c9a6", lineHeight: 1.95, maxWidth: "52ch",
            }}>{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── SHOWCASE — phone mockup with mini dashboard preview ────────────────────
function ShowcaseSection({ t, onEnterPortal }) {
  const bullets = t("showcase_bullets") || [];
  return (
    <section style={{ padding: "140px 24px", maxWidth: 1100, margin: "0 auto" }}>
      <div className="dawa-showcase-grid" style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 56, alignItems: "center" }}>
        <div className="dawa-reveal" style={{ position: "relative" }}>
          <div style={{
            position: "relative",
            width: "100%", maxWidth: 360,
            aspectRatio: "9/19.5",
            margin: "0 auto",
            borderRadius: 44,
            background: "linear-gradient(145deg, #1a1a22, #0a0a10)",
            padding: 12,
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,.06), " +
              "0 40px 80px -20px rgba(0,0,0,.7), " +
              "0 0 0 1px rgba(201,168,76,.22), " +
              "0 0 80px rgba(201,168,76,.20)",
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
                fontSize: 10, color: "#a09070", fontWeight: 700,
              }}>
                <span>9:41</span>
                <span>● ● ●</span>
              </div>
              <div style={{
                position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)",
                width: 80, height: 22, borderRadius: 12, background: "#0a0a10",
              }} />
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 9, color: "#7a6a4a", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 800, marginBottom: 6 }}>
                  {t("dash_welcome")}
                </div>
                <div style={{ fontFamily: "'Amiri',serif", fontWeight: 900, color: "#f0c84c", fontSize: 18 }}>
                  {t("dash_subtitle")}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { v: 187, l: t("stat_delivered"), c: "#4cc97a" },
                  { v: 23,  l: t("stat_enroute"),   c: "#4b9fd4" },
                ].map(s => (
                  <div key={s.l} style={{
                    background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)",
                    borderRadius: 10, padding: "10px 12px",
                  }}>
                    <div style={{ fontFamily: "'Amiri',serif", color: s.c, fontSize: 22, fontWeight: 900, lineHeight: 1 }}>{s.v}</div>
                    <div style={{ fontSize: 9, color: "#7a6a4a", marginTop: 4, letterSpacing: 1, textTransform: "uppercase" }}>{s.l}</div>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 9, color: "#7a6a4a", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>{t("progress_label")}</span>
                  <span style={{ fontSize: 10, color: "#f0c84c", fontWeight: 800 }}>89%</span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,.04)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: "89%",
                    background: "linear-gradient(90deg,#c9a84c,#f0c84c,#c9a84c)",
                    backgroundSize: "200% 100%",
                    borderRadius: 999,
                    animation: "dawa-shimmer 3s linear infinite",
                  }} />
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                {[
                  { n: "أحمد محمد", s: "✓", c: "#4cc97a" },
                  { n: "ليلى سعيد", s: "🚗", c: "#4b9fd4" },
                  { n: "يوسف خالد", s: "⌛", c: "#a09070" },
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
                      color: "#c9a84c",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10,
                    }}>✦</div>
                    <div style={{ fontSize: 10.5, color: "#f5e6b8", fontWeight: 700 }}>{g.n}</div>
                    <div style={{ fontSize: 11, color: g.c }}>{g.s}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <span style={{
            position: "absolute", top: "10%", insetInlineEnd: 8,
            fontSize: 24, color: "#c9a84c", opacity: 0.6,
            animation: "dawa-float-y 5s ease-in-out infinite",
          }}>✦</span>
          <span style={{
            position: "absolute", bottom: "12%", insetInlineStart: 8,
            fontSize: 18, color: "#c9a84c", opacity: 0.5,
            animation: "dawa-float-y 7s 1s ease-in-out infinite",
          }}>♥</span>
        </div>

        <div className="dawa-reveal delay-2">
          <div style={{
            fontSize: 11, color: "#f0c84c", fontWeight: 800,
            letterSpacing: 4, textTransform: "uppercase",
            marginBottom: 18, opacity: 0.9,
          }}>{t("showcase_eyebrow")}</div>
          <h2 style={{
            fontFamily: "'Amiri',serif", fontWeight: 900,
            fontSize: "clamp(34px,4vw,52px)", lineHeight: 1.35,
            color: "#ffffff", marginBottom: 24, letterSpacing: 0, paddingBlock: 6,
          }}>{t("showcase_title")}</h2>
          <p style={{ fontSize: 16, color: "#d8c9a6", lineHeight: 1.95, marginBottom: 30, maxWidth: "44ch" }}>
            {t("showcase_body")}
          </p>
          <ul style={{ listStyle: "none", padding: 0, marginBottom: 30 }}>
            {bullets.map((b, i) => (
              <li key={i} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 0",
                borderBottom: i < bullets.length - 1 ? "1px solid rgba(201,168,76,.10)" : "none",
                color: "#fff3c0", fontSize: 15, fontFamily: "'Amiri',serif",
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "linear-gradient(135deg,#f0c84c,#c9a84c)",
                  boxShadow: "0 0 8px rgba(240,200,76,.5)",
                  flexShrink: 0,
                }} />
                {b}
              </li>
            ))}
          </ul>
          <button className="gold-btn" onClick={onEnterPortal}>{t("portal_cta_inline")}</button>
        </div>
      </div>
    </section>
  );
}

// ── TESTIMONIALS — bare carousel ───────────────────────────────────────────
function TestimonialsSection({ t }) {
  const ts = t("testimonials") || [];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!ts.length) return;
    const id = setInterval(() => setIdx(i => (i + 1) % ts.length), 6000);
    return () => clearInterval(id);
  }, [ts.length]);
  if (!ts.length) return null;
  return (
    <section style={{ padding: "140px 24px", maxWidth: 920, margin: "0 auto" }}>
      <SectionHead eyebrow={t("testimonials_eyebrow")} title={t("testimonials_title")} />
      <div className="dawa-reveal" style={{ position: "relative", minHeight: 240 }}>
        {ts.map((tt, i) => (
          <div key={i} style={{
            position: "absolute", inset: 0,
            opacity: idx === i ? 1 : 0,
            transform: idx === i ? "translateY(0)" : "translateY(20px)",
            transition: "opacity .8s cubic-bezier(.2,.7,.2,1), transform .8s cubic-bezier(.2,.7,.2,1)",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 30, color: "#c9a84c", opacity: 0.6, marginBottom: 14, fontFamily: "'Amiri',serif" }}>“</div>
            <blockquote style={{
              fontFamily: "'Amiri',serif", fontStyle: "italic",
              fontSize: "clamp(20px, 2.6vw, 28px)",
              color: "#fff3c0", lineHeight: 1.85, fontWeight: 400,
              maxWidth: 720, marginInline: "auto", marginBottom: 32,
              paddingBlock: 4,
            }}>{tt.quote}</blockquote>
            <div style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: "center" }}>
              <div style={{
                width: 44, height: 44, borderRadius: "50%",
                background: "linear-gradient(135deg, #f0c84c, #c9a84c)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#07070a", fontFamily: "'Amiri',serif", fontWeight: 900, fontSize: 18,
              }}>{tt.name.charAt(0)}</div>
              <div style={{ textAlign: "start" }}>
                <div style={{ color: "#fff3c0", fontWeight: 800, fontSize: 14, fontFamily: "'Amiri',serif" }}>{tt.name}</div>
                <div style={{ color: "#c9a84c", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, opacity: 0.85 }}>{tt.city}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 40 }}>
        {ts.map((_, i) => (
          <button key={i} onClick={() => setIdx(i)}
            aria-label={`testimonial ${i + 1}`}
            style={{
              width: idx === i ? 24 : 6, height: 6, borderRadius: 4,
              background: idx === i ? "linear-gradient(90deg,#f0c84c,#c9a84c)" : "rgba(201,168,76,.30)",
              border: "none", cursor: "pointer",
              transition: "width .4s cubic-bezier(.2,.95,.25,1.1), background .3s",
              padding: 0,
            }} />
        ))}
      </div>
    </section>
  );
}

// ── PRICING — Premium (gold) + VIP (purple, featured) ──────────────────────
function PricingSection({ t, onEnterPortal }) {
  return (
    <section id="pricing" style={{ padding: "140px 24px", maxWidth: 1000, margin: "0 auto" }}>
      <SectionHead eyebrow={t("pricing_label")} title={t("pricing_title")} sub={t("pricing_subtitle")} />
      <div className="dawa-reveal" style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: 28,
      }}>
        <div style={{
          position: "relative", padding: "40px 32px", borderRadius: 24,
          background: "linear-gradient(180deg, rgba(201,168,76,.06), rgba(201,168,76,.01))",
          border: "1px solid rgba(201,168,76,.30)",
          backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
          transition: "transform .5s cubic-bezier(.2,.95,.25,1.1), border-color .35s ease, box-shadow .35s ease",
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-6px)"; e.currentTarget.style.borderColor = "rgba(201,168,76,.55)"; e.currentTarget.style.boxShadow = "0 28px 60px -22px rgba(0,0,0,.5), 0 0 60px rgba(201,168,76,.15)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = "rgba(201,168,76,.30)"; e.currentTarget.style.boxShadow = "none"; }}
        >
          <div style={{ fontSize: 44, marginBottom: 16 }}>✦</div>
          <div style={{ fontSize: 11, color: "#f0c84c", letterSpacing: 3, textTransform: "uppercase", fontWeight: 800, marginBottom: 10 }}>PREMIUM</div>
          <h3 style={{ fontFamily: "'Amiri',serif", color: "#fff3c0", fontWeight: 900, fontSize: 26, marginBottom: 18, lineHeight: 1.4 }}>{t("price_pkg1_label")}</h3>
          {(() => {
            const priceStr = t("price_pkg1_price") || "";
            const priceNum = parseInt(priceStr.replace(/[^\d]/g, ""), 10) || 0;
            const originalNum = priceNum * 2;
            const currency = priceStr.replace(/[\d,٬\s]/g, "").trim();
            const originalStr = originalNum > 0
              ? `${originalNum.toLocaleString("en-US")} ${currency}`.trim()
              : "";
            return (
              <div style={{ marginBottom: 18 }}>
                {originalStr && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                    <span style={{
                      color: "#8a7a55", fontSize: 13, fontWeight: 700, opacity: 0.85,
                    }}>{t("price_pkg1_original_label")}</span>
                    <span style={{
                      color: "#8a7a55", fontSize: 20, textDecoration: "line-through",
                      fontFamily: "'Amiri',serif", fontWeight: 700, opacity: 0.85,
                    }}>{originalStr}</span>
                    <span style={{
                      background: "linear-gradient(135deg, #c9a84c, #f0c84c)",
                      color: "#1a1408", padding: "4px 12px", borderRadius: 999,
                      fontSize: 11, fontWeight: 900, letterSpacing: 1.2,
                      boxShadow: "0 4px 14px rgba(201,168,76,.35)",
                    }}>{t("price_pkg1_discount_badge")}</span>
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span style={{
                    color: "#8a7a55", fontSize: 13, fontWeight: 700, opacity: 0.85,
                  }}>{t("price_pkg1_new_label")}</span>
                  <div style={{
                    fontFamily: "'Amiri',serif", fontWeight: 900,
                    fontSize: 44, lineHeight: 1.25,
                    background: "linear-gradient(135deg,#fff3c0,#f0c84c,#c9a84c)",
                    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                    paddingBlock: 4,
                  }}>{priceStr}</div>
                </div>
              </div>
            );
          })()}
          <div style={{ color: "#d8c9a6", fontSize: 14, lineHeight: 1.85, marginBottom: 20 }}>
            {t("price_pkg1_sub")}
          </div>
          <ul style={{
            listStyle: "none", padding: 0, margin: "0 0 26px",
            color: "#d8c9a6", fontSize: 13, lineHeight: 1.95,
          }}>
            {(t("price_pkg1_bullets") || []).map((b, bi) => (
              <li key={bi} style={{ marginBottom: 6 }}>
                <span style={{ color: "#c9a84c", marginInlineEnd: 6 }}>✓</span>{b}
              </li>
            ))}
          </ul>
          <button className="ghost-btn" style={{ width: "100%" }} onClick={onEnterPortal}>{t("price_contact")}</button>
        </div>

        <div style={{
          position: "relative", padding: "40px 32px", borderRadius: 24,
          background: "linear-gradient(180deg, rgba(155,75,212,.10), rgba(155,75,212,.02))",
          border: "1px solid #9b4bd4",
          backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
          boxShadow: "0 28px 70px -28px rgba(155,75,212,.5), 0 0 50px rgba(155,75,212,.15)",
          transition: "transform .5s cubic-bezier(.2,.95,.25,1.1), box-shadow .35s ease",
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-6px)"; e.currentTarget.style.boxShadow = "0 36px 80px -28px rgba(155,75,212,.6), 0 0 70px rgba(155,75,212,.25)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 28px 70px -28px rgba(155,75,212,.5), 0 0 50px rgba(155,75,212,.15)"; }}
        >
          <div style={{
            position: "absolute", top: -14, insetInlineStart: "50%", transform: "translateX(-50%)",
            background: "linear-gradient(135deg,#9b4bd4,#c084fc)", color: "#fff",
            padding: "6px 20px", borderRadius: 999, fontSize: 11, fontWeight: 900, whiteSpace: "nowrap",
            letterSpacing: 1.5, boxShadow: "0 6px 20px rgba(155,75,212,.4)",
          }}>{t("price_vip_badge")}</div>
          <div style={{ fontSize: 44, marginBottom: 16 }}>♛</div>
          <div style={{ fontSize: 11, color: "#c084fc", letterSpacing: 3, textTransform: "uppercase", fontWeight: 800, marginBottom: 10 }}>VIP ROYAL</div>
          <h3 style={{ fontFamily: "'Amiri',serif", color: "#fff3c0", fontWeight: 900, fontSize: 26, marginBottom: 14, lineHeight: 1.4 }}>{t("price_vip_title")}</h3>
          <div style={{ color: "#d8c9a6", fontSize: 14, lineHeight: 1.85, marginBottom: 22 }}>
            {t("price_vip_body")}
          </div>
          <div style={{ marginBottom: 18, paddingTop: 16, borderTop: "1px solid rgba(192,132,252,.25)" }}>
            <div style={{
              fontSize: 11.5, color: "#c084fc", fontWeight: 800,
              letterSpacing: 1.8, marginBottom: 8,
            }}>{t("price_pkg2_label")}</div>
            <div style={{
              fontFamily: "'Amiri',serif", fontWeight: 900,
              fontSize: 44, lineHeight: 1.2,
              background: "linear-gradient(135deg,#fff,#c084fc,#9b4bd4)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              paddingBlock: 2,
            }}>{t("price_pkg2_price")}</div>
            <div style={{ color: "#d8c9a6", fontSize: 13, lineHeight: 1.75, marginTop: 8, marginBottom: 14 }}>
              {t("price_pkg2_sub")}
            </div>
            <ul style={{
              listStyle: "none", padding: 0, margin: 0,
              color: "#d8c9a6", fontSize: 13, lineHeight: 1.9,
            }}>
              {(t("price_pkg2_bullets") || []).map((b, bi) => (
                <li key={bi} style={{ marginBottom: 6 }}>
                  <span style={{ color: "#c084fc", marginInlineEnd: 6 }}>✓</span>{b}
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

// ── FAQ — minimal accordion ────────────────────────────────────────────────
function FaqSection({ t }) {
  const faqs = t("faqs") || [];
  const [open, setOpen] = useState(0);
  return (
    <section style={{ padding: "140px 24px", maxWidth: 820, margin: "0 auto" }}>
      <SectionHead eyebrow={t("faq_eyebrow")} title={t("faq_title")} />
      <div className="dawa-reveal">
        {faqs.map((f, i) => {
          const isOpen = open === i;
          return (
            <div key={i} style={{ borderBottom: "1px solid rgba(201,168,76,.16)" }}>
              <button
                onClick={() => setOpen(isOpen ? -1 : i)}
                aria-expanded={isOpen}
                style={{
                  width: "100%", textAlign: "start",
                  background: "transparent", border: "none", padding: "26px 4px",
                  cursor: "pointer", display: "flex", alignItems: "center",
                  justifyContent: "space-between", gap: 18,
                  color: "#fff3c0",
                  fontFamily: "'Amiri',serif", fontWeight: 700, fontSize: 18,
                  lineHeight: 1.5,
                  transition: "color .25s ease",
                }}
                onMouseEnter={e => e.currentTarget.style.color = "#ffffff"}
                onMouseLeave={e => e.currentTarget.style.color = "#fff3c0"}
              >
                <span style={{ flex: 1 }}>{f.q}</span>
                <span style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: isOpen ? "rgba(201,168,76,.18)" : "transparent",
                  border: "1px solid rgba(201,168,76,.30)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#c9a84c", fontSize: 18, fontWeight: 400,
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
                  paddingInlineStart: 4, paddingInlineEnd: 50,
                  color: "#d8c9a6", fontSize: 15, lineHeight: 1.9,
                }}>{f.a}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── CTA — final conversion block ───────────────────────────────────────────
function CtaSection({ t, onEnterPortal }) {
  return (
    <section style={{ padding: "140px 24px", maxWidth: 880, margin: "0 auto", textAlign: "center", position: "relative" }}>
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(201,168,76,.10), transparent 70%)",
        pointerEvents: "none",
      }} />
      <div className="dawa-reveal" style={{ position: "relative" }}>
        <span style={{ fontSize: 48, color: "#c9a84c", display: "block", marginBottom: 18, opacity: 0.7 }}>✦</span>
        <h2 style={{
          fontFamily: "'Amiri',serif", fontWeight: 900,
          fontSize: "clamp(38px,5.5vw,68px)", lineHeight: 1.25,
          background: "linear-gradient(135deg,#fff3c0,#f0c84c,#c9a84c)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          marginBottom: 28, letterSpacing: 0, paddingBlock: 6,
        }}>{t("cta_title")}</h2>
        <p style={{
          fontFamily: "'Amiri',serif", fontStyle: "italic",
          color: "#d8c9a6", fontSize: 17, lineHeight: 1.8,
          maxWidth: 600, marginInline: "auto", marginBottom: 38,
        }}>{t("cta_sub")}</p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="gold-btn" style={{ fontSize: 16, padding: "16px 38px" }} onClick={onEnterPortal}>
            {t("hero_cta_start")}
          </button>
          <button className="ghost-btn" onClick={onEnterPortal}>{t("price_contact")}</button>
        </div>
      </div>
    </section>
  );
}

// ── FOOTER — multi-column ──────────────────────────────────────────────────
function FooterSection({ t, lang, onEnterPortal }) {
  const cols = t("footer_cols") || {};
  return (
    <footer style={{
      borderTop: "1px solid rgba(201,168,76,.14)",
      padding: "80px 24px 40px",
      background: "linear-gradient(180deg, transparent, rgba(201,168,76,.02))",
    }}>
      <div style={{ maxWidth: 1100, marginInline: "auto" }}>
        <div className="dawa-reveal dawa-footer-grid" style={{
          display: "grid",
          gridTemplateColumns: "1.4fr repeat(4, 1fr)",
          gap: 40, marginBottom: 60,
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <BrandLogo size={36} />
              <span style={{
                fontFamily: "'Amiri',serif", fontSize: 26, fontWeight: 900,
                background: "linear-gradient(135deg,#fff3c0,#f0c84c,#c9a84c)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              }}>{lang === "he" ? "דעוה" : "دعوة"}</span>
            </div>
            <p style={{ color: "#d8c9a6", fontSize: 13, lineHeight: 1.85, maxWidth: "32ch", marginBottom: 20 }}>
              {t("footer_tagline")}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              {["✉", "📱", "♥", "✦"].map((g, i) => (
                <a key={i} href="#" aria-label="social" style={{
                  width: 36, height: 36, borderRadius: "50%",
                  border: "1px solid rgba(201,168,76,.22)",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  color: "#c9a84c", fontSize: 14,
                  transition: "all .3s cubic-bezier(.2,.95,.25,1.1)",
                  textDecoration: "none",
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#c9a84c"; e.currentTarget.style.color = "#fff3c0"; e.currentTarget.style.transform = "translateY(-3px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(201,168,76,.22)"; e.currentTarget.style.color = "#c9a84c"; e.currentTarget.style.transform = "translateY(0)"; }}
                >{g}</a>
              ))}
            </div>
          </div>
          {Object.entries(cols).map(([k, col]) => (
            <div key={k}>
              <div style={{
                fontSize: 10.5, color: "#c9a84c", fontWeight: 800,
                letterSpacing: 2.5, textTransform: "uppercase",
                marginBottom: 18, opacity: 0.85,
              }}>{col.title}</div>
              <ul style={{ listStyle: "none", padding: 0 }}>
                {col.items.map((item, i) => (
                  <li key={i}>
                    <a href="#" style={{
                      display: "block",
                      padding: "7px 0",
                      color: "#d8c9a6", fontSize: 13.5,
                      textDecoration: "none",
                      transition: "color .25s ease, transform .35s cubic-bezier(.2,.95,.25,1.1)",
                    }}
                      onMouseEnter={e => { e.currentTarget.style.color = "#fff3c0"; e.currentTarget.style.transform = "translateX(-3px)"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "#d8c9a6"; e.currentTarget.style.transform = "translateX(0)"; }}
                    >{item}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div style={{
          paddingTop: 28,
          borderTop: "1px solid rgba(201,168,76,.12)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexWrap: "wrap", gap: 16,
        }}>
          <div style={{ color: "#7a6a4a", fontSize: 12 }}>
            © {new Date().getFullYear()} {lang === "he" ? "דעוה" : "دعوة"} · {t("footer_tagline")}
          </div>
          <button onClick={onEnterPortal} style={{
            background: "transparent", border: "1px solid rgba(201,168,76,.30)",
            color: "#c9a84c", fontFamily: "inherit",
            padding: "8px 18px", borderRadius: 999, fontSize: 12, fontWeight: 700,
            cursor: "pointer",
            transition: "all .25s ease",
          }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(201,168,76,.10)"; e.currentTarget.style.borderColor = "#c9a84c"; e.currentTarget.style.color = "#fff3c0"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "rgba(201,168,76,.30)"; e.currentTarget.style.color = "#c9a84c"; }}
          >{t("nav_portal")} ←</button>
        </div>
      </div>
    </footer>
  );
}
