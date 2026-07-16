import { useRef, useState } from "react";
import { SectionHead } from "../inviteShared.jsx";
import { haptic } from "../../../utils/haptics.js";

// Small gift-box ornament drawn in the theme accent — a piece of the
// invitation's own SVG language, replacing the previous bare IBAN line.
function GiftOrnament({ color }) {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.2" y="8.4" width="17.6" height="3.4" rx="1" />
      <path d="M4.6 11.8h14.8v8.4H4.6z" />
      <path d="M12 8.4V20.2" />
      <path d="M12 8.4C10.6 8.4 8.2 8 8.2 6.1c0-1.3 1.1-1.9 1.9-1.9 1.6 0 1.9 2.6 1.9 4.2ZM12 8.4c1.4 0 3.8-.4 3.8-2.3 0-1.3-1.1-1.9-1.9-1.9-1.6 0-1.9 2.6-1.9 4.2Z" />
    </svg>
  );
}

// Copy / done glyphs — inline SVG (currentColor), not emoji, to match the
// bespoke-icon direction and render identically across platforms.
function CopyIcon({ done }) {
  return done ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </svg>
  );
}

// ── Gift ──────────────────────────────────────────────────────────────────────
function GiftSection({ giftNote, giftIban, theme, font, lang }) {
  const ibanRef = useRef(null);
  const [copied, setCopied] = useState(false);

  // Show the IBAN grouped in 4s for readability; copy the spaces-stripped form
  // (what banking apps expect). The stored value itself is never mutated.
  const ibanRaw = (giftIban || "").replace(/\s+/g, "");
  const ibanGrouped = ibanRaw.replace(/(.{4})/g, "$1 ").trim();

  function selectIban() {
    const el = ibanRef.current;
    if (!el || typeof window === "undefined" || !window.getSelection) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  async function copyIban() {
    // Guarded: navigator.clipboard is secure-context-only and absent in some
    // in-app WebViews. On failure, fall back to selecting the (still fully
    // selectable) IBAN so the guest can copy manually — never a fake success.
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(ibanRaw);
        setCopied(true);
        haptic(8); // shared helper: feature-detected + respects reduced-motion
        setTimeout(() => setCopied(false), 2000);
        return;
      } catch { /* fall through to manual select */ }
    }
    selectIban();
  }

  const copyLabel = copied
    ? (lang === "he" ? "הועתק" : "تم النسخ")
    : (lang === "he" ? "העתק" : "نسخ");

  return (
    <section className="dawa-inv-section" id="inv-gift">
      <SectionHead
        eyebrow={lang === "he" ? "מתנה" : "هدية"}
        title={lang === "he" ? "נוכחותכם היא המתנה" : "حضوركم أجمل هدية"}
        theme={theme}
        font={font}
      />
      <div className="dawa-inv-rsvp" style={{ textAlign: "center" }}>
        {giftNote && (
          <p style={{ color: theme.textSoft, fontSize: 15, lineHeight: 1.9, fontFamily: font.family, marginBottom: giftIban ? 22 : 0 }}>
            {giftNote}
          </p>
        )}
        {giftIban && (
          <div
            style={{
              maxWidth: 420,
              margin: "0 auto",
              padding: "24px 22px",
              background: theme.cardBg,
              border: `1px solid ${theme.cardBorder}`,
              borderRadius: 16,
              boxShadow: `0 14px 38px -20px ${theme.accentMuted}, inset 0 1px 0 rgba(255,255,255,.05)`,
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
              <GiftOrnament color={theme.accent} />
            </div>
            <span style={{ color: theme.accent, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", display: "block", marginBottom: 10, fontFamily: font.family }}>
              IBAN
            </span>
            <div
              ref={ibanRef}
              dir="ltr"
              style={{
                color: theme.text,
                fontSize: 17,
                fontFamily: font.family,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: ".5px",
                lineHeight: 1.6,
                wordBreak: "break-word",
                marginBottom: 18,
              }}
            >
              {ibanGrouped}
            </div>
            <button
              type="button"
              onClick={copyIban}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 22px",
                borderRadius: 999,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 700,
                fontFamily: font.family,
                border: `1px solid ${theme.accent}`,
                background: copied ? theme.accent : "transparent",
                color: copied ? theme.bg : theme.accent,
                transition: "background .3s, color .3s, transform .2s cubic-bezier(.2,.95,.25,1.1)",
              }}
            >
              <CopyIcon done={copied} />
              {copyLabel}
            </button>
            {/* Screen-reader confirmation without stealing focus. */}
            <span
              role="status"
              aria-live="polite"
              style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}
            >
              {copied ? (lang === "he" ? "הועתק" : "تم النسخ") : ""}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}


export { GiftSection };
