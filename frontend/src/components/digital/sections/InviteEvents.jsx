import { SectionHead } from "../inviteShared.jsx";

// ── Multi-day schedule (events[]) ───────────────────────────────────────────────
// A wedding here is often more than one evening — a henna night, the wedding, a
// reception — each with its own time, venue and map link. This renders that as an
// ordered timeline; the single-venue VenueSection still covers the main event, so
// this section is additive and stays hidden unless the couple fills it in.
//
// Row shape mirrors the server's EventItem exactly: `icon` + `mapUrl` are plain
// strings, `title`/`time`/`venue`/`address` arrive already localized by the caller.
function EventsSection({ items, theme, font, lang }) {
  const he = lang === "he";
  return (
    <section className="dawa-inv-section" id="inv-events">
      <SectionHead
        eyebrow={he ? "לוח האירוע" : "جدول الاحتفال"}
        title={he ? "כמה ימים, שמחה אחת" : "أيام عدّة، فرح واحد"}
        sub={he ? "כל תחנה בשמחה שלנו — מתי, איפה, ואיך מגיעים." : "كل محطة من فرحنا — متى، أين، وكيف تصلون."}
        theme={theme}
        font={font}
      />
      <ol className="dawa-inv-events">
        {items.map((e, i) => {
          // Prefer the couple's own map link; otherwise search the address/venue.
          const query = [e.venue, e.address].filter(Boolean).join(" ");
          const href = e.mapUrl || (query ? `https://maps.google.com/?q=${encodeURIComponent(query)}` : "");
          return (
            <li key={i} className="dawa-inv-event dawa-inv-reveal">
              <div className="dawa-inv-event-rail" aria-hidden="true">
                <span className="dawa-inv-event-dot" style={{ background: theme.accent, boxShadow: `0 0 0 4px ${theme.accentMuted}` }} />
                {i < items.length - 1 && <span className="dawa-inv-event-line" style={{ background: theme.accentLine }} />}
              </div>
              <div className="dawa-inv-event-body">
                <div className="dawa-inv-event-head">
                  {e.icon && <span className="dawa-inv-event-icon" aria-hidden="true">{e.icon}</span>}
                  {e.title && (
                    <h3 className="dawa-inv-event-title" style={{ color: theme.text, fontFamily: font.family }}>{e.title}</h3>
                  )}
                </div>
                {e.time && <div className="dawa-inv-event-time" style={{ color: theme.accent }}>{e.time}</div>}
                {e.venue && <div className="dawa-inv-event-venue" style={{ color: theme.text }}>{e.venue}</div>}
                {e.address && <div className="dawa-inv-event-addr" style={{ color: theme.textSoft }}>{e.address}</div>}
                {href && (
                  <a
                    className="dawa-inv-event-map"
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: theme.accent, borderColor: theme.accentLine }}
                  >
                    {he ? "פתח במפה ↗" : "افتح في الخريطة ↗"}
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export { EventsSection };
