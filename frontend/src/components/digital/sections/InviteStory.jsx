import { SectionHead } from "../inviteShared.jsx";

// ── Story timeline ─────────────────────────────────────────────────────────────
function StorySection({ items, theme, font, lang }) {
  return (
    <section className="dawa-inv-section" id="inv-story">
      <SectionHead
        eyebrow={lang === "he" ? "הסיפור שלנו" : "قصتنا"}
        title={lang === "he" ? "המסע שלנו עד היום" : "رحلتنا حتى اليوم"}
        sub={lang === "he" ? "מהמפגש הראשון ועד הרגע שבו נחלוק איתכם את שמחתנו." : "من لحظة التعارف الأولى إلى اللحظة التي نشارككم فيها فرحنا."}
        theme={theme}
        font={font}
      />
      <div className="dawa-inv-timeline" style={{ "--line": theme.accentLine }}>
        {items.map((s, i) => (
          <div key={i} className={`dawa-inv-story dawa-inv-reveal ${i % 2 === 0 ? "is-right" : "is-left"}`}>
            <span className="dawa-inv-story-node" style={{ background: theme.accent, boxShadow: `0 0 0 4px ${theme.bg}, 0 0 0 5px ${theme.accentLine}` }} />
            {s.icon && <div className="dawa-inv-story-icon" style={{ color: theme.accent }}>{s.icon}</div>}
            {s.when && <div className="dawa-inv-story-when" style={{ color: theme.textSoft, fontFamily: font.family }}>{s.when}</div>}
            {s.title && <h3 className="dawa-inv-story-title" style={{ color: theme.text, fontFamily: font.family }}>{s.title}</h3>}
            {s.body && <p className="dawa-inv-story-body" style={{ color: theme.textSoft }}>{s.body}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}


export { StorySection };
