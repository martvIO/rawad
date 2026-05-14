// Transient toast popup pinned to the top of the screen.
// `variant` picks the palette: "gold" (admin/groom) or "green" (driver).
export function Toast({ message, variant = "gold" }) {
  if (!message) return null;
  const palette = variant === "green"
    ? { background: "rgba(76,201,122,.15)", border: "1px solid rgba(76,201,122,.4)", color: "#4cc97a" }
    : { background: "#1a1200", border: "1px solid #c9a84c88", color: "#f5e6b8" };
  return (
    <div style={{
      position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
      borderRadius: 14, padding: "12px 24px", fontWeight: 700, zIndex: 999,
      animation: "fadeUp .3s ease", whiteSpace: "nowrap", ...palette,
    }}>{message}</div>
  );
}
