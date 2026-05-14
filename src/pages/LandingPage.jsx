// Public marketing landing page — hero, about, services, pricing, footer.
import { useState, useEffect } from "react";
import { BrandLogo } from "../components/BrandLogo.jsx";
import { LangSwitcher } from "../components/LangSwitcher.jsx";
import { getInviteContent } from "../data/inviteContent.js";

export function LandingPage({ onEnterPortal, t, lang, setLang }) {
  const [navSection, setNavSection] = useState("hero");
  const [previewType, setPreviewType] = useState("premium");

  // Scroll-spy: highlight active nav item as user scrolls through sections
  useEffect(() => {
    const sections = ["hero", "about", "services", "pricing"];
    const onScroll = () => {
      let active = "hero";
      const threshold = window.innerHeight * 0.35;
      for (const id of sections) {
        const el = document.getElementById(id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= threshold) active = id;
        }
      }
      setNavSection(active);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (id) => {
    setNavSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#07070a" }}>
      {/* ── NAV ── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(7,7,10,.94)", backdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(201,168,76,.1)", padding: "0 24px",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 22 }}>✉</span>
            <span style={{ fontSize: 21, fontWeight: 900, color: "#c9a84c", fontFamily: "'Amiri', serif" }}>{lang === "he" ? "דעוה" : "دعوة"}</span>
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
            {[
              ["hero",     t("nav_home")],
              ["about",    t("nav_about")],
              ["services", t("nav_services")],
              ["pricing",  t("nav_pricing")],
            ].map(([id, lbl]) => (
              <button key={id} className={`nav-tab${navSection===id?" active":""}`} onClick={() => scrollTo(id)}>{lbl}</button>
            ))}
            <div style={{ marginInline: 6 }}><LangSwitcher lang={lang} setLang={setLang} /></div>
            <button className="gold-btn" style={{ padding: "8px 18px", fontSize: 13 }} onClick={onEnterPortal}>
              {t("nav_portal")}
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section id="hero" style={{
        minHeight: "91vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        textAlign: "center", padding: "48px 24px",
        background: "radial-gradient(ellipse 70% 55% at 50% 0%, rgba(201,168,76,.07) 0%, transparent 70%)",
        position: "relative", overflow: "hidden",
      }}>
        {[200, 340, 480].map((s, i) => (
          <div key={i} style={{
            position: "absolute", width: s, height: s, borderRadius: "50%",
            border: "1px solid rgba(201,168,76,.05)",
            top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            pointerEvents: "none",
          }}/>
        ))}

        <div className="fade-up" style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 28 }}>
          <BrandLogo size={140} withText />
        </div>

        <h1 className="fade-up-2" style={{
          fontSize: "clamp(48px,9vw,88px)", fontWeight: 900,
          fontFamily: "'Amiri',serif", lineHeight: 1.1,
          background: "linear-gradient(135deg,#c9a84c 0%,#f0c84c 50%,#c9a84c 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          backgroundClip: "text", marginBottom: 10,
        }}>{lang === "he" ? "דעוה" : "دعوة"}</h1>

        <div className="fade-up-2" style={{
          fontSize: 13, color: "#a09070", letterSpacing: 1.5,
          marginBottom: 22, fontWeight: 600,
        }}>
          {t("hero_subtitle")}
        </div>

        <p className="fade-up-3" style={{
          fontSize: "clamp(16px,2.8vw,22px)", color: "rgba(245,230,184,.75)",
          maxWidth: 560, lineHeight: 1.8, marginBottom: 10,
        }}>
          {t("hero_tagline1")}<br/>
          {t("hero_tagline2")}
        </p>

        <p className="fade-up-3" style={{ fontSize: 13, color: "#5a5040", marginBottom: 36 }}>
          {t("hero_brand_pitch")}
        </p>

        <div className="fade-up-4" style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
          <button className="gold-btn" style={{ fontSize: 16, padding: "15px 36px" }} onClick={onEnterPortal}>
            {t("hero_cta_start")}
          </button>
          <button className="ghost-btn" onClick={() => scrollTo("services")}>
            {t("hero_cta_explore")}
          </button>
        </div>
      </section>

      {/* ── ABOUT ── */}
      <section id="about" style={{ padding: "80px 24px", maxWidth: 960, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div className="section-label">{t("about_label")}</div>
          <h2 style={{ fontSize: "clamp(26px,4vw,42px)", fontWeight: 900, color: "#c9a84c", fontFamily: "'Amiri',serif" }}>
            {t("about_title")}
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 18, marginBottom: 48 }}>
          {[
            { icon: "⏳", title: t("feat1_title"), body: t("feat1_body") },
            { icon: "✉",  title: t("feat2_title"), body: t("feat2_body") },
            { icon: "📍", title: t("feat3_title"), body: t("feat3_body") },
            { icon: "👔", title: t("feat4_title"), body: t("feat4_body") },
          ].map(c => (
            <div key={c.title} className="card">
              <div style={{ fontSize: 34, marginBottom: 12 }}>{c.icon}</div>
              <h3 style={{ fontWeight: 800, color: "#f5e6b8", marginBottom: 8, fontSize: 15 }}>{c.title}</h3>
              <p style={{ fontSize: 13, color: "#8a7a5a", lineHeight: 1.85 }}>{c.body}</p>
            </div>
          ))}
        </div>

        <div className="gold-card" style={{ padding: "32px 36px", textAlign: "center" }}>
          <BrandLogo size={56} />
          <div style={{ marginTop: 20, fontSize: 20, fontWeight: 900, color: "#c9a84c", fontFamily: "'Amiri',serif", marginBottom: 14 }}>
            {t("pers_title")}
          </div>
          <p style={{ color: "rgba(245,230,184,.8)", lineHeight: 2.1, fontSize: 14, maxWidth: 640, margin: "0 auto 22px" }}>
            {t("pers_body_full")[0]}
            <br/>
            {t("pers_body_full")[1]}<strong style={{ color: "#c9a84c" }}>{t("pers_body_full")[2]}</strong>{t("pers_body_full")[3]}
            <br/><br/>
            {t("pers_body_full")[4]}
            <br/>
            <strong style={{ color: "#c9a84c" }}>{t("pers_body_full")[5]}</strong>
          </p>
          <button className="gold-btn" onClick={onEnterPortal}>{t("pers_cta")}</button>
        </div>
      </section>

      {/* ── SERVICES ── */}
      <section id="services" style={{
        padding: "80px 24px",
        background: "rgba(201,168,76,.02)",
        borderTop: "1px solid rgba(201,168,76,.08)",
        borderBottom: "1px solid rgba(201,168,76,.08)",
      }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div className="section-label">{t("services_label")}</div>
            <h2 style={{ fontSize: "clamp(26px,4vw,42px)", fontWeight: 900, color: "#c9a84c", fontFamily: "'Amiri',serif" }}>
              {t("services_title")}
            </h2>
            <p style={{ color: "#7a6a4a", fontSize: 13, marginTop: 8 }}>
              {t("services_subtitle")}
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 32, flexWrap: "wrap" }}>
            {["premium","vip"].map(tp => (
              <button key={tp} onClick={() => setPreviewType(tp)} style={{
                padding: "9px 24px", borderRadius: 12, fontWeight: 800, fontSize: 14, cursor: "pointer",
                background: previewType===tp
                  ? tp==="vip" ? "rgba(155,75,212,.2)" : "rgba(201,168,76,.15)"
                  : "rgba(255,255,255,.04)",
                border: `1.5px solid ${previewType===tp ? (tp==="vip" ? "#c084fc" : "#c9a84c") : "rgba(255,255,255,.08)"}`,
                color: previewType===tp ? (tp==="vip" ? "#c084fc" : "#c9a84c") : "#7a6a4a",
                fontFamily: "inherit", transition: "all .2s",
              }}>
                {getInviteContent(lang)[tp].icon} {getInviteContent(lang)[tp].label}
              </button>
            ))}
          </div>

          {["premium","vip"].map(type => {
            const inv = getInviteContent(lang)[type];
            const isVip = type === "vip";
            if (previewType !== type) return null;
            return (
              <div key={type} style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
                gap: 28, marginBottom: 48, animation: "fadeIn .35s ease",
              }}>
                <div style={{
                  background: isVip ? "linear-gradient(145deg,#05050f,#0e0e22)" : "linear-gradient(145deg,#1a0e00,#2a1800)",
                  border: `1.5px solid ${isVip ? "#9b4bd4" : "#c9a84c"}`,
                  borderRadius: 22, padding: "36px 28px",
                  position: "relative", overflow: "hidden", textAlign: "center",
                }}>
                  <div style={{
                    position: "absolute", top: 0, left: 0, right: 0, height: 3,
                    background: `linear-gradient(90deg,transparent,${isVip ? "#9b4bd4" : "#c9a84c"},transparent)`,
                  }}/>
                  <div style={{ position: "absolute", top: 16, left: 16 }}>
                    <BrandLogo size={52} />
                  </div>
                  <div style={{ marginBottom: 8, color: isVip ? "#c084fc" : "#c9a84c", fontSize: 12, fontWeight: 800, letterSpacing: 2 }}>
                    {isVip ? "✦ VIP ROYAL ✦" : "✦ PREMIUM ✦"}
                  </div>
                  <div style={{ width: 40, height: 1, background: isVip ? "#9b4bd455" : "#c9a84c55", margin: "12px auto" }}/>
                  <p style={{ fontSize: 14, color: "rgba(245,230,184,.85)", lineHeight: 1.9, fontFamily: "'Amiri',serif" }}>
                    {inv.line2}<br/>
                    {inv.line3}<br/>
                    <strong style={{ color: isVip ? "#c084fc" : "#c9a84c" }}>{inv.line4}</strong><br/>
                    {inv.line5}
                  </p>
                  <div style={{ width: 40, height: 1, background: isVip ? "#9b4bd455" : "#c9a84c55", margin: "12px auto" }}/>
                  <p style={{ fontSize: 12, color: "rgba(245,230,184,.6)", fontStyle: "italic", marginBottom: 8 }}>{inv.closing}</p>
                  {inv.note && <p style={{ fontSize: 11, color: "#5a5040" }}>{inv.note}</p>}
                  <div style={{
                    position: "absolute", bottom: 0, left: 0, right: 0, height: 3,
                    background: `linear-gradient(90deg,transparent,${isVip ? "#9b4bd4" : "#c9a84c"},transparent)`,
                  }}/>
                </div>

                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 12 }}>
                  <div style={{ fontSize: 13, color: "#7a6a4a", fontWeight: 700, marginBottom: 4 }}>
                    {t("feature_section")}
                  </div>
                  {inv.features.map(f => (
                    <div key={f} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                        background: isVip ? "rgba(155,75,212,.15)" : "rgba(201,168,76,.12)",
                        border: `1px solid ${isVip ? "#9b4bd455" : "#c9a84c55"}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, color: isVip ? "#c084fc" : "#c9a84c",
                      }}>✓</div>
                      <span style={{ fontSize: 14, color: "rgba(245,230,184,.85)" }}>{f}</span>
                    </div>
                  ))}
                  <div style={{
                    marginTop: 8, padding: "10px 14px", borderRadius: 10,
                    background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)",
                    fontSize: 12, color: "#7a6a4a",
                  }}>
                    {t("both_types_note")}
                  </div>
                </div>
              </div>
            );
          })}

          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <h3 style={{ color: "#c9a84c", fontSize: 17, fontWeight: 800, marginBottom: 20 }}>{t("delivery_title")}</h3>
          </div>
          <div className="gold-card" style={{ padding: "24px 28px", textAlign: "center", maxWidth: 560, margin: "0 auto" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🚀</div>
            <div style={{ fontWeight: 900, color: "#c9a84c", fontSize: 18, marginBottom: 6 }}>{t("delivery_subtitle")}</div>
            <div style={{ fontSize: 13, color: "rgba(245,230,184,.7)", lineHeight: 1.8 }}>
              {t("delivery_body_lines").map((line, i) => (
                <span key={i}>{line}{i < t("delivery_body_lines").length - 1 && <br/>}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" style={{ padding: "80px 24px", maxWidth: 760, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div className="section-label">{t("pricing_label")}</div>
          <h2 style={{ fontSize: "clamp(26px,4vw,42px)", fontWeight: 900, color: "#c9a84c", fontFamily: "'Amiri',serif" }}>
            {t("pricing_title")}
          </h2>
          <p style={{ color: "#7a6a4a", fontSize: 13, marginTop: 8 }}>
            {t("pricing_subtitle")}
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 18, marginBottom: 32 }}>
          <div style={{
            background: "linear-gradient(145deg,#1a0e00,#2a1800)",
            border: "1.5px solid #c9a84c55", borderRadius: 22, padding: 28, textAlign: "center",
          }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✦</div>
            <h3 style={{ color: "#c9a84c", fontSize: 19, fontWeight: 900, marginBottom: 8 }}>{t("price_premium_title")}</h3>
            <div style={{ fontSize: 13, color: "rgba(245,230,184,.6)", lineHeight: 1.8, marginBottom: 12 }}>
              <strong style={{ color: "#c9a84c", fontSize: 22 }}>{t("price_premium_discount")}</strong><br/>
              {t("price_premium_vs")}
            </div>
            <div style={{ fontSize: 12, color: "#5a5040", marginBottom: 20 }}>
              {t("price_premium_body")}
            </div>
            <button className="ghost-btn" style={{ width: "100%" }} onClick={onEnterPortal}>
              {t("price_contact")}
            </button>
          </div>

          <div style={{
            background: "linear-gradient(145deg,#05050f,#0d0d20)",
            border: "1.5px solid #9b4bd4", borderRadius: 22, padding: 28, textAlign: "center",
            position: "relative",
          }}>
            <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)",
              background: "linear-gradient(135deg,#9b4bd4,#c084fc)", color: "#fff",
              padding: "4px 18px", borderRadius: 20, fontSize: 11, fontWeight: 900, whiteSpace: "nowrap",
            }}>{t("price_vip_badge")}</div>
            <div style={{ fontSize: 40, marginBottom: 10 }}>♛</div>
            <h3 style={{ color: "#c084fc", fontSize: 19, fontWeight: 900, marginBottom: 8 }}>{t("price_vip_title")}</h3>
            <div style={{ fontSize: 13, color: "rgba(245,230,184,.6)", lineHeight: 1.8, marginBottom: 12 }}>
              <strong style={{ color: "#c084fc", fontSize: 22 }}>{t("price_vip_normal")}</strong><br/>
              {t("price_vip_pitch")}
            </div>
            <div style={{ fontSize: 12, color: "#5a5040", marginBottom: 20 }}>
              {t("price_vip_body")}
            </div>
            <button className="gold-btn" style={{ width: "100%" }} onClick={onEnterPortal}>
              {t("price_contact")}
            </button>
          </div>
        </div>

        <div style={{
          marginTop: 28, padding: "18px 24px", textAlign: "center",
          background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 14,
          fontSize: 13, color: "#7a6a4a",
        }}>
          {t("price_both_note")}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: "1px solid rgba(201,168,76,.1)", padding: "40px 24px", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 22 }}>✉</span>
          <span style={{ fontFamily: "'Amiri',serif", fontSize: 22, color: "#c9a84c" }}>{lang === "he" ? "דעוה" : "دعوة"}</span>
        </div>
        <div style={{ fontSize: 12, color: "#5a5040", marginBottom: 16 }}>
          {t("footer_tagline")}
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="ghost-btn" style={{ padding: "8px 18px", fontSize: 12 }} onClick={onEnterPortal}>{t("nav_portal")}</button>
        </div>
      </footer>
    </div>
  );
}
