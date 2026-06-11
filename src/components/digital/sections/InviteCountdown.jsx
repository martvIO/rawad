// Live countdown to the wedding date — flip-animated cells, LTR digit order.
import { useEffect, useState } from "react";
import { SectionHead } from "../inviteShared.jsx";

function useCountdown(target) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, target - now);
  return {
    d: Math.floor(diff / 86400000),
    h: Math.floor((diff % 86400000) / 3600000),
    m: Math.floor((diff % 3600000) / 60000),
    s: Math.floor((diff % 60000) / 1000),
    reached: target - now <= 0,
  };
}

function CountdownCell({ value, label, theme, font }) {
  const [last, setLast] = useState(value);
  const [flip, setFlip] = useState(false);
  useEffect(() => {
    if (value !== last) {
      setFlip(true);
      const id = setTimeout(() => { setFlip(false); setLast(value); }, 500);
      return () => clearTimeout(id);
    }
  }, [value, last]);
  return (
    <div className="dawa-inv-cd-cell" style={{ "--line": theme.accentLine }}>
      <div
        className={`dawa-inv-cd-num dawa-inv-grad${flip ? " is-flip" : ""}`}
        style={{
          fontFamily: font.family,
          background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        {String(value).padStart(2, "0")}
      </div>
      <div className="dawa-inv-cd-lbl" style={{ color: theme.accent, fontFamily: font.family }}>{label}</div>
    </div>
  );
}

export function CountdownSection({ weddingDate, theme, font, lang }) {
  const { d, h, m, s, reached } = useCountdown(weddingDate);
  return (
    <section className="dawa-inv-section">
      <SectionHead
        eyebrow={lang === "he" ? "ספירה לאחור" : "العدّ التنازلي"}
        title={lang === "he" ? "נשאר עד החתונה" : "باقي على يوم الفرح"}
        theme={theme}
        font={font}
      />
      {reached ? (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🎊</div>
          <div style={{ color: theme.text, fontSize: 28, fontWeight: 900, fontFamily: font.family }}>
            {lang === "he" ? "היום החתונה!" : "اليوم الفرح!"}
          </div>
        </div>
      ) : (
        <div className="dawa-inv-countdown dawa-inv-reveal" style={{ borderColor: theme.accentLine, direction: "ltr" }}>
          <CountdownCell value={d} label={lang === "he" ? "ימים" : "يوم"} theme={theme} font={font} />
          <CountdownCell value={h} label={lang === "he" ? "שעות" : "ساعة"} theme={theme} font={font} />
          <CountdownCell value={m} label={lang === "he" ? "דקות" : "دقيقة"} theme={theme} font={font} />
          <CountdownCell value={s} label={lang === "he" ? "שניות" : "ثانية"} theme={theme} font={font} />
        </div>
      )}
    </section>
  );
}
