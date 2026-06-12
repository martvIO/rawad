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
    <section className="dawa-inv-section">
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
      </div>
    </section>
  );
}


export { GallerySection };
