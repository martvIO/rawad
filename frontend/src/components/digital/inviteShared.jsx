
// Shared building blocks for the digital-invitation sections — the gold-ink
// constant, section header, floral flourish, and the public top-bar buttons.
const ON_GOLD = "#2a0f00"; // dark ink for text sitting on the gold gradient

// ── Shared section header ────────────────────────────────────────────────────
function SectionHead({ eyebrow, title, sub, theme, font }) {
  return (
    <div className="dawa-inv-reveal" style={{ textAlign: "center", marginBottom: "var(--inv-head-gap)" }}>
      <div className="dawa-inv-secflourish">
        <FloralFlourish theme={theme} width={156} />
      </div>
      <div className="dawa-inv-eyebrow" style={{ color: theme.accent, fontFamily: font.family }}>
        {eyebrow}
      </div>
      <h2
        className="dawa-inv-title dawa-inv-grad"
        style={{
          fontFamily: font.family,
          background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        {title}
      </h2>
      <div className="dawa-inv-secrule" aria-hidden="true">
        <span style={{ background: `linear-gradient(90deg, transparent, ${theme.accent})` }} />
        <span className="dawa-inv-secrule-dot" style={{ background: theme.accent, boxShadow: `0 0 10px ${theme.sparkleGlow}` }} />
        <span style={{ background: `linear-gradient(90deg, ${theme.accent}, transparent)` }} />
      </div>
      {sub && (
        <p className="dawa-inv-sub" style={{ color: theme.textSoft, fontFamily: font.family }}>
          {sub}
        </p>
      )}
    </div>
  );
}

// Elegant symmetric floral flourish — a central blossom flanked by two leafy
// vines, themed to the design's accent. Used as a hero crown + footer ornament.
function FloralFlourish({ theme, width = 230, className = "" }) {
  const a = theme.accent;
  const m = theme.accentMuted;
  const petals = [0, 60, 120, 180, 240, 300];
  return (
    <svg className={`dawa-inv-flourish ${className}`.trim()} width={width} height={Math.round(width * 0.2)}
         viewBox="0 0 280 56" fill="none" aria-hidden="true">
      <g stroke={a} strokeWidth="1.4" strokeLinecap="round" fill="none" opacity="0.9">
        <path d="M140 28 C 112 30 88 18 54 24" />
        <path d="M140 28 C 168 30 192 18 226 24" />
      </g>
      <g fill={m} stroke={a} strokeWidth="0.7">
        <path d="M112 26 q -11 -10 -24 -7 q 9 11 24 7 Z" />
        <path d="M98 31 q -11 9 -24 6 q 9 -11 24 -6 Z" />
        <path d="M168 26 q 11 -10 24 -7 q -9 11 -24 7 Z" />
        <path d="M182 31 q 11 9 24 6 q -9 -11 -24 -6 Z" />
      </g>
      <g fill={a}>
        <circle cx="54" cy="24" r="3.4" />
        <circle cx="226" cy="24" r="3.4" />
      </g>
      <g transform="translate(140 28)">
        {petals.map((d) => (
          <ellipse key={d} rx="3.6" ry="9.5" fill={m} stroke={a} strokeWidth="0.9" transform={`rotate(${d})`} />
        ))}
        <circle r="4.6" fill={a} />
        <circle r="2" fill={theme.bg} opacity="0.5" />
      </g>
    </svg>
  );
}

// Guest-facing Arabic/Hebrew switch on the public invitation. Toggling drives
// the app `lang`, which re-renders both the built-in UI strings and every
// localized groom-authored field.
function LangToggle({ lang, setLang, theme, font }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 14,
        insetInlineEnd: 14,
        zIndex: 120,
        display: "inline-flex",
        borderRadius: 999,
        overflow: "hidden",
        border: `1px solid ${theme.chipBorder}`,
        background: theme.chipBg,
        backdropFilter: "blur(20px)",
      }}
    >
      {[
        { code: "ar", label: "عربي" },
        { code: "he", label: "עברית" },
      ].map(({ code, label }) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
          style={{
            appearance: "none",
            border: "none",
            cursor: "pointer",
            padding: "7px 14px",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: 0.5,
            fontFamily: font.family,
            background: lang === code ? theme.accent : "transparent",
            color: lang === code ? ON_GOLD : theme.accent,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// Guest-facing "صورك" button in the top menu of the public invitation. Sits in
// the opposite top corner from the language toggle so together they read as a
// top bar. Navigation is owned by the route wrapper (passed as onClick).
function SorekButton({ lang, isPublic = true, onClick, theme, font }) {
  return (
    <button
      onClick={onClick}
      aria-label={lang === "he" ? "התמונות שלך" : "صورك"}
      style={{
        // Fixed on the real invite (floats as the guest scrolls); absolute in
        // the editor/admin preview so it sits inside the preview box, not the page.
        position: isPublic ? "fixed" : "absolute",
        top: 14,
        insetInlineStart: 14,
        zIndex: 120,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        borderRadius: 999,
        padding: "7px 14px",
        cursor: "pointer",
        border: `1px solid ${theme.chipBorder}`,
        background: theme.chipBg,
        backdropFilter: "blur(20px)",
        color: theme.accent,
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: 0.5,
        fontFamily: font.family,
      }}
    >
      <span aria-hidden="true">📸</span>
      {lang === "he" ? "התמונות שלך" : "صورك"}
    </button>
  );
}

export { ON_GOLD, SectionHead, FloralFlourish, LangToggle, SorekButton };
