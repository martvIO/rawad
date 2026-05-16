// Transient toast popup pinned to the top of the screen.
// `variant` picks the palette: "gold" (admin/groom) or "green" (driver).
export function Toast({ message, variant = "gold" }) {
  if (!message) return null;
  const palette = variant === "green"
    ? { background: "rgba(76,201,122,.10)",  border: "1px solid rgba(76,201,122,.45)", color: "#4cc97a",
        shadow:    "0 14px 40px rgba(76,201,122,.18)" }
    : { background: "linear-gradient(180deg,#1a1200,#120d00)", border: "1px solid rgba(201,168,76,.55)", color: "#f5e6b8",
        shadow:    "0 14px 40px rgba(201,168,76,.22)" };
  return (
    <div role="status" aria-live="polite" style={{
      position: "fixed", top: 18, left: "50%", transform: "translateX(-50%)",
      borderRadius: 14, padding: "12px 22px", fontWeight: 700, zIndex: 999,
      animation: "slideDown .3s ease both", whiteSpace: "nowrap",
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)",
      boxShadow: palette.shadow,
      background: palette.background,
      border: palette.border,
      color: palette.color,
      maxWidth: "92vw", overflow: "hidden", textOverflow: "ellipsis",
    }}>{message}</div>
  );
}
