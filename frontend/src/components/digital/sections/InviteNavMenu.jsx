import { useEffect, useMemo, useRef, useState } from "react";

// Floating section navigator for the digital invitation. A collapsed pill that
// expands into a vertical list of the enabled sections; tapping one smooth-
// scrolls there, and the section currently in view is highlighted (scroll-spy).
//
// On the real guest page (fixed) it stays hidden until the guest scrolls past
// the hero — because page scroll is LOCKED during the 3D envelope intro, this
// guarantees the menu never appears over / interferes with the opening
// animation. In the editor/admin preview (absolute) it shows immediately.
//
// Sits at bottom inline-start (opposite the FloatingDock at bottom inline-end)
// so the two never collide; z-index stays below the envelope overlay (1000).
export function InviteNavMenu({ items, theme, font, lang, fixed = true }) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(!fixed);
  const [active, setActive] = useState(items[0]?.id || "");
  const navRef = useRef(null);

  const ids = useMemo(() => items.map((it) => it.id), [items]);

  // Reveal only after scrolling past the first viewport (the hero) on the real
  // page; show immediately in the (absolute) preview.
  useEffect(() => {
    if (!fixed) { setVisible(true); return undefined; }
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 0.8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [fixed]);

  // Scroll-spy: the section crossing the middle band of the viewport is active.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!els.length) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); });
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ids]);

  // Dismiss the open list on outside tap or Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (navRef.current && !navRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!items.length) return null;

  const go = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setOpen(false);
  };

  // theme.overlay is a semi-opaque version of the bg defined for every palette,
  // so the menu reads clearly on both light and dark themes.
  const surface = {
    background: theme.overlay,
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: `1px solid ${theme.chipBorder}`,
    fontFamily: font.family,
  };

  return (
    <div
      ref={navRef}
      style={{
        position: fixed ? "fixed" : "absolute",
        bottom: 22,
        insetInlineStart: 22,
        zIndex: 120,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 10,
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : "translateY(12px)",
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity .4s ease, transform .4s ease",
      }}
    >
      {open && (
        <div
          role="menu"
          style={{
            ...surface,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            padding: 8,
            borderRadius: 16,
            minWidth: 156,
            maxHeight: "60vh",
            overflowY: "auto",
            boxShadow: `0 20px 50px -18px ${theme.accentMuted}`,
            animation: "dawa-inv-rise .28s ease both",
          }}
        >
          {items.map((it) => {
            const on = it.id === active;
            return (
              <button
                key={it.id}
                role="menuitem"
                type="button"
                onClick={() => go(it.id)}
                style={{
                  appearance: "none",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "start",
                  padding: "9px 14px",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: on ? 800 : 600,
                  fontFamily: font.family,
                  color: theme.text,
                  background: on ? theme.accentMuted : "transparent",
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  transition: "background .2s, color .2s",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    flex: "0 0 auto",
                    background: on ? theme.accent : "transparent",
                    boxShadow: on ? `0 0 8px ${theme.sparkleGlow}` : "none",
                    border: on ? "none" : `1px solid ${theme.accentLine}`,
                  }}
                />
                {it.label}
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        aria-label={lang === "he" ? "ניווט בין הקטעים" : "التنقّل بين الأقسام"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          ...surface,
          width: 46,
          height: 46,
          borderRadius: 14,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          color: theme.accent,
          boxShadow: `0 12px 30px -14px ${theme.accentMuted}`,
        }}
      >
        {open ? "✕" : "☰"}
      </button>
    </div>
  );
}
