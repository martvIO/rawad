import { Num } from "../../Num.jsx";
import { SectionHead } from "../inviteShared.jsx";

// ── Venue — destination card + details + real navigation CTAs ─────────────────
// (Replaced the previous decorative fake "map" SVG — random grid + squiggle
// roads + pulsing pin tied to nothing — with a real address hierarchy and the
// existing Google Maps / Waze links, which do the actual navigating.)
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
        theme={theme}
        font={font}
      />
      <div className="dawa-inv-venue">
        {/* Destination card — the hall name, city and address, elevated. */}
        {(venue || venueCity || venueAddress) && (
          <div className="dawa-inv-venue-card dawa-inv-reveal" style={{ background: theme.cardBg, borderColor: theme.cardBorder }}>
            {venue && <div className="dawa-inv-venue-name" style={{ color: theme.text, fontFamily: font.family }}>{venue}</div>}
            {venueCity && <div className="dawa-inv-venue-city" style={{ color: theme.accent, fontFamily: font.family }}>{venueCity}</div>}
            {venueAddress && <div className="dawa-inv-venue-addr" style={{ color: theme.textSoft, fontFamily: font.family }}>{venueAddress}</div>}
          </div>
        )}

        {(accessNote || hotels.length > 0) && (
          <div className="dawa-inv-venue-info">
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
          </div>
        )}

        {/* Real navigation — Google Maps + Waze. */}
        <div className="dawa-inv-venue-cta">
          <a className="dawa-inv-venue-btn" href={mapsHref} target="_blank" rel="noreferrer"
             style={{ borderColor: theme.accent, color: theme.accent, fontFamily: font.family }}>
            {lang === "he" ? "פתח ב‑Google Maps" : "افتح في خرائط جوجل"}
          </a>
          <a className="dawa-inv-venue-btn" href={wazeHref} target="_blank" rel="noreferrer"
             style={{ borderColor: theme.accent, color: theme.accent, fontFamily: font.family }}>
            {lang === "he" ? "פתח ב‑Waze" : "افتح في Waze"}
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
