// Always-visible terms acknowledgment banner — shown at the top of every
// groom portal page. The "شروط استخدام" text is a link that opens /terms
// in a new tab so the groom doesn't lose their place in the portal.
import { Link } from "react-router-dom";
import { C } from "../styles/theme.js";

export function TermsNotice({ t }) {
  return (
    <div style={{
      maxWidth: 900, margin: "12px auto 4px",
      paddingInline: 16,
    }}>
      <div style={{
        padding: "10px 16px",
        borderRadius: 10,
        background: "linear-gradient(135deg, rgba(201,168,76,.10), rgba(201,168,76,.04))",
        border: "1px solid rgba(201,168,76,.32)",
        color: C.goldLight,
        fontSize: 13, lineHeight: 1.6, fontWeight: 600,
        textAlign: "center",
        display: "flex", flexWrap: "wrap",
        gap: 2, justifyContent: "center", alignItems: "center",
      }}>
        <span style={{ color: "#e8d68a", opacity: 0.85, marginInlineEnd: 6 }}>ℹ</span>
        <span>{t("groom_terms_notice_prefix")}</span>
        <Link to="/terms" target="_blank" rel="noopener noreferrer" style={{
          color: C.gold, fontWeight: 800, textDecoration: "underline",
          textUnderlineOffset: 3,
        }}>{t("groom_terms_notice_link")}</Link>
        <span>{t("groom_terms_notice_suffix")}</span>
      </div>
    </div>
  );
}
