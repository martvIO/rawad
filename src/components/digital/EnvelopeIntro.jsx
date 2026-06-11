// Envelope intro overlay — the sealed envelope a guest taps to open the
// invitation. Plays once per device (localStorage-gated).
import { useState } from "react";

export function EnvelopeIntro({ guestName, font, lang }) {
  const [opened, setOpened] = useState(() => {
    try { return localStorage.getItem("dawa-invite-opened") === "1"; } catch { return false; }
  });
  const [opening, setOpening] = useState(false);
  const onOpen = () => {
    if (opening) return;
    setOpening(true);
    try { localStorage.setItem("dawa-invite-opened", "1"); } catch { /* ignore */ }
    setTimeout(() => setOpened(true), 1100);
  };
  if (opened) return null;
  return (
    <div className={`dawa-inv-env-overlay${opening ? " is-opening" : ""}`} role="dialog" aria-label="invitation">
      <div className="dawa-inv-env" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}>
        <div className="dawa-inv-wax" aria-hidden="true">د</div>
      </div>
      <div className="dawa-inv-env-hint">— {lang === "he" ? "לחץ לפתיחת ההזמנה" : "اضغط لفتح الدعوة"} —</div>
      {guestName && <div className="dawa-inv-env-name dawa-inv-grad" style={{ fontFamily: font.family }}>{guestName}</div>}
    </div>
  );
}
