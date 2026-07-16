// Lumen's sealed-tap intro: paper, a name, a seal. Nothing else — the restraint
// IS the design. Behaviour is entirely the shared useIntroPhase contract.
import { Seal, L } from "./parts.jsx";

export function Intro({ t, lang, guestName, phase, cueEscalated, onOpen, onSkip }) {
  const sealed = phase === "sealed";
  const opening = phase === "opening";
  return (
    <div
      className="lm-intro"
      data-testid="intro-sealed"
      role="button"
      tabIndex={0}
      aria-label={L(lang, "اضغط لفتح الدعوة", "לחצו לפתיחת ההזמנה")}
      onClick={sealed ? onOpen : undefined}
      onKeyDown={sealed ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } } : undefined}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: t.paper,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 30, padding: 32, cursor: sealed ? "pointer" : "default",
        opacity: opening ? 0 : 1,
        transition: "opacity 1s ease .45s",
        pointerEvents: opening ? "none" : "auto",
      }}
    >
      <div
        style={{
          transform: opening ? "scale(1.16)" : "none",
          opacity: opening ? 0 : 1,
          transition: "transform .9s cubic-bezier(.3,1.2,.5,1), opacity .6s ease .2s",
        }}
      >
        <Seal t={t} size={70} />
      </div>

      <div style={{ textAlign: "center" }}>
        <div className="lm-cap" style={{ fontSize: 10, color: t.paperInkSoft }}>
          {L(lang, "إلى", "אל")}
        </div>
        <div style={{ marginTop: 12, fontWeight: 700, fontSize: "clamp(22px,5.4vw,30px)", color: t.paperInk, lineHeight: 1.4 }}>
          {guestName || L(lang, "ضيفنا العزيز", "אורח יקר")}
        </div>
        <hr className="lm-rule" style={{ width: 40, margin: "22px auto 0", background: t.paperInkSoft, opacity: 0.3 }} />
      </div>

      {sealed && (
        <div
          className="lm-cap"
          style={{
            position: "absolute", insetInline: 0, bottom: "12%",
            textAlign: "center", color: t.paperInkSoft,
            fontSize: cueEscalated ? "clamp(13px,3vw,16px)" : "clamp(10px,2.4vw,12px)",
            opacity: cueEscalated ? 1 : 0.8,
            transition: "font-size .4s ease, opacity .4s ease",
            animation: "lm-cue 2.2s ease-in-out infinite",
          }}
        >
          {cueEscalated
            ? L(lang, "اضغط على الختم لفتح دعوتك", "לחצו על החותם לפתיחת ההזמנה")
            : L(lang, "اضغط لفتح الدعوة", "לחצו לפתיחת ההזמנה")}
          <style>{"@keyframes lm-cue{0%,100%{opacity:.55}50%{opacity:1}}"}</style>
        </div>
      )}

      {opening && (
        <button
          type="button"
          data-testid="intro-skip"
          onClick={(e) => { e.stopPropagation(); onSkip(); }}
          className="lm-cap"
          style={{
            position: "absolute", insetInlineEnd: 16, bottom: 16,
            background: "transparent", border: "none", cursor: "pointer",
            color: t.paperInkSoft, fontSize: 10,
          }}
        >
          {L(lang, "تخطّي", "דלג")}
        </button>
      )}
    </div>
  );
}
