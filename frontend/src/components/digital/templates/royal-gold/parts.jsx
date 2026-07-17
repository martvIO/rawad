// Royal Gold ornaments — the torn band edge, the hung gold frame, the wax seal,
// the rose. Everything here is code-drawn and deterministic (no Math.random):
// the frames must not re-tilt on every render.

const L = (lang, ar, he) => (lang === "he" ? he : ar);

/** A torn/deckled edge. Fixed hand-authored path, stretched to width.
    Unflipped the fill sits at the BOTTOM (use it where the wall meets the top of
    a band); flipped it sits at the top (the band's bottom edge). */
export function TornEdge({ color, flip = false, height = 14 }) {
  const d =
    "M0,10 C12,3 22,14 34,7 C46,1 54,12 66,6 C78,1 88,13 100,5 C112,0 121,11 133,6 " +
    "C145,1 154,12 166,7 C178,3 188,13 200,8 C212,3 221,12 233,7 C245,2 254,13 266,7 " +
    "C278,2 288,12 300,6 L300,16 L0,16 Z";
  return (
    <svg width="100%" height={height} viewBox="0 0 300 16" preserveAspectRatio="none" aria-hidden="true"
      style={{ display: "block", transform: flip ? "scaleY(-1)" : undefined }}>
      <path d={d} fill={color} />
    </svg>
  );
}

/** The gold wax seal that closes the envelope — a rose pressed into gold.
    Layered solid fills, no gradient <defs>: an id-bearing gradient would collide
    across the two places this renders (intro + RSVP success). */
export function WaxSeal({ t, size = 74 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" aria-hidden="true"
      style={{ filter: "drop-shadow(0 7px 14px rgba(0,0,0,.45))" }}>
      {/* irregular wax rim */}
      <path
        d="M40 4 C50 4, 58 9, 65 15 C72 21, 76 30, 76 40 C76 50, 71 59, 64 66
           C57 73, 50 76, 40 76 C30 76, 22 72, 15 65 C8 58, 4 50, 4 40
           C4 30, 9 21, 16 15 C23 9, 30 4, 40 4 Z"
        fill={t.frame}
      />
      <circle cx="40" cy="40" r="31" fill={t.frameSoft} opacity="0.55" />
      <circle cx="40" cy="40" r="31" fill="none" stroke={t.wine} strokeWidth="0.8" opacity="0.35" />
      {/* the pressed rose */}
      <circle cx="40" cy="40" r="17" fill={t.wine} opacity="0.16" />
      <circle cx="40" cy="40" r="11" fill={t.wine} opacity="0.2" />
      <path d="M40 29 C50 33, 50 46, 40 51 C30 46, 30 33, 40 29 Z" fill={t.wine} opacity="0.3" />
      <circle cx="40" cy="40" r="4.5" fill={t.wine} opacity="0.4" />
      {/* the highlight that makes it read as wax, not a coin */}
      <ellipse cx="30" cy="27" rx="9" ry="6" fill="#fff" opacity="0.16" transform="rotate(-28 30 27)" />
    </svg>
  );
}

/** A photograph hung in a gold frame. `tilt` is passed in by the caller from the
    photo's index, never randomised. */
export function HungFrame({ t, src, alt, kind, tilt = -3, w = 132 }) {
  return (
    <figure
      style={{
        margin: 0, width: w, transform: "rotate(" + tilt + "deg)",
        filter: "drop-shadow(0 14px 22px rgba(0,0,0,.45))",
      }}
    >
      {/* the nail + wire it hangs from */}
      <div aria-hidden="true" style={{ display: "flex", justifyContent: "center" }}>
        <svg width="34" height="16" viewBox="0 0 34 16" fill="none">
          <path d="M2 14 L17 2 L32 14" stroke={t.frame} strokeWidth="0.9" opacity="0.75" />
          <circle cx="17" cy="2" r="1.8" fill={t.frame} />
        </svg>
      </div>
      <div
        style={{
          border: "5px solid " + t.frame,
          borderRadius: 2,
          background: t.band,
          padding: 4,
          boxShadow: "inset 0 0 0 1px " + t.frameSoft,
        }}
      >
        {kind === "video" ? (
          <video src={src} muted loop playsInline
            style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", display: "block" }} />
        ) : (
          <img src={src} alt={alt || ""} loading="lazy" decoding="async"
            style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", display: "block" }} />
        )}
      </div>
    </figure>
  );
}

/** A rose — the schedule's crown. Cream on the wine wall, wine on the cream band. */
export function Rose({ t, size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="16" fill={t.rose} opacity="0.35" />
      <circle cx="20" cy="20" r="11" fill={t.rose} opacity="0.55" />
      <circle cx="20" cy="20" r="6.5" fill={t.rose} opacity="0.8" />
      <path d="M20 13 C26 15, 26 22, 20 25 C14 22, 14 15, 20 13 Z" fill={t.frame} opacity="0.5" />
    </svg>
  );
}

/** A small gold diamond — the schedule's spine marker. */
export function Diamond({ t, size = 8 }) {
  return (
    <span aria-hidden="true"
      style={{ width: size, height: size, transform: "rotate(45deg)", background: t.frame, display: "block", flex: "none" }} />
  );
}

/** Ink for a block, given whether it sits on a cream band or the wine wall.
    On the band the theme's gold accent would wash out against cream, so the
    band borrows the deep wine as its accent instead. */
export const ink = (t, onBand) =>
  onBand
    ? { text: t.bandInk, soft: t.bandInkSoft, accent: t.wine, line: t.rule }
    : { text: t.theme.text, soft: t.theme.textSoft, accent: t.theme.accent, line: t.theme.accentLine };

/** A cream band torn out of the wine wall. The negative margins close the
    subpixel seam between the SVG edge and the band's own fill. */
export function Band({ t, id, children }) {
  return (
    <div className="rg-scroll" style={{ position: "relative" }}>
      <div style={{ marginBottom: -1 }}><TornEdge color={t.band} /></div>
      <section className="rg-band" id={id} style={{ padding: "44px 22px 48px" }}>
        {children}
      </section>
      <div style={{ marginTop: -1 }}><TornEdge color={t.band} flip /></div>
    </div>
  );
}

/** A block that sits directly on the wine wall. */
export function Wall({ id, children }) {
  return (
    <section className="rg-scroll" id={id} style={{ padding: "56px 22px" }}>
      {children}
    </section>
  );
}

/** Band or Wall, chosen by the caller — lets the view alternate by RENDERED
    index, so a section the groom switched off never breaks the stripe. */
export function Block({ t, id, onBand, children }) {
  return onBand ? <Band t={t} id={id}>{children}</Band> : <Wall id={id}>{children}</Wall>;
}

export function SectionTitle({ title, t, onBand }) {
  const c = ink(t, onBand);
  return (
    <div style={{ textAlign: "center", marginBottom: 22 }}>
      <h2 style={{
        fontFamily: "inherit", fontWeight: 700, fontSize: "clamp(23px,5.8vw,32px)", lineHeight: 1.4,
        margin: 0, paddingBlock: 4, color: c.text,
      }}>
        {title}
      </h2>
      <div aria-hidden="true" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 }}>
        <span style={{ width: 30, height: 1, background: t.rule }} />
        <Diamond t={t} size={6} />
        <span style={{ width: 30, height: 1, background: t.rule }} />
      </div>
    </div>
  );
}

export function RgButton({ children, onClick, disabled, t, onBand, full, testid }) {
  // On the wine wall the button is gold; on a cream band gold-on-cream would
  // vanish, so it inverts to the wine.
  const bg = onBand ? t.wine : t.frame;
  const fg = onBand ? t.band : (t.bandInk || "#2e1219");
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: full ? "100%" : undefined,
        padding: "13px 30px", borderRadius: 999, border: "none",
        background: bg, color: fg,
        fontWeight: 800, fontSize: 13, fontFamily: "inherit",
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

export { L };
