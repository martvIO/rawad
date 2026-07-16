// Lumen ornaments — there is exactly one: the seal. Everything else is type.

const L = (lang, ar, he) => (lang === "he" ? he : ar);

/** A pressed rosette seal — the design's single ornament. */
export function Seal({ t, size = 66 }) {
  const petals = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <span
      style={{
        width: size, height: size, borderRadius: "50%",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: `radial-gradient(circle at 34% 30%, color-mix(in srgb, ${t.seal} 82%, white), ${t.seal} 62%, color-mix(in srgb, ${t.seal} 66%, black) 100%)`,
        boxShadow: "0 7px 18px -7px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.3)",
      }}
    >
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 40 40" aria-hidden="true">
        {petals.map((deg) => (
          <ellipse key={deg} cx="20" cy="12" rx="2.6" ry="6.4" fill={t.sealInk} opacity="0.42"
            transform={`rotate(${deg} 20 20)`} />
        ))}
        <circle cx="20" cy="20" r="3.2" fill={t.sealInk} opacity="0.62" />
      </svg>
    </span>
  );
}

/** A section head: a wide serif capital line over a hairline. */
export function Head({ title, t, id }) {
  return (
    <div id={id} style={{ textAlign: "center", marginBottom: 30 }}>
      <h2 className="lm-cap" style={{ fontSize: "clamp(15px,3.6vw,19px)", color: t.theme.text, margin: 0, lineHeight: 1.7 }}>
        {title}
      </h2>
      <hr className="lm-rule" style={{ width: 46, margin: "14px auto 0" }} />
    </div>
  );
}

export function LmButton({ children, onClick, disabled, t, full, testid }) {
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      disabled={disabled}
      className="lm-cap"
      style={{
        width: full ? "100%" : undefined,
        padding: "14px 22px", borderRadius: 2, border: `1px solid ${t.theme.accent}`,
        background: "transparent", color: t.theme.accent,
        fontSize: 11, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

export { L };
