// DOM overlay that rides over the WebGL 3D envelope. The envelope GEOMETRY is
// rendered in the celestial canvas; the legible text is DOM (RTL-safe):
//   - "sealed": a tap hint + the guest's name (personalization on the closed
//     envelope front). The whole layer is the tap target that opens it.
//   - "revealing"/"done": the groom & bride names fade in over the risen letter,
//     using the same gradient treatment as the hero so the hand-off reads as one
//     continuous element settling into place.
// The names sit at a fixed viewport anchor that matches the engine's static
// framing pose — no per-frame WebGL→DOM coordinate sync needed.

function CoupleName({ name, theme, font }) {
  return (
    <h1
      className="dawa-inv-couple dawa-inv-grad"
      style={{
        margin: "2px 0",
        fontFamily: font.family,
        background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`,
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
      }}
    >
      {name}
    </h1>
  );
}

export function CelestialEnvelopeOverlay({ phase, guestName, groomName, brideName, theme, font, lang, onOpen }) {
  const sealed = phase === "sealed";
  const revealing = phase === "revealing" || phase === "done";

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

      {/* Revealing: couple names over the risen letter, centred like the hero. */}
      {revealing && (
        <div
          data-testid="envelope-reveal"
          style={{
            position: "absolute",
            insetInline: 0,
            top: "36%",
            transform: "translateY(-50%)",
            textAlign: "center",
            padding: "0 24px",
            animation: "dawa-inv-rise .9s cubic-bezier(.2,.7,.2,1) both",
          }}
        >
          {groomName && <CoupleName name={groomName} theme={theme} font={font} />}
          {groomName && brideName && (
            <span className="dawa-inv-amp" style={{ color: theme.accent, fontFamily: font.family }}>
              {lang === "he" ? "ו" : "و"}
            </span>
          )}
          {brideName && <CoupleName name={brideName} theme={theme} font={font} />}
        </div>
      )}
    </div>
  );
}
