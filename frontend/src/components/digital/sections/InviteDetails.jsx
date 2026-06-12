import { SectionHead } from "../inviteShared.jsx";

// ── Wedding details ─────────────────────────────────────────────────────────────
function DetailsSection({ items, theme, font, lang }) {
  return (
    <section className="dawa-inv-section">
      <SectionHead
        eyebrow={lang === "he" ? "פרטי היום" : "تفاصيل اليوم"}
        title={lang === "he" ? "כל מה שצריך לדעת" : "كل ما تحتاجون معرفته"}
        sub={lang === "he" ? "מידע קצר כדי לתכנן את הזמן ולבלות יחד ערב שלם." : "معلومات سريعة لتنظيم وقتكم، ولنقضي معاً ليلة كاملة."}
        theme={theme}
        font={font}
      />
      <div className="dawa-inv-details">
        {items.map((c, i) => (
          <div key={i} className="dawa-inv-detail dawa-inv-reveal">
            {c.icon && <div className="dawa-inv-detail-icon" style={{ color: theme.accent }}>{c.icon}</div>}
            {c.meta && <div className="dawa-inv-detail-meta" style={{ color: theme.accent }}>{c.meta}</div>}
            {c.title && <h3 className="dawa-inv-detail-title" style={{ color: theme.text, fontFamily: font.family }}>{c.title}</h3>}
            {c.body && <p className="dawa-inv-detail-body" style={{ color: theme.textSoft }}>{c.body}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}


export { DetailsSection };
