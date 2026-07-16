// Gilded Orchard's sealed-tap intro: the orchard at night — lights strung
// overhead, the fountain lit below, the guest's name between them. Tap anywhere
// and the lights bloom as the invitation opens.
//
// Behaviour is entirely the shared useIntroPhase contract; this file is visuals +
// the tap target only. Pure CSS/SVG, so the ritual never waits on a chunk.
import { StringLights, Fountain, L } from "./parts.jsx";

export function Intro({ t, lang, guestName, phase, cueEscalated, onOpen, onSkip, reduced }) {
  const sealed = phase === "sealed";
  const opening = phase === "opening";

  return (
    <div
      className="go-intro"
      data-testid="intro-sealed"
      role="button"
      tabIndex={0}
      aria-label={L(lang, "اضغط لفتح الدعوة", "לחצו לפתיחת ההזמנה")}
      onClick={sealed ? onOpen : undefined}
      onKeyDown={sealed ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } } : undefined}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: `radial-gradient(90% 45% at 50% 0%, color-mix(in srgb, ${t.bulbGlow} 18%, transparent) 0%, transparent 60%), ${t.theme.bg}`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between",
        padding: "0 0 6vh", cursor: sealed ? "pointer" : "default",
        opacity: opening ? 0 : 1,
        transition: "opacity 1s ease .5s",
        pointerEvents: opening ? "none" : "auto",
      }}
    >
      {/* Lights strung across the top — they brighten as it opens. */}
      <div
        style={{
          width: "100%",
          transform: opening ? "translateY(-6px)" : "none",
          filter: opening ? "brightness(1.5)" : "none",
          transition: "transform 1s ease, filter 1s ease",
        }}
      >
        <StringLights t={t} animate={!reduced} />
      </div>

      {/* The guest's name, between the lights and the water. */}
      <div style={{ textAlign: "center", padding: "0 24px" }}>
        <div className="go-track" style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: t.theme.textSoft }}>
          {L(lang, "إلى", "אל")}
        </div>
        <div style={{ marginTop: 8, fontWeight: 900, fontSize: "clamp(24px,6vw,34px)", color: t.theme.text, lineHeight: 1.3 }}>
          {guestName || L(lang, "ضيفنا العزيز", "אורח יקר")}
        </div>
      </div>

      {/* The fountain, lit. */}
      <div
        style={{
          transform: opening ? "scale(1.06)" : "none",
          transition: "transform 1.1s cubic-bezier(.2,.9,.3,1)",
        }}
      >
        <Fountain t={t} size={160} animate={!reduced} />
      </div>

      {sealed && (
        <div
          style={{
            textAlign: "center", color: t.theme.text, padding: "0 24px",
            fontSize: cueEscalated ? "clamp(18px,4.2vw,26px)" : "clamp(15px,3.4vw,20px)",
            fontWeight: cueEscalated ? 800 : 600,
            opacity: cueEscalated ? 1 : 0.9,
            transition: "font-size .4s ease, opacity .4s ease",
            animation: "go-cue 1.9s ease-in-out infinite",
          }}
        >
          {cueEscalated
            ? L(lang, "اضغط لتُضيء البستان وتفتح دعوتك", "לחצו כדי להאיר את הבוסתן ולפתוח את ההזמנה")
            : L(lang, "اضغط لفتح الدعوة", "לחצו לפתיחת ההזמנה")}
          <style>{"@keyframes go-cue{0%,100%{transform:translateY(0);opacity:.72}50%{transform:translateY(-4px);opacity:1}}"}</style>
        </div>
      )}

      {opening && (
        <button
          type="button"
          data-testid="intro-skip"
          onClick={(e) => { e.stopPropagation(); onSkip(); }}
          style={{
            position: "absolute", insetInlineEnd: 16, bottom: 16,
            background: "transparent", border: "none", cursor: "pointer",
            color: t.theme.textSoft, fontSize: 12, fontWeight: 700, fontFamily: "inherit",
          }}
        >
          {L(lang, "تخطّي", "דלג")}
        </button>
      )}
    </div>
  );
}
