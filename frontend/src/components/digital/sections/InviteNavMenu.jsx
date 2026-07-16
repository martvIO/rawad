import { useEffect, useMemo, useRef, useState } from "react";

// Section navigator for the digital invitation. An always-open vertical stack of
// icon-only circular buttons pinned to the top inline-start (the right edge in
// RTL). صورك sits on top with a bolder accent ring and its name pill ALWAYS
// showing (guests shouldn't have to tap it to see the word). The enabled section
// circles follow, each a transparent circle with a faint ring; a section's name
// is hidden by default and revealed — as a frosted pill to its inner (left in
// RTL) side — only when that circle is hovered / pressed / focused, or when its
// section is the one currently in view (scroll-spy). No background fill on the
// circles themselves.
//
// z-index stays below the envelope overlay (1000), so during the opening
// 3D-envelope animation the column is hidden behind it and never fights the
// intro; it becomes visible the moment the invitation is revealed. In the
// editor/admin preview (absolute) it sits inside the preview box.
const SOREK_ID = "__sorek";
const RSVP_ID = "rsvp";        // navigates on a single tap even on touch
const ARM_TIMEOUT_MS = 3000;   // touch: auto-hide an armed label after ~3s

// Coarse / no-hover pointer (touch). Computed once; SSR + matchMedia guarded.
// (hover: none) is the primary signal; (pointer: coarse) is the fallback so
// hybrid/stylus devices that report hover still get desktop behaviour. Matches
// the coarse-pointer idiom in hooks/useDeviceCapability.js.
function detectTouch() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(hover: none)").matches
    || window.matchMedia("(pointer: coarse)").matches;
}

export function InviteNavMenu({ items, theme, font, lang, fixed = true, sorek = null }) {
  const [active, setActive] = useState(items[0]?.id || "");
  const [hovered, setHovered] = useState(null);       // doubles as "armed" on touch
  const isTouch = useMemo(detectTouch, []);           // stable for page life
  const navRef = useRef(null);                         // container, for outside-tap dismissal
  const armTimerRef = useRef(null);                    // touch auto-hide timer
  const lastPointerTypeRef = useRef(null);             // "touch" | "mouse" | "pen" | "" (AT/keyboard)

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

  const clearArmTimer = () => {
    if (armTimerRef.current) { clearTimeout(armTimerRef.current); armTimerRef.current = null; }
  };

  // Touch: reveal this circle's label ("arm" it) and start the auto-hide timer.
  const arm = (id) => {
    setHovered(id);
    clearArmTimer();
    armTimerRef.current = setTimeout(() => {
      setHovered((h) => (h === id ? null : h));
      armTimerRef.current = null;
    }, ARM_TIMEOUT_MS);
  };

  // Touch only: while a circle is armed, dismiss its label on page scroll or on a
  // tap anywhere outside the nav. Listeners attach only while something is armed.
  // This only clears the armed/`hovered` reveal — the scroll-spy `active` pill is
  // separate state and stays as the resting reveal for the in-view section.
  useEffect(() => {
    if (!isTouch || !hovered) return undefined;
    const dismiss = () => { clearArmTimer(); setHovered(null); };
    const onOutside = (e) => {
      if (navRef.current && navRef.current.contains(e.target)) return;
      dismiss();
    };
    window.addEventListener("scroll", dismiss, { passive: true });
    document.addEventListener("pointerdown", onOutside, true);
    return () => {
      window.removeEventListener("scroll", dismiss);
      document.removeEventListener("pointerdown", onOutside, true);
    };
  }, [isTouch, hovered]);

  useEffect(() => clearArmTimer, []); // clear any pending arm timer on unmount

  if (!items.length && !sorek) return null;

  const go = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const clearHover = (id) => setHovered((h) => (h === id ? null : h));

  // Circles that navigate on a single tap even on touch (no two-tap gate).
  const isExempt = (id, isSorek) => isSorek || id === RSVP_ID;

  // A circle + its reveal-on-demand name pill. `isSorek` circles always wear the
  // bolder accent ring; section circles wear a faint ring unless active/hovered.
  const renderCircle = ({ id, icon, label, onClick, isSorek = false }) => {
    const isActive = id === active;
    const isHover = id === hovered;                         // hover OR armed
    // صورك's name stays visible at all times — the guest shouldn't have to
    // hover/tap to see it. Every other section circle keeps the reveal-on-
    // demand behaviour (shown only while active or hovered).
    const show = isSorek || isActive || isHover;            // reveal this name?
    const ring = isSorek || isActive || isHover ? theme.accent : theme.accentLine;
    const exempt = isExempt(id, isSorek);

    // Record how the click was initiated so the two-tap gate keys off real touch
    // input only. VoiceOver/TalkBack activation and keyboard Enter/Space fire a
    // plain click with no preceding pointer (pointerType ""), so they navigate
    // immediately and never hit the gate.
    const handlePointerDown = (e) => { lastPointerTypeRef.current = e.pointerType; };
    const handleClick = () => {
      const fromTouch = lastPointerTypeRef.current === "touch";
      lastPointerTypeRef.current = null;                   // consume
      if (!isTouch || !fromTouch || exempt) {              // desktop / AT / keyboard / exempt
        clearArmTimer();
        onClick();
        return;
      }
      if (id === hovered) {                                // second tap on armed circle → navigate
        clearArmTimer();
        setHovered(null);
        onClick();
      } else {                                             // first tap / move arm → reveal only
        arm(id);
      }
    };

    return (
      <div key={id} style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <button
          type="button"
          onPointerDown={handlePointerDown}
          onClick={handleClick}
          aria-label={label}
          // Desktop only: hover/focus reveal. On touch the reveal is tap-driven
          // (the gate), and pointerenter/leave would fire around every tap and
          // clear `hovered` before the click can read it — breaking the gate.
          {...(isTouch ? {} : {
            onPointerEnter: () => setHovered(id),
            onPointerLeave: () => clearHover(id),
            onFocus: () => setHovered(id),
            onBlur: () => clearHover(id),
          })}
          style={{
            appearance: "none",
            width: 40,
            height: 40,
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
            // Sit on the inner side of the circle (toward the page centre): in RTL
            // the column is pinned inline-start (right edge), so the label extends
            // inline-end-ward. insetInlineStart:100%+gap pushes the pill just past
            // the circle on that inner side. (insetInlineEnd here would throw it to
            // the outer edge, off-screen — which is what made the reveal look dead.)
            insetInlineStart: "calc(100% + 8px)",
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
      ref={navRef}
      style={{
        position: fixed ? "fixed" : "absolute",
        top: 14,
        insetInlineStart: 14,
        zIndex: 120,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 6,
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
