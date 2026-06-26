// DOM overlay that rides over the WebGL 3D envelope. The envelope GEOMETRY (and,
// in the premium reveal, the couple's names baked onto the cream card) is
// rendered in the celestial canvas; this layer carries only the legible SEALED
// text (RTL-safe):
//   - "sealed": a tap hint + the guest's name (personalization on the closed
//     envelope front). The whole layer is the tap target that opens it.
//   - "revealing"/"done": nothing — the 3D card itself now shows the couple's
//     names + blessing + welcome, so the overlay just fades out of the way.
// The text sits at a fixed viewport anchor below the framed envelope — no
// per-frame WebGL→DOM coordinate sync needed.

export function CelestialEnvelopeOverlay({ phase, guestName, theme, font, lang, onOpen }) {
  const sealed = phase === "sealed";

  return (
    <div
      role={sealed ? "button" : undefined}
      tabIndex={sealed ? 0 : undefined}
      aria-label={sealed ? "open invitation" : undefined}
      onClick={sealed ? onOpen : undefined}
      onKeyDown={sealed ? (e) => (e.key === "Enter" || e.key === " ") && onOpen() : undefined}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        pointerEvents: sealed ? "auto" : "none",
        cursor: sealed ? "pointer" : "default",
        fontFamily: font.family,
        opacity: phase === "done" ? 0 : 1,
        transition: "opacity .6s ease",
      }}
    >
      {/* Sealed: hint + guest name, anchored below the framed envelope. */}
      {sealed && (
        <div
          data-testid="envelope-sealed"
          style={{
            position: "absolute",
            insetInline: 0,
            bottom: "13vh",
            textAlign: "center",
            padding: "0 24px",
          }}
        >
          <div
            style={{
              color: theme.accent,
              fontSize: 13,
              letterSpacing: 3,
              textTransform: "uppercase",
              fontStyle: "italic",
              marginBottom: 18,
              animation: "dawa-inv-cue 2.6s ease-in-out infinite",
            }}
          >
            — {lang === "he" ? "לחץ לפתיחת ההזמנה" : "اضغط لفتح الدعوة"} —
          </div>
          {guestName && (
            <div className="dawa-inv-grad" style={{ fontWeight: 900, fontSize: "clamp(24px,5vw,40px)", color: theme.text }}>
              {guestName}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
