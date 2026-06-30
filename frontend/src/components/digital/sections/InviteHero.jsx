import { Num } from "../../Num.jsx";
import { BrandLogo } from "../../BrandLogo.jsx";
import { FloralFlourish } from "../inviteShared.jsx";

// ── Hero ──────────────────────────────────────────────────────────────────────

function Hero({ guestName, groomName, brideName, monogram, eyebrow, dateText, venueLine, heroMedia = [], theme, font, lang }) {
  return (
    <section className="dawa-inv-hero" id="inv-top">
      <div
        aria-hidden="true"
        className="dawa-inv-hero-glow"
        style={{
          background: `radial-gradient(ellipse 80% 60% at 50% 30%, ${theme.accentMuted} 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 50% 80%, ${theme.accentMuted} 0%, transparent 65%)`,
        }}
      />
      <div className="dawa-inv-hero-frame" aria-hidden="true" style={{ borderColor: theme.accent }}>
        <span className="dawa-inv-corner dawa-inv-corner-tl" style={{ borderColor: theme.accent }} />
        <span className="dawa-inv-corner dawa-inv-corner-tr" style={{ borderColor: theme.accent }} />
        <span className="dawa-inv-corner dawa-inv-corner-bl" style={{ borderColor: theme.accent }} />
        <span className="dawa-inv-corner dawa-inv-corner-br" style={{ borderColor: theme.accent }} />
      </div>
      <div className="dawa-inv-hero-logo">
        <BrandLogo size={96} />
      </div>
      <div className="dawa-inv-hero-flourish">
        <FloralFlourish theme={theme} width={200} />
      </div>
      <div className="dawa-inv-hero-eyebrow" style={{ color: theme.accent, fontFamily: font.family }}>
        <span style={{ width: 40, height: 1, background: `linear-gradient(90deg, transparent, ${theme.accent})` }} />
        {eyebrow}
        <span style={{ width: 40, height: 1, background: `linear-gradient(90deg, ${theme.accent}, transparent)` }} />
      </div>

      <div className="dawa-inv-monogram">
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <defs>
            <linearGradient id={`dawa-mono-${theme.key}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={theme.monoStops[0]} />
              <stop offset="50%" stopColor={theme.monoStops[1]} />
              <stop offset="100%" stopColor={theme.monoStops[2]} />
            </linearGradient>
          </defs>
          {/* Royal crest: a crown above the initials + symmetric laurel
              sprigs + a bottom flourish. Open (no enclosing ring) so it reads
              luxurious and draws the eye. All strokes/fills use the theme's
              mono gradient so it adapts to every palette. */}
          <g className="dawa-inv-crown">
            <path
              d="M68 52 L68 35 L83.5 47 L100 28 L116.5 47 L132 35 L132 52 Z"
              fill="none"
              stroke={`url(#dawa-mono-${theme.key})`}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path d="M66 54 H134" stroke={`url(#dawa-mono-${theme.key})`} strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="68" cy="32" r="2.6" fill={theme.accent} />
            <circle className="dawa-inv-crown-gem" cx="100" cy="24.5" r="3.4" fill={theme.accent} />
            <circle cx="132" cy="32" r="2.6" fill={theme.accent} />
            <circle cx="100" cy="46" r="2.2" fill={theme.accent} />
          </g>

          {/* side laurel sprigs — left, then mirrored to the right */}
          {[false, true].map((mirror) => (
            <g key={mirror ? "sprig-r" : "sprig-l"} transform={mirror ? "translate(200,0) scale(-1,1)" : undefined}>
              <path d="M27 124 C 22 106, 28 91, 43 82" fill="none" stroke={`url(#dawa-mono-${theme.key})`} strokeWidth="1.3" strokeLinecap="round" opacity="0.85" />
              <ellipse cx="26" cy="118" rx="2.6" ry="7" fill={`url(#dawa-mono-${theme.key})`} transform="rotate(30 26 118)" />
              <ellipse cx="24" cy="105" rx="2.6" ry="7.5" fill={`url(#dawa-mono-${theme.key})`} transform="rotate(8 24 105)" />
              <ellipse cx="28" cy="92" rx="2.5" ry="7" fill={`url(#dawa-mono-${theme.key})`} transform="rotate(-16 28 92)" />
              <ellipse cx="37" cy="83" rx="2.3" ry="6.2" fill={`url(#dawa-mono-${theme.key})`} transform="rotate(-34 37 83)" />
            </g>
          ))}

          {/* bottom flourish */}
          <g fill={`url(#dawa-mono-${theme.key})`}>
            <path d="M100 150 q6 11 0 22 q-6 -11 0 -22 Z" />
            <ellipse cx="86" cy="160" rx="2.4" ry="6.5" transform="rotate(44 86 160)" />
            <ellipse cx="114" cy="160" rx="2.4" ry="6.5" transform="rotate(-44 114 160)" />
            <circle cx="100" cy="176" r="1.7" />
          </g>
        </svg>
        <span
          className="dawa-inv-monogram-letters dawa-inv-grad"
          style={{
            fontFamily: font.family,
            background: `linear-gradient(135deg,${theme.monoStops.join(",")})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {monogram}
        </span>
      </div>

      {groomName && (
        <h1
          className="dawa-inv-couple dawa-inv-grad"
          style={{
            fontFamily: font.family,
            background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {groomName}
        </h1>
      )}
      {groomName && brideName && (
        <span className="dawa-inv-amp" style={{ color: theme.accent, fontFamily: font.family }}>
          {lang === "he" ? "ו" : "و"}
        </span>
      )}
      {brideName && (
        <h1
          className="dawa-inv-couple dawa-inv-grad"
          style={{
            fontFamily: font.family,
            background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {brideName}
        </h1>
      )}

      {(dateText || venueLine) && (
        <div
          className="dawa-inv-dateline"
          style={{ background: theme.chipBg, border: `1px solid ${theme.chipBorder}`, color: theme.text, fontFamily: font.family }}
        >
          {dateText && <strong style={{ color: theme.accent, fontWeight: 700 }}><Num dir="auto">{dateText}</Num></strong>}
          {dateText && venueLine && <span className="dawa-inv-dot" style={{ background: theme.accent }} />}
          {venueLine && <span>{venueLine}</span>}
        </div>
      )}

      <div className="dawa-inv-greet" style={{ color: theme.textSoft, fontFamily: font.family }}>
        {lang === "he" ? "מתכבדים להזמינכם," : "يتشرفون بدعوتكم،"}
        <strong
          className="dawa-inv-grad"
          style={{
            background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {guestName || "—"}
        </strong>
      </div>

      {heroMedia.length > 0 && (
        <div className="dawa-inv-hero-media">
          {heroMedia.map((m, i) => (
            <div
              key={m.storagePath || i}
              className="dawa-inv-hero-media-item"
              style={{ borderColor: theme.accentLine, boxShadow: `0 18px 40px -18px ${theme.accentMuted}` }}
            >
              {m.kind === "video" ? (
                <video src={m.url} autoPlay muted loop playsInline />
              ) : (
                <img src={m.url} alt="" loading="lazy" />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="dawa-inv-cue" style={{ color: theme.accent, fontFamily: font.family }}>
        <span>{lang === "he" ? "גלול לסיפור" : "اسحب للقصة"}</span>
        <span className="dawa-inv-cue-line" style={{ background: `linear-gradient(180deg, ${theme.accent}, transparent)` }} />
      </div>
    </section>
  );
}


export { Hero };
