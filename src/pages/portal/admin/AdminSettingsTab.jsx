// Admin → Settings tab: the WhatsApp message body + (read-only) preview of
// the auto-generated per-guest invite-link pattern.
import { usePortal } from "../../../context/PortalContext.jsx";
import { C } from "../../../styles/theme.js";

export function AdminSettingsTab() {
  const {
    t, adminMessageBody, setAdminMessageBody, showToast,
  } = usePortal();
  const inviteLinkPattern = `${typeof window !== "undefined" ? window.location.origin : ""}/invite/{token}`;
  return (
            <div>
              <div style={{ fontSize: 19, fontWeight: 900, color: C.gold, fontFamily: "'Amiri',serif", marginBottom: 4 }}>
                ⚙ {t("admin_settings_title")}
              </div>
              <div style={{ fontSize: 12, color: C.dim, marginBottom: 16 }}>
                {t("admin_settings_subtitle")}
              </div>

              <div className="gold-card">
                <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("admin_form_link")}</div>
                <div style={{
                  marginBottom: 6, padding: "10px 12px", borderRadius: 10,
                  background: "rgba(201,168,76,.06)", border: "1px solid rgba(201,168,76,.2)",
                  direction: "ltr", textAlign: "left",
                  fontSize: 12, color: C.goldLight, fontFamily: "monospace",
                  wordBreak: "break-all",
                }}>
                  {inviteLinkPattern}
                </div>
                <div style={{ marginBottom: 16, fontSize: 11, color: C.dim, lineHeight: 1.7 }}>
                  {t("admin_form_link_auto_hint")}
                </div>

                <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("admin_msg_body")}</div>
                <textarea className="input-field"
                          placeholder={t("admin_msg_placeholder")}
                          value={adminMessageBody}
                          onChange={e => setAdminMessageBody(e.target.value)}
                          rows={8}
                          style={{ marginBottom: 16, fontSize: 13, resize: "vertical", fontFamily: "inherit" }}/>

                <button className="gold-btn" style={{ width: "100%" }}
                        onClick={() => showToast(t("admin_settings_saved"))}>
                  {t("admin_save_settings")}
                </button>
              </div>
            </div>
  );
}
