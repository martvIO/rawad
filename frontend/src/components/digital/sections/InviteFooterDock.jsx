import { useRef,useState } from "react";
import { ON_GOLD, FloralFlourish } from "../inviteShared.jsx";

// ── Footer ──────────────────────────────────────────────────────────────────────
function InviteFooter({ theme, font, lang }) {
  return (
    <footer className="dawa-inv-foot">
      <div className="dawa-inv-foot-flourish">
        <FloralFlourish theme={theme} width={210} />
      </div>
      <div
        className="dawa-inv-foot-mark dawa-inv-grad"
        style={{ fontFamily: font.family, background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
      >
        {lang === "he" ? "דעוה" : "دعوة"}
      </div>
      {/* Company-name suffix under the wordmark — smaller + accent colour so it
          reads as the second word of the brand ("دعوة فرحنا" / "דעוה שמחתנו"). */}
      <div style={{ marginTop: -6, marginBottom: 12, fontSize: 18, fontWeight: 700, color: theme.accent, fontFamily: font.family }}>
        {lang === "he" ? "שמחתנו" : "فرحنا"}
      </div>
      <div className="dawa-inv-foot-tag" style={{ color: theme.accent, fontFamily: font.family }}>
        {lang === "he" ? "— הזמנה דיגיטלית · נעשה באהבה —" : "— بطاقة دعوة رقمية · صُنعت بحبّ —"}
      </div>
    </footer>
  );
}

// ── Floating action dock ──────────────────────────────────────────────────────
function FloatingDock({ theme, lang, fixed, weddingDate, groomName, brideName, venue, venueAddress, showMusic, musicUrl }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: lang === "he" ? "הזמנה לחתונה" : "دعوة زفاف", url }); } catch { /* dismissed */ }
    } else if (navigator.clipboard) {
      try { await navigator.clipboard.writeText(url); } catch { /* ignored */ }
    }
  };
  const addToCalendar = () => {
    if (!weddingDate) return;
    const dt = new Date(weddingDate);
    const fmt = (d) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const summary = [groomName, brideName].filter(Boolean).join(" & ") || "Wedding";
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Dawa//Invitation//AR", "BEGIN:VEVENT",
      `UID:dawa-${weddingDate}@dawa.app`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(dt)}`,
      `DTEND:${fmt(new Date(dt.getTime() + 5 * 3600 * 1000))}`,
      `SUMMARY:${summary}`,
      `LOCATION:${[venue, venueAddress].filter(Boolean).join(", ")}`,
      "END:VEVENT", "END:VCALENDAR",
    ].join("\n");
    const blob = new Blob([ics], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dawa-invitation.ics";
    document.body.appendChild(a); a.click(); a.remove();
  };
  const toggleMusic = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); }
    else { el.play().then(() => setPlaying(true)).catch(() => {}); }
  };

  const btnStyle = { borderColor: theme.accentLine, color: theme.accent };
  return (
    <div className="dawa-inv-dock" style={{ position: fixed ? "fixed" : "absolute" }}>
      {showMusic && (
        <>
          <button className={`dawa-inv-dock-btn${playing ? " is-on" : ""}`} style={playing ? { background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`, color: ON_GOLD, borderColor: "transparent" } : btnStyle} onClick={toggleMusic} aria-label="music">
            {playing ? "♫" : "♪"}
            {playing && <span className="dawa-inv-dock-pulse" style={{ borderColor: theme.accent }} />}
          </button>
          <audio ref={audioRef} src={musicUrl} loop preload="none" />
        </>
      )}
      <button className="dawa-inv-dock-btn" style={btnStyle} onClick={share} aria-label="share">⤴</button>
      {weddingDate && <button className="dawa-inv-dock-btn" style={btnStyle} onClick={addToCalendar} aria-label="calendar">📅</button>}
    </div>
  );
}

export { InviteFooter, FloatingDock };
