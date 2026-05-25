// Public Terms & Conditions page — reads sections from i18n.
import { useNavigate } from "react-router-dom";
import { C } from "../styles/theme.js";
import { BrandLogo } from "../components/BrandLogo.jsx";

export function TermsPage({ t, lang }) {
  const navigate = useNavigate();
  const sections = t("terms_sections") || [];

  return (
    <div style={{
      background: C.bg, color: "#fff3c0",
      minHeight: "100vh", paddingBlock: "60px 80px",
      paddingInline: 24,
    }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <button
          onClick={() => navigate("/")}
          style={{
            background: "transparent", border: "1px solid rgba(201,168,76,.30)",
            color: "#c9a84c", fontFamily: "inherit",
            padding: "10px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700,
            cursor: "pointer", marginBottom: 36,
            transition: "all .25s ease",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(201,168,76,.10)"; e.currentTarget.style.borderColor = "#c9a84c"; e.currentTarget.style.color = "#fff3c0"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "rgba(201,168,76,.30)"; e.currentTarget.style.color = "#c9a84c"; }}
        >{t("terms_back")}</button>

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
          <BrandLogo size={48} />
          <h1 style={{
            fontFamily: "'Amiri',serif", fontWeight: 900,
            fontSize: "clamp(32px, 4.5vw, 48px)", lineHeight: 1.2,
            background: "linear-gradient(135deg,#fff3c0,#f0c84c,#c9a84c)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            margin: 0, paddingBlock: 4,
          }}>{t("terms_title")}</h1>
        </div>

        <p style={{
          color: "#d8c9a6", fontSize: 16, lineHeight: 1.9,
          marginBottom: 40, paddingInlineStart: 16,
          borderInlineStart: "2px solid rgba(201,168,76,.35)",
        }}>{t("terms_intro")}</p>

        <div>
          {sections.map((s, i) => (
            <section key={i} style={{
              padding: "28px 28px",
              marginBottom: 18,
              borderRadius: 16,
              background: "linear-gradient(180deg, rgba(201,168,76,.04), rgba(201,168,76,.01))",
              border: "1px solid rgba(201,168,76,.18)",
            }}>
              <h2 style={{
                fontFamily: "'Amiri',serif", fontWeight: 800,
                fontSize: 20, color: "#fff3c0",
                marginTop: 0, marginBottom: 12, lineHeight: 1.4,
              }}>{s.title}</h2>
              <p style={{
                color: "#d8c9a6", fontSize: 14.5, lineHeight: 1.9,
                margin: 0,
              }}>{s.body}</p>
            </section>
          ))}
        </div>

        <div style={{
          marginTop: 48, paddingTop: 24,
          borderTop: "1px solid rgba(201,168,76,.14)",
          color: "#7a6a4a", fontSize: 12, textAlign: "center",
        }}>
          © {new Date().getFullYear()} {lang === "he" ? "דעוה" : "دعوة"}
        </div>
      </div>
    </div>
  );
}
