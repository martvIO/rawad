// Catch-all not-found view (SEO-05). Replaces a silent <Navigate to="/">, which
// made every typo'd URL a soft-404: 200 + the shell, then a redirect that told a
// guest with a broken invite link nothing at all.
//
// Firebase Hosting's SPA rewrite means this still answers 200 — the status code
// isn't ours to set — so the robots meta below is what actually keeps unknown
// URLs (and /sitemap.xml) out of an index. Visual language matches TermsPage.
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { C } from "../styles/theme.js";
import { BrandLogo } from "../components/BrandLogo.jsx";

export function NotFoundPage({ t, lang }) {
  // Owned here rather than in App.jsx's central head wiring: noindex is a
  // property of this view, not of a route pattern — the same component would
  // need it wherever it were mounted. Removed on unmount so a client-side
  // navigation back to a real page doesn't leave the whole SPA noindexed.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  return (
    <div style={{
      background: C.bg, color: "#fff3c0",
      minHeight: "100vh", paddingBlock: "60px 80px",
      paddingInline: 24,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{ maxWidth: 560, width: "100%", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
          <BrandLogo size={56} />
        </div>

        {/* Latin numerals — no letter-spacing anywhere on this page: the body copy
            below is Arabic/Hebrew and spacing would break the joins. */}
        <div style={{
          fontFamily: "'Amiri','Frank Ruhl Libre','Amiri Fallback',serif",
          fontWeight: 900, fontSize: "clamp(64px, 12vw, 104px)",
          lineHeight: 1, color: "rgba(201,168,76,.22)",
          marginBottom: 8,
        }}>404</div>

        <h1 style={{
          fontFamily: "'Amiri','Frank Ruhl Libre','Amiri Fallback',serif", fontWeight: 900,
          fontSize: "clamp(26px, 4vw, 38px)", lineHeight: 1.3,
          background: "linear-gradient(135deg,#fff3c0,#f0c84c,#c9a84c)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          // Headroom so the clip box can't shave Arabic descenders/diacritics.
          margin: 0, paddingBlock: 6,
        }}>{t("notfound_title")}</h1>

        <p style={{
          color: "#d8c9a6", fontSize: 15.5, lineHeight: 1.9,
          margin: "18px auto 36px", maxWidth: 460,
        }}>{t("notfound_body")}</p>

        {/* A real <a> (not a navigate() button): a crawler that lands here still
            finds its way to the indexable home page. */}
        <Link
          to="/"
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "12px 26px", borderRadius: 999, textDecoration: "none",
            border: "1px solid rgba(201,168,76,.35)", color: "#fff3c0",
            fontSize: 14, fontWeight: 700, background: "rgba(201,168,76,.08)",
            transition: "all .25s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(201,168,76,.16)"; e.currentTarget.style.borderColor = "#c9a84c"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(201,168,76,.08)"; e.currentTarget.style.borderColor = "rgba(201,168,76,.35)"; }}
        >{t("notfound_home")}</Link>

        <div style={{
          marginTop: 48, paddingTop: 24,
          borderTop: "1px solid rgba(201,168,76,.14)",
          color: C.dim, fontSize: 12,
        }}>
          © {new Date().getFullYear()} {lang === "he" ? "דעוה" : "دعوة"}
        </div>
      </div>
    </div>
  );
}
