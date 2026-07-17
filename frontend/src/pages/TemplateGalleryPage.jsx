// Public template gallery (/templates) — the prospect-facing showcase of every
// invitation template. Each card opens that template's live demo, so a visitor
// (or the owner, pasting a link into a WhatsApp sales chat) can experience the
// real thing rather than a screenshot.
//
// Entirely data-driven from the shared TEMPLATES metadata: registering a new
// template makes it appear here automatically. The page is lazy-routed, and
// imports thumbnails from templates/thumbs.js (NOT the registry) so it never
// pulls the eager classic invitation view into this chunk.
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DIGITAL_TEMPLATE_KEYS } from "@dawa/core/data/digitalTemplates.js";
import { useTemplateAssets } from "../hooks/useTemplateAssets.js";
import { TemplateCard } from "../components/TemplateCard.jsx";
import { BrandLogo } from "../components/BrandLogo.jsx";
import { createInviteMetrics } from "../utils/inviteMetrics.js";
import { C } from "../styles/theme.js";

export function TemplateGalleryPage({ t, lang, setLang }) {
  const navigate = useNavigate();
  const { resolveThumb } = useTemplateAssets();

  // Report this visit under the "gallery" surface. Without this the admin's
  // gallery KPI would render a measured-looking 0 forever — a fabricated metric,
  // which is exactly what the aggregator's honesty rules forbid. The page lists
  // every template rather than rendering one, so it reports the "all" sentinel;
  // it has no sealed intro, so it is ready as soon as it mounts.
  useEffect(() => {
    const m = createInviteMetrics({ surface: "gallery", templateId: "all", lang });
    m.handleIntroEvent("ready");
    return () => m.dispose();
    // Once per visit — a language toggle is not a new visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ background: C.bg, color: "#fff3c0", minHeight: "100vh" }}>
      {/* Chrome — brand, language toggle, back to the landing page. */}
      <header
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
          padding: "16px 24px", borderBottom: "1px solid rgba(201,168,76,.16)",
          position: "sticky", top: 0, zIndex: 10, background: "rgba(7,7,10,.9)", backdropFilter: "blur(8px)",
        }}
      >
        <button onClick={() => navigate("/")} aria-label={t("templates_back_home")}
          style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
          <BrandLogo size={30} />
        </button>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "inline-flex", gap: 1, padding: 3, borderRadius: 999, background: "rgba(255,255,255,.04)", border: "1px solid rgba(201,168,76,.22)" }}>
            {["ar", "he"].map((code) => (
              <button key={code} onClick={() => setLang(code)}
                style={{
                  padding: "4px 12px", borderRadius: 999, border: "none",
                  background: lang === code ? "linear-gradient(135deg,#fff3c0,#f0c84c,#c9a84c)" : "transparent",
                  color: lang === code ? "#07070a" : "#a09070",
                  fontSize: 10.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", letterSpacing: ".3px",
                }}>{code === "ar" ? "AR" : "HE"}</button>
            ))}
          </div>
          <button onClick={() => navigate("/")}
            style={{ background: "none", border: "none", color: C.dim, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            {t("templates_back_home")}
          </button>
        </div>
      </header>

      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 96px" }}>
        <div style={{ textAlign: "center", marginBottom: 48, maxWidth: 640, marginInline: "auto" }}>
          <h1 style={{
            fontFamily: "'Amiri','Frank Ruhl Libre','Amiri Fallback',serif", fontWeight: 900,
            fontSize: "clamp(30px,5vw,50px)", lineHeight: 1.3, paddingBlock: 6,
            background: "linear-gradient(135deg,#fff3c0,#f0c84c,#c9a84c)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>{t("templates_gallery_title")}</h1>
          <p style={{ color: "#d8c9a6", fontSize: 15, lineHeight: 1.9, marginTop: 12 }}>{t("templates_gallery_subtitle")}</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 20 }}>
          {DIGITAL_TEMPLATE_KEYS.map((id) => (
            <TemplateCard key={id} id={id} t={t} lang={lang} thumb={resolveThumb(id)} />
          ))}
        </div>
      </section>
    </div>
  );
}
