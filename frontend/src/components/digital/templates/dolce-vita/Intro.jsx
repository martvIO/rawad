// Dolce Vita's sealed-tap intro: an ivory letter closed with a wax seal. Tap the
// seal and it breaks, the letter opens, the invitation is revealed.
//
// Behaviour comes ENTIRELY from the shared contract (useIntroPhase in the view) —
// this file only supplies the visuals + the tap target, so the escalating cue,
// skip, return-visit fast path, reduced-motion floor and stuck-screen failsafe
// are identical to every other template and can be tuned in one place.
//
// The sealed layer is pure CSS/DOM: it paints without three.js, so the ritual can
// never wait on a WebGL chunk (the audit's "loading wall" risk).
import { BRAND_ICON_PATHS, BRAND_ICON_VIEWBOX } from "../../../../assets/brandSvg.js";

const L = (lang, ar, he) => (lang === "he" ? he : ar);

// BRAND_ICON_VIEWBOX is { w, h } — not a viewBox string (the 3D seal reads .w/.h
// off it to size a Path2D canvas). Build the attribute from it.
function BrandMark({ size = 26, color }) {
  const { w, h } = BRAND_ICON_VIEWBOX;
  return (
    <svg width={size} height={size * (h / w)} viewBox={`0 0 ${w} ${h}`} fill={color} aria-hidden="true">
      {BRAND_ICON_PATHS.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

export function Intro({ t, lang, guestName, phase, cueEscalated, onOpen, onSkip }) {
  const sealed = phase === "sealed";
  const opening = phase === "opening";

  return (
    <div
      className="dv-intro"
      data-testid="intro-sealed"
      role="button"
      tabIndex={0}
      aria-label={L(lang, "اضغط لفتح الدعوة", "לחצו לפתיחת ההזמנה")}
      onClick={sealed ? onOpen : undefined}
      onKeyDown={sealed ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } } : undefined}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        // A sky wash, NOT the flat page bg: on the light palettes the ivory letter
        // and the ivory ground are within a few RGB points of each other, so a flat
        // backdrop made the letter dissolve into it instead of reading as an object
        // you can pick up. The wash also carries the riviera identity into the very
        // first frame. Dark palettes get the same treatment for free.
        background: `radial-gradient(115% 75% at 50% 38%, ${t.skyTop} 0%, ${t.theme.bg} 72%)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, cursor: sealed ? "pointer" : "default",
        opacity: opening ? 0 : 1,
        transition: "opacity .9s ease .55s",
        pointerEvents: opening ? "none" : "auto",
      }}
    >
      <div
        style={{
          position: "relative", width: "min(340px, 86vw)",
          transform: opening ? "translateY(-8px) scale(1.04)" : "none",
          transition: "transform 1.1s cubic-bezier(.2,.9,.3,1)",
        }}
      >
        {/* The letter */}
        <div className="dv-letter" style={{ textAlign: "center", paddingBlock: 40 }}>
          <div className="dv-track" style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: t.paperInkSoft }}>
            {L(lang, "دعوة", "הזמנה")}
          </div>
          <div style={{ marginTop: 14, fontSize: 12, color: t.paperInkSoft }}>{L(lang, "إلى", "אל")}</div>
          <div style={{ marginTop: 6, fontWeight: 900, fontSize: "clamp(22px,5.6vw,30px)", color: t.paperInk, lineHeight: 1.3 }}>
            {guestName || L(lang, "ضيفنا العزيز", "אורח יקר")}
          </div>
          <div style={{ margin: "18px auto 0", width: 46, height: 1, background: t.rule, opacity: 0.7 }} />
        </div>

        {/* Wax seal, sitting on the letter's lower edge. It cracks open on tap. */}
        <div
          style={{
            position: "absolute", insetInline: 0, bottom: -26,
            display: "flex", justifyContent: "center",
            transform: opening ? "scale(1.25) rotate(-12deg)" : "none",
            opacity: opening ? 0 : 1,
            transition: "transform .7s cubic-bezier(.3,1.4,.5,1), opacity .5s ease .2s",
          }}
        >
          <span className="dv-wax">
            <BrandMark size={26} color={t.foilSoft} />
          </span>
        </div>
      </div>

      {/* Tap cue — full text, no tracking (Arabic would break), and it escalates
          after ~8s idle per the shared contract's P2 "older guest" safeguard. */}
      {sealed && (
        <div
          style={{
            position: "absolute", insetInline: 0, bottom: "16%",
            textAlign: "center", color: t.theme.text,
            fontSize: cueEscalated ? "clamp(18px,4.2vw,26px)" : "clamp(15px,3.4vw,20px)",
            fontWeight: cueEscalated ? 800 : 600,
            opacity: cueEscalated ? 1 : 0.9,
            transition: "font-size .4s ease, opacity .4s ease",
            animation: "dv-cue 1.9s ease-in-out infinite",
          }}
        >
          {cueEscalated
            ? L(lang, "اضغط على الختم لفتح دعوتك", "לחצו על החותם לפתיחת ההזמנה")
            : L(lang, "اضغط لفتح الدعوة", "לחצו לפתיחת ההזמנה")}
          <style>{"@keyframes dv-cue{0%,100%{transform:translateY(0);opacity:.72}50%{transform:translateY(-4px);opacity:1}}"}</style>
        </div>
      )}

      {/* Discreet skip during the opening animation (shared contract affordance). */}
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
