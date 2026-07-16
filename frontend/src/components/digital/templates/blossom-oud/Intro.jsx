// Blossom & Oud's sealed-tap intro: an arabesque-embossed envelope closed with a
// gold seal bearing the couple's monogram. Behaviour is entirely the shared
// useIntroPhase contract; this file is visuals + the tap target only.
// Pure CSS/SVG — the ritual never waits on a chunk.
import { Girih, ArabesqueBand, L } from "./parts.jsx";

export function Intro({ t, lang, guestName, monogram, phase, cueEscalated, onOpen, onSkip }) {
  const sealed = phase === "sealed";
  const opening = phase === "opening";

  return (
    <div
      className="bo-intro"
      data-testid="intro-sealed"
      role="button"
      tabIndex={0}
      aria-label={L(lang, "اضغط لفتح الدعوة", "לחצו לפתיחת ההזמנה")}
      onClick={sealed ? onOpen : undefined}
      onKeyDown={sealed ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } } : undefined}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: `radial-gradient(120% 80% at 50% 36%, ${t.paperSoft} 0%, ${t.theme.bg} 76%)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, cursor: sealed ? "pointer" : "default",
        opacity: opening ? 0 : 1,
        transition: "opacity .9s ease .55s",
        pointerEvents: opening ? "none" : "auto",
      }}
    >
      <div
        style={{
          position: "relative", width: "min(330px, 84vw)", aspectRatio: "1 / 0.8",
          transform: opening ? "scale(1.05)" : "none",
          transition: "transform 1.2s cubic-bezier(.2,.9,.3,1)",
        }}
      >
        <div
          style={{
            position: "absolute", inset: 0, background: t.paper,
            borderRadius: 4, border: `1px solid ${t.rule}`,
            boxShadow: "0 34px 74px -34px rgba(0,0,0,.5)",
            overflow: "hidden",
          }}
        >
          {/* Arabesque embossing across the head of the envelope. */}
          <div aria-hidden="true" style={{ position: "absolute", insetInline: 0, top: 14, display: "flex", justifyContent: "center", opacity: 0.5 }}>
            <ArabesqueBand t={t} w={220} />
          </div>

          {/* Flap. */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute", insetInline: 0, top: 0, height: "56%",
              background: t.paperSoft,
              clipPath: "polygon(0 0, 100% 0, 50% 100%)",
              transformOrigin: "top center",
              transform: opening ? "rotateX(-155deg)" : "none",
              transition: "transform .95s cubic-bezier(.4,0,.2,1)",
              borderBottom: `1px solid ${t.rule}`,
            }}
          />

          <div style={{ position: "absolute", insetInline: 0, bottom: "7%", textAlign: "center", padding: "0 18px" }}>
            <div className="bo-track" style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", color: t.paperInkSoft }}>
              {L(lang, "إلى", "אל")}
            </div>
            <div style={{ marginTop: 5, fontWeight: 900, fontSize: "clamp(18px,4.6vw,24px)", color: t.paperInk, lineHeight: 1.3 }}>
              {guestName || L(lang, "ضيفنا العزيز", "אורח יקר")}
            </div>
          </div>
        </div>

        {/* Gold seal on the flap's vertex. */}
        <div
          style={{
            position: "absolute", insetInline: 0, top: "56%",
            display: "flex", justifyContent: "center",
            transform: opening ? "translate(0,-60%) scale(1.2) rotate(-14deg)" : "translateY(-50%)",
            opacity: opening ? 0 : 1,
            transition: "transform .75s cubic-bezier(.3,1.4,.5,1), opacity .5s ease .25s",
          }}
        >
          <span className="bo-wax">{monogram || <Girih size={30} t={t} color="#4a3a14" />}</span>
        </div>
      </div>

      {sealed && (
        <div
          style={{
            position: "absolute", insetInline: 0, bottom: "13%",
            textAlign: "center", color: t.theme.text,
            fontSize: cueEscalated ? "clamp(18px,4.2vw,26px)" : "clamp(15px,3.4vw,20px)",
            fontWeight: cueEscalated ? 800 : 600,
            opacity: cueEscalated ? 1 : 0.9,
            transition: "font-size .4s ease, opacity .4s ease",
            animation: "bo-cue 1.9s ease-in-out infinite",
          }}
        >
          {cueEscalated
            ? L(lang, "اضغط على الختم لفتح دعوتك", "לחצו על החותם לפתיחת ההזמנה")
            : L(lang, "اضغط لفتح الدعوة", "לחצו לפתיחת ההזמנה")}
          <style>{"@keyframes bo-cue{0%,100%{transform:translateY(0);opacity:.72}50%{transform:translateY(-4px);opacity:1}}"}</style>
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
