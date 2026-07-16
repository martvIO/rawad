import { useEffect,useState } from "react";
import { SectionHead } from "../inviteShared.jsx";

// ── Gallery + lightbox ──────────────────────────────────────────────────────────
function GallerySection({ items, theme, font, lang }) {
  const [open, setOpen] = useState(null);
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);
  return (
    <section className="dawa-inv-section" id="inv-gallery">
      <SectionHead
        eyebrow={lang === "he" ? "גלריה" : "معرض الصور"}
        title={lang === "he" ? "רגעים ששמרנו" : "لحظات نحتفظ بها"}
        sub={lang === "he" ? "לחצו על תמונה כדי לצפות בה בגודל מלא." : "اضغط على أي صورة لمشاهدتها بحجمها الكامل."}
        theme={theme}
        font={font}
      />
      <div className="dawa-inv-gallery dawa-inv-reveal">
        {items.map((m, i) => (
          <div key={m.storagePath || i} className="dawa-inv-gallery-item" onClick={() => setOpen(m)}>
            {m.kind === "video" ? (
              <video src={m.url} muted loop playsInline />
            ) : (
              <img src={m.url} alt={m.cap || ""} loading="lazy" />
            )}
            {m.cap && (
              <div className="dawa-inv-gallery-cap" style={{ fontFamily: font.family }}>
                {m.cap}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className={`dawa-inv-lightbox${open ? " is-open" : ""}`} onClick={() => setOpen(null)}>
        <button className="dawa-inv-lightbox-close" style={{ color: theme.accent, borderColor: theme.accentLine }} aria-label="close" onClick={() => setOpen(null)}>
          ✕
        </button>
        {open && (open.kind === "video"
          ? <video src={open.url} controls autoPlay style={{ maxWidth: "90%", maxHeight: "86vh", borderRadius: 12 }} />
          : <img src={open.url} alt={open.cap || ""} />)}
        {open && open.cap && (
          // Caption in the lightbox — the primary touch path, where the grid
          // hover-caption never fires. Symmetric inset keeps it RTL-safe.
          <div
            style={{
              position: "absolute", bottom: 24, left: 0, right: 0,
              textAlign: "center", padding: "0 32px",
              color: "#fbf6e8", fontFamily: font.family,
              fontSize: 13, textShadow: "0 2px 12px rgba(0,0,0,.6)",
            }}
          >
            {open.cap}
          </div>
        )}
      </div>
    </section>
  );
}


export { GallerySection };
