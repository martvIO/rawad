// Modal — one accessible shell over the GlobalStyle `.modal-backdrop` /
// `.modal-shell` classes. Adds the behaviors the hand-rolled modals each
// re-implemented (or skipped): backdrop click-to-close, Escape to close,
// focus-trap + return-focus, body scroll-lock, and dialog ARIA. Visuals come
// entirely from the existing classes, so it matches the current modals.
//
// `title`/`closeLabel` copy is caller-supplied (i18n). See GlobalStyle.jsx.

import { useEffect, useId, useRef } from "react";
import { C } from "../../styles/theme.js";
import { Icon } from "../icons/Icon.jsx";

const SIZE = { sm: 380, md: 460, lg: 640 };

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  size = "md",
  footer,
  children,
  shellStyle,
  closeLabel = "Close",
}) {
  const shellRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const prevActive = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    shellRef.current?.focus();

    function onKey(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key === "Tab" && shellRef.current) {
        const nodes = shellRef.current.querySelectorAll(FOCUSABLE);
        if (nodes.length === 0) {
          e.preventDefault();
          return;
        }
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      if (prevActive && typeof prevActive.focus === "function") prevActive.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="modal-shell"
        ref={shellRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        style={{ maxWidth: SIZE[size] || SIZE.md, ...shellStyle }}
      >
        {(title || onClose) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 16,
            }}
          >
            {title ? (
              <h3 id={titleId} style={{ fontSize: 18, fontWeight: 800, color: C.goldLight, margin: 0 }}>
                {title}
              </h3>
            ) : (
              <span />
            )}
            {onClose && (
              <button
                type="button"
                className="tap"
                onClick={() => onClose?.()}
                aria-label={closeLabel}
                style={{
                  background: "transparent",
                  border: "none",
                  color: C.goldDim,
                  cursor: "pointer",
                  display: "flex",
                  padding: 4,
                }}
              >
                <Icon name="close" size={20} />
              </button>
            )}
          </div>
        )}
        {children}
        {footer && (
          <div
            style={{
              marginTop: 20,
              display: "flex",
              gap: 10,
              justifyContent: "flex-end",
              flexWrap: "wrap",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
