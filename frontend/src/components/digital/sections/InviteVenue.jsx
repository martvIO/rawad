import { Num } from "../../Num.jsx";
import { ON_GOLD, SectionHead } from "../inviteShared.jsx";

// ── Venue + faux map + hotels ────────────────────────────────────────────────────
function VenueSection({ venue, venueCity, venueAddress, accessNote, hotels, theme, font, lang }) {
  const venueQuery = [venue, venueAddress, venueCity].filter(Boolean).join(" ");
  const mapsHref = `https://maps.google.com/?q=${encodeURIComponent(venueQuery)}`;
  // Waze is the dominant navigation app in Israel — offer it alongside Google Maps.
  const wazeHref = `https://waze.com/ul?q=${encodeURIComponent(venueQuery)}`;
  return (
    <section className="dawa-inv-section" id="inv-venue">
      <SectionHead
        eyebrow={lang === "he" ? "המקום" : "المكان"}
        title={lang === "he" ? "היכן נחגוג" : "حيث سنحتفل"}
        sub={[venue, venueAddress].filter(Boolean).join(" — ")}
        theme={theme}
        font={font}
      />
      <div className="dawa-inv-venue">
        <div className="dawa-inv-venue-map dawa-inv-reveal" style={{ borderColor: theme.accentLine }} aria-hidden="true">
          <svg viewBox="0 0 600 400" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
            <defs>
              <linearGradient id={`dawa-route-${theme.key}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={theme.monoStops[0]} />
                <stop offset="100%" stopColor={theme.accent} />
              </linearGradient>
              <pattern id={`dawa-vgrid-${theme.key}`} width="42" height="42" patternUnits="userSpaceOnUse">
                <path d="M42 0 H0 V42" fill="none" stroke={theme.accentMuted} strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="600" height="400" fill={`url(#dawa-vgrid-${theme.key})`} />
            <path d="M 0 280 Q 130 220 260 240 T 600 220" stroke={theme.accentLine} strokeWidth="2" fill="none" />
            <path d="M 80 0 Q 100 140 130 220 T 200 400" stroke={theme.accentMuted} strokeWidth="2" fill="none" />
            <path d="M 400 0 Q 440 120 460 240 T 540 400" stroke={theme.accentMuted} strokeWidth="2" fill="none" />
            <path
              d="M 90 360 Q 200 320 280 280 T 440 180"
              stroke={`url(#dawa-route-${theme.key})`}
              strokeWidth="3"
              fill="none"
              strokeDasharray="8 6"
              className="dawa-inv-route"
            />
            <g transform="translate(90 360)">
              <circle r="10" fill={theme.bg} stroke={theme.accent} strokeWidth="2" />
              <circle r="3" fill={theme.accent} />
            </g>
            <g transform="translate(440 180)">
              <circle r="22" fill={theme.accentMuted}>
                <animate attributeName="r" values="18;30;18" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values=".6;0;.6" dur="2.4s" repeatCount="indefinite" />
              </circle>
              <circle r="12" fill={`url(#dawa-route-${theme.key})`} stroke={theme.monoStops[0]} strokeWidth="2" />
              <text y="5" textAnchor="middle" fontWeight="900" fontSize="14" fill={ON_GOLD}>♛</text>
            </g>
          </svg>
        </div>
        <div className="dawa-inv-venue-info">
          {venueAddress && (
            <VenueRow icon="📍" label={lang === "he" ? "כתובת" : "العنوان"} theme={theme} font={font}>
              {venueAddress}
            </VenueRow>
          )}
          {accessNote && (
            <VenueRow icon="🚗" label={lang === "he" ? "הגעה" : "الوصول"} theme={theme} font={font}>
              {accessNote}
            </VenueRow>
          )}
          {hotels.length > 0 && (
            <VenueRow icon="🛏" label={lang === "he" ? "מלונות בקרבת מקום" : "فنادق قريبة"} theme={theme} font={font}>
              {hotels.map((h, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 14 }}>
                  <span>{h.name}</span>
                  {h.walk && <small style={{ color: theme.accent }}><Num dir="auto">{h.walk}</Num></small>}
                </div>
              ))}
            </VenueRow>
          )}
          <a className="dawa-inv-venue-row" href={mapsHref} target="_blank" rel="noreferrer" style={{ borderColor: theme.accentLine, textDecoration: "none" }}>
            <span className="dawa-inv-venue-ic" style={{ color: theme.accent }}>🗺</span>
            <div style={{ flex: 1 }}>
              <div className="dawa-inv-venue-label" style={{ color: theme.accent }}>{lang === "he" ? "ניווט" : "التوجيه"}</div>
              <div style={{ color: theme.accent, fontSize: 15, fontFamily: font.family }}>
                {lang === "he" ? "פתח ב‑Google Maps ←" : "افتح في خرائط جوجل ←"}
              </div>
            </div>
          </a>
          <a className="dawa-inv-venue-row" href={wazeHref} target="_blank" rel="noreferrer" style={{ borderColor: theme.accentLine, textDecoration: "none" }}>
            <span className="dawa-inv-venue-ic" style={{ color: theme.accent }}>🚗</span>
            <div style={{ flex: 1 }}>
              <div className="dawa-inv-venue-label" style={{ color: theme.accent }}>Waze</div>
              <div style={{ color: theme.accent, fontSize: 15, fontFamily: font.family }}>
                {lang === "he" ? "פתח ב‑Waze ←" : "افتح في Waze ←"}
              </div>
            </div>
          </a>
        </div>
      </div>
    </section>
  );
}

function VenueRow({ icon, label, children, theme, font }) {
  return (
    <div className="dawa-inv-venue-row dawa-inv-reveal" style={{ borderColor: theme.accentLine }}>
      <span className="dawa-inv-venue-ic" style={{ color: theme.accent }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div className="dawa-inv-venue-label" style={{ color: theme.accent }}>{label}</div>
        <div className="dawa-inv-venue-val" style={{ color: theme.text, fontFamily: font.family }}>{children}</div>
      </div>
    </div>
  );
}


export { VenueSection };
