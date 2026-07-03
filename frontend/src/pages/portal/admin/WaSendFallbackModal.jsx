// Manual-send fallback modal — opens when a WhatsApp send didn't go out (Cloud
// API failure, unparseable phone, or a popup-blocked wa.me tab) so the admin can
// deliver the message themself. Single failure → the guest's full message text
// with Copy / Open-WhatsApp actions; multiple failures (bulk send) → a
// scrollable per-guest summary with compact row actions. Opening WhatsApp fires
// `onManualSent(f)` (stamps `inviteWaStatus: "manual"` server-side); copying
// does NOT — the admin may still decide not to send.
import { useEffect, useState } from "react";
import { Modal } from "../../../components/ui/Modal.jsx";
import { C } from "../../../styles/theme.js";
import { buildWaLink } from "../../../utils/phone.js";
import { localizeApiError } from "../../../utils/apiError.js";

// The exact text the server would have sent — same join as whatsappInvite.ts.
const fullText = (f) => [f.message, f.url].filter(Boolean).join("\n\n");

// Shared button base — matches AdminSendTab's inline-button density.
const BTN = {
  padding: "8px 14px", borderRadius: 10, border: "none", cursor: "pointer",
  fontSize: 12, fontWeight: 800, fontFamily: "inherit", whiteSpace: "nowrap",
};
const COPY_BTN = {
  ...BTN, background: "rgba(201,168,76,.16)",
  border: "1px solid rgba(201,168,76,.4)", color: C.gold,
};
const OPEN_BTN = { ...BTN, background: "linear-gradient(135deg,#25d366,#1ea84d)", color: "#fff" };
const COMPACT = { padding: "6px 10px", fontSize: 11 };

export function WaSendFallbackModal({ open, onClose, failures, onManualSent, t, lang, showToast }) {
  // Bulk rows the admin already handled (copy OR open) gray out for this
  // modal-opening only — reset whenever the modal reopens with new failures.
  const [doneIds, setDoneIds] = useState(() => new Set());
  useEffect(() => { if (open) setDoneIds(new Set()); }, [open]);
  void lang; // reserved — copy is fully key-driven via t()

  const markDone = (f) => setDoneIds((prev) => new Set(prev).add(f.guestId));

  const copy = async (f) => {
    const text = fullText(f);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showToast(t("wa_fallback_copied"));
      markDone(f);
    } catch {
      // Clipboard unavailable/denied (http origin, permission) — do NOT check
      // the row off; the message box stays selectable for a manual copy.
      showToast(t("wa_fallback_copy_failed"));
    }
  };

  // Direct user gesture → not popup-blockable like the auto-open was.
  const openWa = (f) => {
    const wa = buildWaLink(f.phone, f.message, f.url);
    if (!wa) return;
    window.open(wa, "_blank", "noopener");
    onManualSent?.(f);
    markDone(f);
  };

  // Localize the failure slug. Unmapped slugs (raw Meta Graph text, http_4xx)
  // fall back to the generic localized failure — never raw English in RTL UI.
  const errorLabel = (slug) => {
    if (!slug) return "";
    if (slug === "invalid_phone") return t("send_invalid_phone");
    if (slug === "popup_blocked") return t("wa_error_popup_blocked");
    if (slug === "send_failed") return t("send_failed");
    return localizeApiError(slug, t, t("wa_send_failed"));
  };

  if (!open) return null;
  const single = failures.length === 1 ? failures[0] : null;

  // ── Single failure — full message + one Copy / Open pair ─────────────────
  if (single) {
    const text = fullText(single);
    const wa = buildWaLink(single.phone, single.message, single.url);
    return (
      <Modal
        open={open}
        onClose={onClose}
        title={t("wa_fallback_title")}
        closeLabel={t("wa_fallback_close")}
        footer={
          <>
            {text ? (
              <button data-testid="wa-fallback-copy" style={COPY_BTN} onClick={() => copy(single)}>
                📋 {t("wa_fallback_copy")}
              </button>
            ) : null}
            {wa && text ? (
              <button data-testid="wa-fallback-open" style={OPEN_BTN} onClick={() => openWa(single)}>
                {t("wa_fallback_open")}
              </button>
            ) : null}
            <button
              style={{ ...BTN, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", color: C.goldDim }}
              onClick={onClose}
            >
              {t("wa_fallback_close")}
            </button>
          </>
        }
      >
        <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.7, marginBottom: 10 }}>
          {t("wa_fallback_hint")}
        </div>
        <div style={{ fontWeight: 800, color: C.goldLight, fontSize: 14 }}>{single.name}</div>
        <div style={{ fontSize: 11, color: C.dim, direction: "ltr", textAlign: "right", marginBottom: 8 }}>
          {single.phone}
        </div>
        {/* Phone unusable for wa.me → the admin can still copy + paste elsewhere. */}
        {!wa && (
          <div style={{ fontSize: 11, color: C.red, marginBottom: 8 }}>{t("wa_fallback_no_phone")}</div>
        )}
        {text ? (
          <div
            data-testid="wa-fallback-text"
            dir="auto"
            style={{
              whiteSpace: "pre-wrap", maxHeight: 220, overflowY: "auto", userSelect: "text",
              padding: "10px 12px", borderRadius: 10, fontSize: 13, lineHeight: 1.8,
              background: "rgba(255,255,255,.04)", border: "1px solid rgba(201,168,76,.25)",
              color: C.goldLight, wordBreak: "break-word",
            }}
          >
            {text}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: C.red }}>{errorLabel(single.error)}</div>
        )}
      </Modal>
    );
  }

  // ── Bulk summary — one compact row per failed guest ──────────────────────
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("wa_bulk_failed_title")}
      closeLabel={t("wa_fallback_close")}
      size="lg"
      footer={
        <button
          style={{ ...BTN, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", color: C.goldDim }}
          onClick={onClose}
        >
          {t("wa_fallback_close")}
        </button>
      }
    >
      <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.7, marginBottom: 10 }}>
        {t("wa_bulk_failed_hint")}
      </div>
      <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        {failures.map((f) => {
          const done = doneIds.has(f.guestId);
          // Button-less failures (early exits from the bulk loop) carry no
          // message payload — render name + phone + error only.
          const hasPayload = !!(f.message || f.url);
          const wa = hasPayload ? buildWaLink(f.phone, f.message, f.url) : null;
          const errLine = [errorLabel(f.error), hasPayload && !wa ? t("wa_fallback_no_phone") : ""]
            .filter(Boolean).join(" · ");
          return (
            <div
              key={f.guestId || f.name}
              data-testid={`wa-row-${f.guestId}`}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
                borderRadius: 12, background: "rgba(255,255,255,.03)",
                border: "1px solid rgba(255,255,255,.08)",
                opacity: done ? 0.45 : 1, transition: "opacity .2s",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, color: C.goldLight, fontSize: 13 }}>{f.name}</div>
                <div style={{ fontSize: 11, color: C.dim, direction: "ltr", textAlign: "right" }}>{f.phone}</div>
                {errLine && <div style={{ fontSize: 10.5, color: C.red, marginTop: 2 }}>{errLine}</div>}
              </div>
              {done && (
                <span style={{ fontSize: 11, fontWeight: 800, color: "#4cc97a", whiteSpace: "nowrap" }}>
                  {t("wa_fallback_done")}
                </span>
              )}
              {hasPayload && (
                <button data-testid={`wa-row-copy-${f.guestId}`} style={{ ...COPY_BTN, ...COMPACT }} onClick={() => copy(f)}>
                  📋 {t("wa_fallback_copy")}
                </button>
              )}
              {wa && (
                <button data-testid={`wa-row-open-${f.guestId}`} style={{ ...OPEN_BTN, ...COMPACT }} onClick={() => openWa(f)}>
                  {t("wa_fallback_open")}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
