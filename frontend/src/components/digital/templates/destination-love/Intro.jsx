// Destination Love opening ritual — the sealed-tap intro that REPLACES the
// classic 3D envelope. The page loads at rest as a boarding pass addressed to
// the guest; nothing animates until they tap. On tap the pass "stamps" (a plane
// crosses, an INVITED stamp thuds down) and hands off to the revealed
// invitation. Behaviour (no-auto-open, cue escalation, skip, reduced motion,
// failsafe) is owned by useIntroPhase in the View; this is the visual only.
import { PaperPlane } from "./parts.jsx";

export function Intro({ phase, cueEscalated, open, skip, guestName, lang, t, fontFamily }) {
  const sealed = phase === "sealed";
  const opening = phase === "opening";
  const L = (ar, he) => (lang === "he" ? he : ar);

  return (
    <div
      role={sealed ? "button" : undefined}
      tabIndex={sealed ? 0 : undefined}
      aria-label={sealed ? L("افتح الدعوة", "פתח את ההזמנה") : undefined}
      data-testid="intro-sealed"
      onClick={sealed ? open : undefined}
      onKeyDown={sealed ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open()) : undefined}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "inherit",
        cursor: sealed ? "pointer" : "default",
        background: `radial-gradient(130% 90% at 50% -10%, ${t.sceneHaze} 0%, ${t.theme.bg} 65%)`,
        opacity: opening ? 0 : 1,
        transition: "opacity 1s ease .6s",
        pointerEvents: sealed ? "auto" : "none",
      }}
    >
      {/* Boarding-pass card */}
      <div
        style={{
          position: "relative",
          width: "min(360px, 86vw)",
          background: t.panel,
          color: t.panelInk,
          borderRadius: 22,
          padding: "26px 22px 30px",
          boxShadow: "0 30px 70px -30px rgba(0,0,0,.7)",
          transform: opening ? "translateY(-16px) scale(.97)" : "none",
          transition: "transform 1s ease",
        }}
      >
        {/* Perforation notches */}
        <span style={notch(t, "start")} />
        <span style={notch(t, "end")} />

        <div className="dl-track" style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: t.panelInkSoft }}>
          {L("بطاقة صعود", "כרטיס עלייה למטוס")}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 18px" }}>
          <PaperPlane size={22} color={t.secondary} />
          <div style={{ fontFamily: "inherit", fontWeight: 800, fontSize: 15, color: t.panelInk }}>
            {L("رحلة الحب", "מסע האהבה")}
          </div>
        </div>

        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", color: t.panelInkSoft }}>
          {L("المسافر / المسافرة", "הנוסע/ת")}
        </div>
        <div style={{ fontWeight: 900, fontSize: "clamp(22px,6vw,30px)", lineHeight: 1.2, marginTop: 2, color: t.panelInk }}>
          {guestName || L("ضيفنا العزيز", "אורח/ת יקר/ה")}
        </div>

        {/* dashed divider */}
        <div style={{ borderTop: `1.5px dashed ${t.panelInkSoft}`, opacity: 0.5, margin: "18px 0 14px" }} />

        {/* Barcode strip */}
        <div aria-hidden="true" style={{ display: "flex", gap: 2, height: 34, alignItems: "stretch", marginBottom: 16, opacity: 0.85 }}>
          {Array.from({ length: 38 }).map((_, i) => (
            <span key={i} style={{ flex: i % 4 === 0 ? 2 : 1, background: i % 3 === 0 ? t.panelInk : "transparent" }} />
          ))}
        </div>

        {/* Tap cue */}
        <div
          className={"dl-cue" + (cueEscalated ? " dl-cue--hot" : "")}
          style={{ textAlign: "center", fontSize: cueEscalated ? 16 : 14, fontWeight: 800, color: t.stamp }}
        >
          {sealed ? `— ${L("اضغط لتفتح دعوتك", "הקש/י כדי לפתוח את ההזמנה")} —` : ""}
        </div>

        {/* INVITED stamp (thuds in during opening) */}
        {opening && (
          <div
            className="dl-stamp-in"
            style={{
              position: "absolute",
              insetInlineEnd: 18,
              bottom: 18,
              padding: "8px 14px",
              border: `3px solid ${t.stamp}`,
              borderRadius: 8,
              color: t.stamp,
              fontWeight: 900,
              fontSize: 15,
              letterSpacing: ".04em",
              transform: "rotate(-11deg)",
              opacity: 0.92,
            }}
          >
            {L("مدعوّ ✦", "מוזמן/ת ✦")}
          </div>
        )}

        {/* A plane crossing during the opening beat */}
        {opening && (
          <div style={{ position: "absolute", top: 40, insetInlineStart: -30, animation: "dl-fly 1.4s ease-in forwards", offsetPath: `path("M 0 40 C 120 -20, 260 90, 400 0")` }}>
            <PaperPlane size={26} color={t.secondary} />
          </div>
        )}
      </div>

      {/* Skip control during the opening animation */}
      {opening && (
        <button
          type="button"
          data-testid="intro-skip"
          onClick={skip}
          style={{ position: "fixed", bottom: 22, insetInlineEnd: 22, padding: "7px 14px", borderRadius: 999, border: `1px solid ${t.theme.chipBorder}`, background: t.theme.chipBg, color: t.theme.text, fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", pointerEvents: "auto" }}
        >
          {L("تخطّي", "דלג")}
        </button>
      )}
    </div>
  );
}

function notch(t, side) {
  return {
    position: "absolute",
    [side === "start" ? "insetInlineStart" : "insetInlineEnd"]: -11,
    top: "50%",
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: t.theme.bg,
    transform: "translateY(-50%)",
  };
}
