// Admin → Settings tab: the WhatsApp message body + confirmation-form link.
import { usePortal } from "../../../context/PortalContext.jsx";

export function AdminSettingsTab() {
  const {
    t, adminFormLink, setAdminFormLink,
    adminMessageBody, setAdminMessageBody, showToast,
  } = usePortal();
  return (
            <div>
              <div style={{ fontSize: 19, fontWeight: 900, color: "#c9a84c", fontFamily: "'Amiri',serif", marginBottom: 4 }}>
                ⚙ {t("admin_settings_title")}
              </div>
              <div style={{ fontSize: 12, color: "#7a6a4a", marginBottom: 16 }}>
                {t("admin_settings_subtitle")}
              </div>

              <div className="gold-card">
                <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("admin_form_link")}</div>
                <input className="input-field" type="url" placeholder={t("admin_form_link_placeholder")}
                       value={adminFormLink} onChange={e => setAdminFormLink(e.target.value)}
                       style={{ marginBottom: 16, direction: "ltr", textAlign: "right", fontSize: 12 }}/>

                <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("admin_msg_body")}</div>
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
