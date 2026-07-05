// Show-once temp-password modal — opens after creating / resetting a
// groom/driver when the WhatsApp credentials message did NOT go out (no phone,
// sender unconfigured, daily cap, API failure). The admin copies the generated
// password or opens WhatsApp with a pre-filled message and delivers it
// themself; the user is then forced to change it on first login. Modeled on
// WaSendFallbackModal (same Copy / Open-WhatsApp pair).
//
// `creds` = { username, password, phoneE164?, deliveryError? } | null.
// NOTE: never log `creds` — it carries a plaintext password.
import { Modal } from "../../../components/ui/Modal.jsx";
import { C } from "../../../styles/theme.js";
import { buildWaLink } from "../../../utils/phone.js";

const BTN = {
  padding: "8px 14px", borderRadius: 10, border: "none", cursor: "pointer",
  fontSize: 12, fontWeight: 800, fontFamily: "inherit", whiteSpace: "nowrap",
};
const COPY_BTN = {
  ...BTN, background: "rgba(201,168,76,.16)",
  border: "1px solid rgba(201,168,76,.4)", color: C.gold,
};
const OPEN_BTN = { ...BTN, background: "linear-gradient(135deg,#25d366,#1ea84d)", color: "#fff" };

export function TempPasswordModal({ creds, onClose, t, showToast }) {
  if (!creds) return null;
  const loginUrl = `${window.location.origin}/portal/login`;
  // Copy carries the full credentials (clipboard, not persisted).
  const copyText = `${t("login_user")}: ${creds.username}\n${t("login_pass")}: ${creds.password}\n${loginUrl}`;
  // The wa.me message deliberately OMITS the password: window.open records the
  // URL in the admin's browser history, and a credential in the URL would
  // survive there — defeating the "shown once" guarantee. The admin pastes the
  // password (copied to the clipboard on click) into the opened WhatsApp chat.
  const waText = `${t("login_user")}: ${creds.username}\n${loginUrl}`;
  const wa = creds.phoneE164 ? buildWaLink(creds.phoneE164, waText) : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      showToast(t("wa_fallback_copied"));
    } catch {
      // Clipboard unavailable/denied — the box below stays selectable.
      showToast(t("wa_fallback_copy_failed"));
    }
  };

  // Open WhatsApp with the password-less message, and copy the PASSWORD to the
  // clipboard so the admin can paste it into the chat without it ever entering
  // the URL / browser history.
  const openWa = async () => {
    try {
      await navigator.clipboard.writeText(creds.password);
      showToast(t("admin_temp_pw_wa_paste"));
    } catch {
      /* clipboard denied — admin copies from the visible field below */
    }
    window.open(wa, "_blank", "noopener");
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t("admin_temp_pw_title")}
      closeLabel={t("wa_fallback_close")}
      footer={
        <>
          <button data-testid="temp-pw-copy" style={COPY_BTN} onClick={copy}>
            📋 {t("wa_fallback_copy")}
          </button>
          {wa && (
            <button data-testid="temp-pw-open-wa" style={OPEN_BTN} onClick={openWa}>
              {t("wa_fallback_open")}
            </button>
          )}
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
        {t("admin_temp_pw_hint")}
      </div>
      <div style={{ fontWeight: 800, color: C.goldLight, fontSize: 14, direction: "ltr", textAlign: "right" }}>
        @{creds.username}
      </div>
      <div
        data-testid="temp-pw-value"
        style={{
          marginTop: 8, padding: "12px 14px", borderRadius: 10, userSelect: "text",
          background: "rgba(255,255,255,.05)", border: "1px solid rgba(201,168,76,.35)",
          color: C.goldLight, fontSize: 17, fontWeight: 800, letterSpacing: 1,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          direction: "ltr", textAlign: "center", wordBreak: "break-all",
        }}
      >
        {creds.password}
      </div>
      <div style={{ fontSize: 11, color: C.red, marginTop: 10, fontWeight: 700 }}>
        ⚠ {t("admin_temp_pw_shown_once")}
      </div>
    </Modal>
  );
}
