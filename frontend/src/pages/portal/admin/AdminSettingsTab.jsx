// Admin → Settings tab.
// Mode selector at top: "Manual" keeps the legacy WhatsApp template + form-link
// settings; "Digital" exposes the new digital-invitation base URL + custom
// message used by the bulk sender for the new public landing page.
import { useEffect } from "react";
import { usePortal } from "../../../context/PortalContext.jsx";
import { Num } from "../../../components/Num.jsx";
import { C } from "../../../styles/theme.js";

export function AdminSettingsTab() {
  const {
    t, lang, showToast,
    adminMessageBody, setAdminMessageBody,
    adminMode, setAdminMode,
    adminDigitalBaseUrl, setAdminDigitalBaseUrl,
    adminDigitalMessage, setAdminDigitalMessage,
    contact, setContactField,
  } = usePortal();

  const inviteLinkPattern = `${typeof window !== "undefined" ? window.location.origin : ""}/invite/{token}`;
  const defaultDigitalBase = typeof window !== "undefined" ? `${window.location.origin}/d` : "";

  // Auto-populate digitalBaseUrl the first time the admin selects "digital"
  // and the field is still empty — never overwrite an existing value.
  useEffect(() => {
    if (adminMode === "digital" && !adminDigitalBaseUrl && defaultDigitalBase) {
      setAdminDigitalBaseUrl(defaultDigitalBase);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminMode]);

  return (
    <div>
      <div style={{ fontSize: 19, fontWeight: 900, color: C.gold, fontFamily: "'Amiri',serif", marginBottom: 4 }}>
        ⚙ {t("admin_settings_title")}
      </div>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 16 }}>
        {t("admin_settings_subtitle")}
      </div>

      {/* ── Mode selector ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <ModeButton
          active={adminMode === "manual"}
          onClick={() => setAdminMode("manual")}
          icon="📝"
          label={lang === "he" ? "ידני" : "يدوي"}
        />
        <ModeButton
          active={adminMode === "digital"}
          onClick={() => setAdminMode("digital")}
          icon="🌐"
          label={lang === "he" ? "הזמנה דיגיטלית" : "دعوة رقمية"}
        />
      </div>

      {/* ── Manual fields (existing, unchanged) ────────────────────────── */}
      {adminMode === "manual" && (
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
      )}

      {/* ── Digital invitation fields (new) ────────────────────────────── */}
      {adminMode === "digital" && (
        <div className="gold-card">
          <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>
            {lang === "he" ? "קישור הזמנה דיגיטלית" : "رابط الدعوة الرقمية"}
          </div>
          <input className="input-field" type="text"
                 value={adminDigitalBaseUrl}
                 onChange={e => setAdminDigitalBaseUrl(e.target.value)}
                 placeholder={defaultDigitalBase}
                 style={{ marginBottom: 6, fontSize: 12, direction: "ltr", textAlign: "left",
                          fontFamily: "monospace" }}/>
          <div style={{ marginBottom: 16, fontSize: 11, color: C.dim, lineHeight: 1.7 }}>
            {lang === "he"
              ? "כתובת הבסיס לעמוד ההזמנה הדיגיטלית — תושלם אוטומטית עם שם המוזמן + טוקן בעת שליחה"
              : "العنوان الأساسي لصفحة الدعوة الرقمية — يُضاف اسم العريس + التوكن تلقائياً عند الإرسال"}
          </div>

          <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>
            {lang === "he" ? "טקסט הודעה מותאם" : "نص الرسالة المخصصة"}
          </div>
          <textarea className="input-field"
                    placeholder={lang === "he"
                      ? "כתוב את ההודעה שתישלח עם הקישור..."
                      : "اكتب الرسالة التي ستُرسل مع الرابط..."}
                    value={adminDigitalMessage}
                    onChange={e => setAdminDigitalMessage(e.target.value.slice(0, 4000))}
                    rows={8}
                    style={{ marginBottom: 6, fontSize: 13, resize: "vertical", fontFamily: "inherit" }}/>
          <div style={{ marginBottom: 16, fontSize: 11, color: C.dim, lineHeight: 1.7 }}>
            <Num>{adminDigitalMessage.length.toLocaleString("en")} / 4000</Num>
          </div>

          <button className="gold-btn" style={{ width: "100%" }}
                  onClick={() => showToast(t("admin_settings_saved"))}>
            {t("admin_save_settings")}
          </button>
        </div>
      )}

      {/* ── Communication channels (shown on the public marketing site) ──── */}
      <div style={{ fontSize: 17, fontWeight: 900, color: C.gold, fontFamily: "'Amiri',serif", margin: "26px 0 4px" }}>
        💬 {t("admin_comms_title")}
      </div>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 14 }}>
        {t("admin_comms_subtitle")}
      </div>
      <div className="gold-card">
        <ChannelRow t={t} label={t("admin_comms_whatsapp")} hint={t("admin_comms_whatsapp_hint")}
                    valueKey="contactWhatsapp" ltr contact={contact} setContactField={setContactField} />
        <ChannelRow t={t} label={t("admin_comms_phone")}
                    valueKey="contactPhone" ltr contact={contact} setContactField={setContactField} />
        <ChannelRow t={t} label={t("admin_comms_email")}
                    valueKey="contactEmail" ltr contact={contact} setContactField={setContactField} />
        <ChannelRow t={t} label={t("admin_comms_facebook")}
                    valueKey="socialFacebook" ltr contact={contact} setContactField={setContactField} />
        <ChannelRow t={t} label={t("admin_comms_instagram")}
                    valueKey="socialInstagram" ltr contact={contact} setContactField={setContactField} />
        <ChannelRow t={t} label={t("admin_comms_tiktok")}
                    valueKey="socialTiktok" ltr contact={contact} setContactField={setContactField} />
      </div>
    </div>
  );
}

// One contact-channel row: label + enable/disable toggle + text input. The
// value writes through `contactWhatsapp` etc.; the toggle writes the matching
// `…Enabled` boolean. Both persist immediately (optimistic, like the rest of
// the settings tab).
function ChannelRow({ t, label, hint, valueKey, ltr, contact, setContactField }) {
  const value = contact?.[valueKey] ?? "";
  const enabled = contact?.[`${valueKey}Enabled`] === true;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: C.goldDim }}>{label}</span>
        <button
          onClick={() => setContactField(`${valueKey}Enabled`, !enabled)}
          style={{
            fontSize: 11, fontWeight: 800, padding: "4px 12px", borderRadius: 999, cursor: "pointer",
            fontFamily: "inherit",
            background: enabled ? "rgba(201,168,76,.18)" : "rgba(255,255,255,.04)",
            border: `1px solid ${enabled ? "rgba(201,168,76,.5)" : "rgba(255,255,255,.12)"}`,
            color: enabled ? C.gold : C.dim,
          }}>
          {enabled ? t("admin_comms_on") : t("admin_comms_off")}
        </button>
      </div>
      <input className="input-field" type="text"
             value={value}
             onChange={(e) => setContactField(valueKey, e.target.value)}
             style={{ fontSize: 13, ...(ltr ? { direction: "ltr", textAlign: "left" } : {}) }} />
      {hint && <div style={{ marginTop: 4, fontSize: 11, color: C.dim, lineHeight: 1.6 }}>{hint}</div>}
    </div>
  );
}

function ModeButton({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: "12px 8px", borderRadius: 12, cursor: "pointer",
      background: active ? "rgba(201,168,76,.18)" : "rgba(255,255,255,.04)",
      border: `1px solid ${active ? "rgba(201,168,76,.45)" : "rgba(255,255,255,.08)"}`,
      color: active ? C.gold : C.dim,
      fontSize: 13, fontWeight: 800, fontFamily: "inherit",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
      transition: "all .2s",
    }}>
      <div style={{ fontSize: 22 }}>{icon}</div>
      <div>{label}</div>
    </button>
  );
}
