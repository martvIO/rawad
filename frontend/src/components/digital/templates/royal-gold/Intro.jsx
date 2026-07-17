// Royal Gold's sealed-tap intro: a cream envelope on the wine wall, closed with
// a gold wax seal. Tapping breaks the seal and swings the flap open. All
// behaviour (phases, cue escalation, skip, failsafe) is the shared
// useIntroPhase contract — this file only draws it.
import { WaxSeal, L } from "./parts.jsx";

export function Intro({ t, lang, guestName, phase, cueEscalated, onOpen, onSkip }) {
  const sealed = phase === "sealed";
  const opening = phase === "opening";
  return (
    <div
      className="rg-intro"
      data-testid="intro-sealed"
      role="button"
      tabIndex={0}
      aria-label={L(lang, "اضغط لفتح الدعوة", "לחצו לפתיחת ההזמנה")}
      onClick={sealed ? onOpen : undefined}
      onKeyDown={sealed ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } } : undefined}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        // The page's own ground, so the wall doesn't visibly shift shade as the
        // intro fades out into the invitation behind it.
        background: t.theme.bg,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: 32, cursor: sealed ? "pointer" : "default",
        opacity: opening ? 0 : 1,
        transition: "opacity .8s ease .7s",
        pointerEvents: opening ? "none" : "auto",
      }}
    >
      {/* A pool of light on the wall behind the envelope, so the wine reads as a
          room and not a flat fill. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `radial-gradient(120% 80% at 50% 42%, ${t.frame}22 0%, transparent 62%)`,
        }}
      />

      <div
        style={{
          position: "relative",
          width: "min(86vw, 330px)",
          aspectRatio: "1 / 0.68",
          perspective: 900,
          transform: opening ? "scale(1.1)" : "none",
          transition: "transform 1.1s cubic-bezier(.3,1.05,.4,1)",
        }}
      >
        {/* Envelope body */}
        <div
          style={{
            position: "absolute", inset: 0, background: t.band, borderRadius: 3,
            boxShadow: "0 28px 54px rgba(0,0,0,.5)", overflow: "hidden",
          }}
        >
          <div aria-hidden="true" style={{ position: "absolute", inset: 8, border: `1px solid ${t.frame}`, opacity: 0.45, borderRadius: 2 }} />
          {/* The lower creases — the two folds the flap closes over. */}
          <svg viewBox="0 0 300 204" preserveAspectRatio="none" aria-hidden="true"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            <path d="M0 204 L150 104 L300 204" fill="none" stroke={t.frame} strokeWidth="1" opacity="0.22" />
          </svg>

          <div style={{ position: "absolute", insetInline: 0, bottom: "9%", textAlign: "center", padding: "0 18px" }}>
            <div className="rg-track" style={{ fontSize: 9, color: t.bandInkSoft, fontWeight: 700 }}>
              {L(lang, "إلى", "אל")}
            </div>
            <div style={{ marginTop: 7, fontWeight: 800, fontSize: "clamp(17px,4.4vw,22px)", color: t.bandInk, lineHeight: 1.4 }}>
              {guestName || L(lang, "ضيفنا العزيز", "אורח יקר")}
            </div>
          </div>
        </div>

        {/* The flap — hinged at the top, swings away on tap. */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute", insetInline: 0, top: 0, height: "55%",
            background: t.bandSoft,
            clipPath: "polygon(0 0, 100% 0, 50% 100%)",
            transformOrigin: "top center",
            transform: opening ? "rotateX(-168deg)" : "none",
            transition: "transform 1s cubic-bezier(.5,0,.2,1)",
            backfaceVisibility: "hidden",
            boxShadow: opening ? "none" : "0 3px 10px rgba(0,0,0,.16)",
          }}
        />

        {/* The seal, pressed at the flap's vertex. It breaks first, then the
            flap moves — so the tap reads as cause, not coincidence. */}
        <div
          style={{
            position: "absolute", insetInline: 0, top: "55%",
            display: "flex", justifyContent: "center",
            transform: opening ? "translateY(-50%) scale(1.3)" : "translateY(-50%)",
            opacity: opening ? 0 : 1,
            transition: "transform .55s cubic-bezier(.3,1.4,.5,1), opacity .4s ease",
          }}
        >
          <WaxSeal t={t} size={74} />
        </div>
      </div>

      {sealed && (
        <div
          className="rg-track"
          style={{
            position: "absolute", insetInline: 0, bottom: "11%",
            textAlign: "center", color: t.frame, fontWeight: 700,
            fontSize: cueEscalated ? "clamp(13px,3vw,16px)" : "clamp(10px,2.4vw,12px)",
            opacity: cueEscalated ? 1 : 0.85,
            transition: "font-size .4s ease, opacity .4s ease",
            animation: "rg-cue 2.2s ease-in-out infinite",
          }}
        >
          {cueEscalated
            ? L(lang, "اضغط على الختم لفتح دعوتك", "לחצו על החותם לפתיחת ההזמנה")
            : L(lang, "اضغط لفتح الدعوة", "לחצו לפתיחת ההזמנה")}
          <style>{"@keyframes rg-cue{0%,100%{opacity:.55}50%{opacity:1}}"}</style>
        </div>
      )}

      {opening && (
        <button
          type="button"
          data-testid="intro-skip"
          onClick={(e) => { e.stopPropagation(); onSkip(); }}
          className="rg-track"
          style={{
            position: "absolute", insetInlineEnd: 16, bottom: 16,
            background: "transparent", border: "none", cursor: "pointer",
            color: t.frame, fontSize: 10, fontWeight: 700,
          }}
        >
          {L(lang, "تخطّي", "דלג")}
        </button>
      )}
    </div>
  );
}
