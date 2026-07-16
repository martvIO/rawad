// Dolce Vita's signature: the wedding date hidden under scratch-off foil, one
// tile per DAY / MONTH / YEAR. Scratching is a real canvas erase (destination-out
// compositing) driven by pointer events, so it works with a finger or a mouse.
//
// It is a DELIGHT, never a gate — the date underneath is real DOM text the whole
// time, so it is announced to screen readers, survives a canvas failure, and can
// always be revealed by tapping. Reduced-motion / no-canvas guests simply see the
// date. (The P2 "older WhatsApp guest" floor: nobody may be locked out of the
// single most important fact on the invitation by a game.)
import { useCallback, useEffect, useRef, useState } from "react";

const SCRATCH_RADIUS = 16;
// Fraction of the foil that must be gone before we auto-clear the rest.
const CLEAR_AT = 0.45;

function Tile({ value, caption, t, revealed, onRevealed, reducedMotion }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const cleared = useRef(false);
  const lastPt = useRef(null);

  // Paint the foil. Re-runs if the box resizes (orientation change).
  const paintFoil = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, t.foilSoft);
    g.addColorStop(0.5, t.foil);
    g.addColorStop(1, t.foilSoft);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // A few hairlines so the foil reads as brushed metal, not a flat block.
    ctx.strokeStyle = "rgba(255,255,255,.28)";
    ctx.lineWidth = 1;
    for (let i = -h; i < w; i += 7) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + h, h);
      ctx.stroke();
    }
  }, [t.foil, t.foilSoft]);

  useEffect(() => {
    if (revealed || reducedMotion) return undefined;
    paintFoil();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { if (!cleared.current) paintFoil(); }) : null;
    if (ro && wrapRef.current) ro.observe(wrapRef.current);
    return () => ro?.disconnect();
  }, [paintFoil, revealed, reducedMotion]);

  const clearAll = useCallback(() => {
    if (cleared.current) return;
    cleared.current = true;
    onRevealed();
  }, [onRevealed]);

  // How much foil is gone? Sampled coarsely — this runs on pointer-up only.
  const measure = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !ctx) return 0;
    try {
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let clearPx = 0;
      const step = 16 * 4; // sample every 16th pixel
      let n = 0;
      for (let i = 3; i < data.length; i += step) {
        if (data[i] === 0) clearPx++;
        n++;
      }
      return n ? clearPx / n : 0;
    } catch {
      return 0; // tainted/unavailable — treat as untouched
    }
  }, []);

  const scratchAt = (e) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !ctx) return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    ctx.globalCompositeOperation = "destination-out";
    // MUST set an opaque stroke: destination-out removes destination alpha in
    // proportion to SOURCE alpha, and paintFoil leaves strokeStyle at the
    // hairline's rgba(255,255,255,.28) — inheriting that erased only 28% per
    // pass, so the foil merely smudged and never reached alpha 0 (the reveal
    // threshold). Caught in a real browser; jsdom has no canvas to catch it.
    ctx.strokeStyle = "#000";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = SCRATCH_RADIUS * 2;
    ctx.beginPath();
    const p = lastPt.current;
    if (p) { ctx.moveTo(p.x, p.y); ctx.lineTo(x, y); } else { ctx.moveTo(x, y); ctx.lineTo(x + 0.1, y); }
    ctx.stroke();
    lastPt.current = { x, y };
  };

  if (revealed || reducedMotion) {
    return (
      <div className="dv-scratch" style={{ borderColor: t.rule }}>
        <div style={{ textAlign: "center" }}>
          <div className="dv-scratch-val" style={{ color: t.paperInk }}><bdi dir="ltr">{value}</bdi></div>
          <div className="dv-scratch-cap dv-track">{caption}</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="dv-scratch" style={{ borderColor: t.rule }}>
      {/* The real value sits underneath the whole time — the canvas only hides it
          visually, so assistive tech and a canvas failure both still get it. */}
      <div style={{ textAlign: "center" }}>
        <div className="dv-scratch-val" style={{ color: t.paperInk }}><bdi dir="ltr">{value}</bdi></div>
        <div className="dv-scratch-cap dv-track">{caption}</div>
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        onPointerDown={(e) => {
          drawing.current = true;
          lastPt.current = null;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          scratchAt(e);
        }}
        onPointerMove={(e) => { if (drawing.current) scratchAt(e); }}
        onPointerUp={() => {
          drawing.current = false;
          lastPt.current = null;
          if (measure() >= CLEAR_AT) clearAll();
        }}
        onPointerLeave={() => { drawing.current = false; lastPt.current = null; }}
      />
    </div>
  );
}

/**
 * @param {object} o
 * @param {number} o.weddingDate epoch ms
 * @param {string} o.lang
 */
export function ScratchDate({ t, lang, weddingDate, reducedMotion = false }) {
  const [revealed, setRevealed] = useState(false);
  const done = useRef(0);
  const he = lang === "he";

  if (!weddingDate) return null;
  const d = new Date(weddingDate);
  if (Number.isNaN(d.getTime())) return null;

  // Western digits + the venue's timezone, per the project-wide rule.
  const tz = "Asia/Jerusalem";
  const locale = he ? "he-IL" : "ar-EG";
  const fmt = (opts) => d.toLocaleDateString(locale, { ...opts, numberingSystem: "latn", timeZone: tz });

  const tiles = [
    { value: fmt({ day: "numeric" }), caption: he ? "יום" : "يوم" },
    { value: fmt({ month: "long" }), caption: he ? "חודש" : "شهر" },
    { value: fmt({ year: "numeric" }), caption: he ? "שנה" : "سنة" },
  ];

  const onOne = () => {
    done.current += 1;
    // Once most of it is uncovered, finish the job — nobody should have to
    // scrub all three tiles to learn the date.
    if (done.current >= 2) setRevealed(true);
  };

  return (
    <div>
      <div className="dv-scratch-row" data-testid="dv-scratch">
        {tiles.map((tile) => (
          <Tile
            key={tile.caption}
            value={tile.value}
            caption={tile.caption}
            t={t}
            revealed={revealed}
            reducedMotion={reducedMotion}
            onRevealed={onOne}
          />
        ))}
      </div>
      {!revealed && !reducedMotion && (
        <div className="dv-scratch-hint">{he ? "גרדו כדי לגלות את התאריך" : "احكّ لتكشف التاريخ"}</div>
      )}
    </div>
  );
}
