import { useEffect,useRef,useState } from "react";
import { SectionHead } from "../inviteShared.jsx";
import { Icon } from "../InviteIcon.jsx";
import { useCountdown } from "../../../hooks/useCountdown.js";

// ── Countdown ────────────────────────────────────────────────────────────────────
// The seconds cell passes animateFlip={false}: a once-a-second blur-wiggle reads
// as fidgety ambient motion, not choreography. The digit still updates live (no
// shift — .dawa-inv-cd-num is tabular-nums); only genuine minute/hour/day
// rollovers animate, so the timer feels composed. The flip is cleared on
// animationend so the full .65s keyframe always plays (was cut at 500ms).
function CountdownCell({ value, label, theme, font, animateFlip = true }) {
  const [flip, setFlip] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      if (animateFlip) setFlip(true);
    }
  }, [value, animateFlip]);
  return (
    <div className="dawa-inv-cd-cell" style={{ "--line": theme.accentLine }}>
      <div
        className={`dawa-inv-cd-num dawa-inv-grad${flip ? " is-flip" : ""}`}
        onAnimationEnd={() => setFlip(false)}
        style={{
          fontFamily: font.family,
          background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        {String(value).padStart(2, "0")}
      </div>
      <div className="dawa-inv-cd-lbl" style={{ color: theme.textSoft, fontFamily: font.family }}>{label}</div>
    </div>
  );
}

function CountdownSection({ weddingDate, dateText = "", theme, font, lang }) {
  const { d, h, m, s, reached } = useCountdown(weddingDate);
  return (
    <section className="dawa-inv-section" id="inv-countdown">
      <SectionHead
        eyebrow={lang === "he" ? "ספירה לאחור" : "العدّ التنازلي"}
        title={lang === "he" ? "נשאר עד החתונה" : "باقي على يوم الفرح"}
        theme={theme}
        font={font}
      />
      {reached ? (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, color: theme.accent }}>
            <Icon name="celebrate" size={52} />
          </div>
          <div style={{ color: theme.text, fontSize: 28, fontWeight: 900, fontFamily: font.family }}>
            {lang === "he" ? "היום החתונה!" : "اليوم الفرح!"}
          </div>
        </div>
      ) : (
        <div className="dawa-inv-countdown dawa-inv-reveal" style={{ borderColor: theme.accentLine, direction: "ltr" }}>
          <CountdownCell value={d} label={lang === "he" ? "ימים" : "يوم"} theme={theme} font={font} />
          <CountdownCell value={h} label={lang === "he" ? "שעות" : "ساعة"} theme={theme} font={font} />
          <CountdownCell value={m} label={lang === "he" ? "דקות" : "دقيقة"} theme={theme} font={font} />
          <CountdownCell value={s} label={lang === "he" ? "שניות" : "ثانية"} theme={theme} font={font} animateFlip={false} />
        </div>
      )}
      {/* The wedding date — anchored right under the timer it counts down to. */}
      {dateText && (
        <div className="dawa-inv-cd-date dawa-inv-reveal" dir="auto" style={{ color: theme.accent, fontFamily: font.family }}>
          {dateText}
        </div>
      )}
    </section>
  );
}


export { CountdownSection };
