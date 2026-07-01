import { useEffect, useMemo, useState } from "react";

// Section navigator for the digital invitation. An always-open vertical stack of
// icon-only circular buttons pinned to the top inline-start (the right edge in
// RTL). صورك sits on top with a bolder accent ring; the enabled sections follow,
// each a transparent circle with a faint ring. The name of a circle is hidden by
// default and revealed — as a frosted pill to its inner (left in RTL) side — only
// when that circle is hovered / pressed / focused, or when its section is the one
// currently in view (scroll-spy). No background fill on the circles themselves.
//
// z-index stays below the envelope overlay (1000), so during the opening
// 3D-envelope animation the column is hidden behind it and never fights the
// intro; it becomes visible the moment the invitation is revealed. In the
// editor/admin preview (absolute) it sits inside the preview box.
const SOREK_ID = "__sorek";

export function InviteNavMenu({ items, theme, font, lang, fixed = true, sorek = null }) {
  const [active, setActive] = useState(items[0]?.id || "");
  const [hovered, setHovered] = useState(null);

  const ids = useMemo(() => items.map((it) => it.id), [items]);

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

  // Keep active/hovered valid when the enabled sections change (e.g. the groom
  // toggles a section off in the editor preview, shrinking `items`) — otherwise
  // they'd point at an id that no longer renders.
  useEffect(() => {
    setActive((a) => (a && !ids.includes(a) ? (ids[0] || "") : a));
    setHovered((h) => (h && h !== SOREK_ID && !ids.includes(h) ? null : h));
  }, [ids]);

  if (!items.length && !sorek) return null;

  const go = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const clearHover = (id) => setHovered((h) => (h === id ? null : h));

  // A circle + its reveal-on-demand name pill. `isSorek` circles always wear the
  // bolder accent ring; section circles wear a faint ring unless active/hovered.
  const renderCircle = ({ id, icon, label, onClick, isSorek = false }) => {
    const isActive = id === active;
    const isHover = id === hovered;
    const show = isActive || isHover;                       // reveal this name?
    const ring = isSorek || isActive || isHover ? theme.accent : theme.accentLine;
    return (
      <div key={id} style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          onPointerEnter={() => setHovered(id)}
          onPointerLeave={() => clearHover(id)}
          onFocus={() => setHovered(id)}
          onBlur={() => clearHover(id)}
          style={{
            appearance: "none",
            width: 44,
            height: 44,
            padding: 0,
            borderRadius: "50%",
            background: "transparent",
            border: `1px solid ${ring}`,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            lineHeight: 1,
            color: theme.accent,
            transform: isHover ? "scale(1.06)" : "none",
            transition: "border-color .2s, transform .2s",
          }}
        >
          <span aria-hidden="true">{icon}</span>
        </button>
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            insetInlineEnd: "calc(100% + 8px)",
            top: "50%",
            transform: "translateY(-50%)",
            whiteSpace: "nowrap",
            maxWidth: "min(72vw, 240px)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            // theme.overlay + theme.text is the palette's designed-for-legibility
            // pairing (used by the old menu card) — it keeps the pill readable on
            // light themes too, where accent-on-chipBg falls below WCAG contrast.
            background: theme.overlay,
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: `1px solid ${theme.chipBorder}`,
            borderRadius: 999,
            padding: "4px 10px",
            color: theme.text,
            fontSize: 12.5,
            fontWeight: 800,
            letterSpacing: 0.3,
            fontFamily: font.family,
            boxShadow: `0 8px 24px -12px ${theme.accentMuted}`,
            opacity: show ? 1 : 0,
            zIndex: 1,
            pointerEvents: "none",
            transition: "opacity .18s ease",
          }}
        >
          {label}
        </span>
      </div>
    );
  };

  return (
    <div
      style={{
        position: fixed ? "fixed" : "absolute",
        top: 14,
        insetInlineStart: 14,
        zIndex: 120,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 8,
        maxHeight: "calc(100vh - 28px)",
        overflowY: "auto",
        animation: "dawa-inv-rise .28s ease both",
      }}
    >
      {sorek && renderCircle({
        id: SOREK_ID,
        icon: sorek.icon,
        label: sorek.label,
        onClick: sorek.onClick,
        isSorek: true,
      })}

      {items.map((it) => renderCircle({
        id: it.id,
        icon: it.icon,
        label: it.label,
        onClick: () => go(it.id),
      }))}
    </div>
  );
}
