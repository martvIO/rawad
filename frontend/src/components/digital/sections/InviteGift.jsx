import { SectionHead } from "../inviteShared.jsx";

// ── Gift ──────────────────────────────────────────────────────────────────────
function GiftSection({ giftNote, giftIban, theme, font, lang }) {
  return (
    <section className="dawa-inv-section">
      <SectionHead
        eyebrow={lang === "he" ? "מתנה" : "هدية"}
        title={lang === "he" ? "נוכחותכם היא המתנה" : "حضوركم أجمل هدية"}
        theme={theme}
        font={font}
      />
      <div className="dawa-inv-rsvp" style={{ textAlign: "center" }}>
        {giftNote && <p style={{ color: theme.textSoft, fontSize: 15, lineHeight: 1.9, fontFamily: font.family, marginBottom: giftIban ? 18 : 0 }}>{giftNote}</p>}
        {giftIban && (
          <div style={{ color: theme.text, fontSize: 15, fontFamily: font.family, direction: "ltr", padding: "12px 0", borderTop: `1px solid ${theme.accentLine}` }}>
            <span style={{ color: theme.accent, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", display: "block", marginBottom: 6 }}>IBAN</span>
            {giftIban}
          </div>
        )}
      </div>
    </section>
  );
}


export { GiftSection };
