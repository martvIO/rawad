// Full-screen proof-image preview. Renders nothing when `src` is empty.
export function PhotoViewer({ src, onClose, t }) {
  if (!src) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.92)",
      zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16, animation: "fadeIn .25s ease", cursor: "zoom-out",
    }}>
      <button onClick={onClose} style={{
        position: "absolute", top: 16, insetInlineEnd: 16,
        background: "rgba(0,0,0,.6)", border: "1px solid rgba(255,255,255,.2)",
        color: "#fff", padding: "8px 14px", borderRadius: 10,
        fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
      }}>✕ {t("photo_close")}</button>
      <img src={src} alt="proof full"
           onClick={e => e.stopPropagation()}
           style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8, boxShadow: "0 8px 40px rgba(0,0,0,.7)" }}/>
    </div>
  );
}
