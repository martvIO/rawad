import { useState } from "react";

// 2D wax-seal envelope — the fallback intro for devices that don't run the 3D
// WebGL envelope (weak GPU / no WebGL / reduced-motion / immersive3d off). Tap
// cracks the seal and reveals the couple's names, then fades into the hero.
function EnvelopeIntro({ guestName, groomName = "", brideName = "", monogram = "", blessing = "", welcome = "", theme, font, lang }) {
  const [opened, setOpened] = useState(() => {
    try { return localStorage.getItem("dawa-invite-opened") === "1"; } catch { return false; }
  });
  const [phase, setPhase] = useState("sealed"); // sealed → open (names) → closing

  const onOpen = () => {
    if (phase !== "sealed") return;
    try { localStorage.setItem("dawa-invite-opened", "1"); } catch { /* ignore */ }
    setPhase("open");
    setTimeout(() => setPhase("closing"), 1500);
    setTimeout(() => setOpened(true), 2600);
  };

  if (opened) return null;
  const showNames = phase === "open" || phase === "closing";
  const gradStyle = theme
    ? {
        fontFamily: font.family,
        background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`,
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
      }
    : { fontFamily: font.family };

  return (
    <div className={`dawa-inv-env-overlay${phase === "closing" ? " is-opening" : ""}`} role="dialog" aria-label="invitation">
      {!showNames && (
        <>
          <div
            className="dawa-inv-env"
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}
          >
            <div className="dawa-inv-wax" aria-hidden="true">{monogram || "د"}</div>
          </div>
          <div className="dawa-inv-env-hint">— {lang === "he" ? "לחץ לפתיחת ההזמנה" : "اضغط لفتح الدعوة"} —</div>
          {blessing && (
            <div style={{ color: theme?.accent, fontFamily: font.family, fontSize: 13, marginBottom: 10, opacity: 0.85 }}>{blessing}</div>
          )}
          {guestName && (
            <div className="dawa-inv-env-name dawa-inv-grad" style={{ fontFamily: font.family }}>{guestName}</div>
          )}
        </>
      )}

      {showNames && (
        <div style={{ textAlign: "center", animation: "dawa-inv-rise .9s cubic-bezier(.2,.7,.2,1) both" }}>
          {blessing && (
            <div style={{ color: theme?.accent, fontFamily: font.family, fontSize: 15, marginBottom: 12, opacity: 0.9 }}>{blessing}</div>
          )}
          {groomName && <h1 className="dawa-inv-couple dawa-inv-grad" style={gradStyle}>{groomName}</h1>}
          {groomName && brideName && (
            <span className="dawa-inv-amp" style={{ color: theme?.accent, fontFamily: font.family }}>
              {lang === "he" ? "ו" : "و"}
            </span>
          )}
          {brideName && <h1 className="dawa-inv-couple dawa-inv-grad" style={gradStyle}>{brideName}</h1>}
          {welcome && (
            <div style={{ color: theme?.textSoft || theme?.text, fontFamily: font.family, fontSize: 14, marginTop: 14, maxWidth: 420, marginInline: "auto", lineHeight: 1.7, opacity: 0.85 }}>{welcome}</div>
          )}
        </div>
      )}
    </div>
  );
}

export { EnvelopeIntro };
