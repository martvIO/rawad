// Admin-side modal that shows DigitalInvitationView with a groom's real
// design data. Used in AdminDesigns to preview a pending design before
// approving / rejecting.
import { useEffect } from "react";
import { TemplateRenderer } from "./templates/TemplateRenderer.jsx";

export function DigitalInvitationPreviewModal({ open, design, demoGuestName, lang, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      data-testid="design-preview-modal"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.85)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 480,
          maxHeight: "94vh",
          overflowY: "auto",
          borderRadius: 18,
          background: "#0c0c11",
          border: "1px solid rgba(201,168,76,.35)",
          boxShadow: "0 30px 90px rgba(0,0,0,.7)",
        }}
      >
        <button
          onClick={onClose}
          aria-label="close"
          data-testid="design-preview-close"
          style={{
            position: "fixed",
            top: 20,
            insetInlineEnd: 20,
            zIndex: 2100,
            width: 40,
            height: 40,
            borderRadius: 20,
            background: "rgba(0,0,0,.75)",
            border: "1px solid rgba(255,255,255,.2)",
            color: "#fff",
            fontSize: 18,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          ✕
        </button>
        <TemplateRenderer
          design={design}
          guestName={demoGuestName}
          lang={lang}
          mode="preview"
        />
      </div>
    </div>
  );
}
