// Admin → WhatsApp Setup tab. Configures the NON-SECRET WhatsApp Cloud API
// settings (phone id, WABA id, verify token, auto-send toggle, daily cap,
// fallback text) + a connection-status panel and a test-send button. The access
// token + app secret are NOT managed here — they live in the server env; this
// page only shows whether they're present.
import { useEffect, useState } from "react";
import { usePortal } from "../../../context/PortalContext.jsx";
import { C } from "../../../styles/theme.js";
import { logErr } from "../../../utils/logger.js";
import { localizeApiError } from "../../../utils/apiError.js";
import { SLOT_STATUS_STYLE, slotLabel, statusText } from "./whatsappSlots.js";
import { getWhatsAppStatus, saveWhatsAppConfig, sendTestMessage } from "../../../services/whatsappAdmin.js";

const EMPTY_FORM = {
  phoneId: "", wabaId: "", verifyToken: "",
  autoSendEnabled: true, dailyCap: 250,
  fallbackTextAr: "", fallbackTextHe: "",
};

export function AdminWhatsAppSetupTab() {
  const { t, lang, showToast } = usePortal();
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);
  const he = lang === "he";

  const load = async () => {
    try {
      const s = await getWhatsAppStatus();
      setStatus(s);
      setForm({
        phoneId: s.phoneId || "",
        wabaId: s.wabaId || "",
        verifyToken: "", // write-only; never returned
        autoSendEnabled: s.autoSendEnabled !== false,
        dailyCap: s.dailyCap || 250,
        fallbackTextAr: s.fallbackText?.ar || "",
        fallbackTextHe: s.fallbackText?.he || "",
      });
    } catch (e) {
      logErr("getWhatsAppStatus", e);
      showToast(localizeApiError(e, t, t("wa_setup_load_failed")));
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const patch = {
        phoneId: form.phoneId,
        wabaId: form.wabaId,
        autoSendEnabled: form.autoSendEnabled,
        dailyCap: Number(form.dailyCap) || 250,
        fallbackTextAr: form.fallbackTextAr,
        fallbackTextHe: form.fallbackTextHe,
      };
      // Only write the verify token when the admin typed a new one (write-only).
      if (form.verifyToken.trim()) patch.verifyToken = form.verifyToken.trim();
      await saveWhatsAppConfig(patch);
      showToast(t("wa_setup_saved"));
      await load();
    } catch (e) {
      logErr("saveWhatsAppConfig", e);
      showToast(localizeApiError(e, t, t("wa_setup_save_failed")));
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    if (!testPhone.trim()) { showToast(t("wa_test_need_phone")); return; }
    setTesting(true);
    try {
      const { send } = await sendTestMessage({ phone: testPhone.trim() });
      showToast(send?.ok ? t("wa_test_ok") : `${t("wa_test_failed")}${send?.error ? ` — ${send.error}` : ""}`);
    } catch (e) {
      logErr("sendTestMessage", e);
      showToast(localizeApiError(e, t, t("wa_test_failed")));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <div style={{ fontSize: 19, fontWeight: 900, color: C.gold, fontFamily: "'Amiri','Frank Ruhl Libre','Amiri Fallback',serif", marginBottom: 4 }}>
        📱 {t("wa_setup_title")}
      </div>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 16 }}>{t("wa_setup_subtitle")}</div>

      {/* ── Connection status ─────────────────────────────────────────── */}
      <div className="gold-card" style={{ marginBottom: 16 }}>
        <SectionTitle>🔌 {t("wa_status_title")}</SectionTitle>
        <StatusRow label={t("wa_status_configured")} ok={status?.configured} t={t} />
        <StatusRow label={t("wa_status_token")} ok={status?.hasToken} t={t}
                   hint={!status?.hasToken ? t("wa_status_token_hint") : undefined} />
        <StatusRow label={t("wa_status_app_secret")} ok={status?.hasAppSecret} t={t} />
        <StatusRow label={t("wa_status_verify_token")} ok={status?.verifyTokenSet} t={t} />
        <div style={{ marginTop: 8, fontSize: 11, color: C.dim, lineHeight: 1.7 }}>
          {t("wa_setup_secret_note")}
        </div>
      </div>

      {/* ── Non-secret config ─────────────────────────────────────────── */}
      <div className="gold-card" style={{ marginBottom: 16 }}>
        <SectionTitle>⚙ {t("wa_config_title")}</SectionTitle>
        <Field label={t("wa_phone_id")} hint={t("wa_phone_id_hint")}
               value={form.phoneId} onChange={(v) => setField("phoneId", v)} ltr />
        <Field label={t("wa_waba_id")} hint={t("wa_waba_id_hint")}
               value={form.wabaId} onChange={(v) => setField("wabaId", v)} ltr />
        <Field label={t("wa_verify_token")}
               hint={status?.verifyTokenSet ? t("wa_verify_token_set") : t("wa_verify_token_hint")}
               value={form.verifyToken} onChange={(v) => setField("verifyToken", v)}
               placeholder={status?.verifyTokenSet ? "•••••••• (set)" : ""} ltr />

        <ToggleRow t={t} label={t("wa_autosend")} hint={t("wa_autosend_hint")}
                   enabled={form.autoSendEnabled} onToggle={() => setField("autoSendEnabled", !form.autoSendEnabled)} />

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 6 }}>{t("wa_daily_cap")}</div>
          <input className="input-field" type="number" min={1} max={100000}
                 value={form.dailyCap}
                 onChange={(e) => setField("dailyCap", e.target.value)}
                 style={{ fontSize: 13, direction: "ltr", textAlign: "left" }} />
          <div style={{ marginTop: 4, fontSize: 11, color: C.dim, lineHeight: 1.6 }}>{t("wa_daily_cap_hint")}</div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 6 }}>{t("wa_fallback_ar")}</div>
          <textarea className="input-field" rows={2} value={form.fallbackTextAr}
                    onChange={(e) => setField("fallbackTextAr", e.target.value.slice(0, 4000))}
                    style={{ fontSize: 13, resize: "vertical", fontFamily: "inherit" }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 6 }}>{t("wa_fallback_he")}</div>
          <textarea className="input-field" rows={2} value={form.fallbackTextHe}
                    onChange={(e) => setField("fallbackTextHe", e.target.value.slice(0, 4000))}
                    style={{ fontSize: 13, resize: "vertical", fontFamily: "inherit" }} />
        </div>

        <button className="gold-btn" style={{ width: "100%", opacity: saving ? 0.6 : 1 }}
                disabled={saving} onClick={save}>
          {saving ? "…" : t("wa_save_config")}
        </button>
      </div>

      {/* ── Template slot statuses (authored on the Templates tab) ─────── */}
      <div className="gold-card" style={{ marginBottom: 16 }}>
        <SectionTitle>📝 {t("wa_slots_title")}</SectionTitle>
        {(status?.slots || []).map((s) => {
          const st = SLOT_STATUS_STYLE[s.status] || SLOT_STATUS_STYLE.none;
          return (
            <div key={s.slot} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
              <span style={{ fontSize: 12, color: C.goldLight }}>{slotLabel(s.slot, he)}</span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 999,
                             background: st.bg, color: st.color }}>{st.icon} {statusText(s.status, t)}</span>
            </div>
          );
        })}
        <div style={{ marginTop: 8, fontSize: 11, color: C.dim }}>{t("wa_slots_hint")}</div>
      </div>

      {/* ── Test send ─────────────────────────────────────────────────── */}
      <div className="gold-card">
        <SectionTitle>🧪 {t("wa_test_title")}</SectionTitle>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="input-field" type="text" value={testPhone}
                 onChange={(e) => setTestPhone(e.target.value)}
                 placeholder="0544642743"
                 style={{ flex: 1, fontSize: 13, direction: "ltr", textAlign: "left" }} />
          <button className="gold-btn" style={{ minWidth: 110, opacity: testing ? 0.6 : 1 }}
                  disabled={testing} onClick={test}>
            {testing ? "…" : t("wa_test_send")}
          </button>
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: C.dim, lineHeight: 1.6 }}>{t("wa_test_hint")}</div>
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return <div style={{ fontSize: 14, fontWeight: 800, color: C.gold, marginBottom: 12 }}>{children}</div>;
}

function StatusRow({ label, ok, hint, t }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, color: C.goldDim }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 10px", borderRadius: 999,
                       background: ok ? "rgba(76,201,122,.15)" : "rgba(212,122,75,.15)",
                       color: ok ? "#4cc97a" : "#d47a4b" }}>
          {ok ? "✓ " + t("wa_yes") : "✗ " + t("wa_no")}
        </span>
      </div>
      {hint && <div style={{ marginTop: 3, fontSize: 11, color: C.dim, lineHeight: 1.6 }}>{hint}</div>}
    </div>
  );
}

function Field({ label, hint, value, onChange, placeholder, ltr }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 6 }}>{label}</div>
      <input className="input-field" type="text" value={value}
             onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
             style={{ fontSize: 13, ...(ltr ? { direction: "ltr", textAlign: "left" } : {}) }} />
      {hint && <div style={{ marginTop: 4, fontSize: 11, color: C.dim, lineHeight: 1.6 }}>{hint}</div>}
    </div>
  );
}

function ToggleRow({ t, label, hint, enabled, onToggle }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: C.goldDim }}>{label}</span>
        <button onClick={onToggle} style={{
          fontSize: 11, fontWeight: 800, padding: "4px 12px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
          background: enabled ? "rgba(201,168,76,.18)" : "rgba(255,255,255,.04)",
          border: `1px solid ${enabled ? "rgba(201,168,76,.5)" : "rgba(255,255,255,.12)"}`,
          color: enabled ? C.gold : C.dim,
        }}>
          {enabled ? t("admin_comms_on") : t("admin_comms_off")}
        </button>
      </div>
      {hint && <div style={{ marginTop: 4, fontSize: 11, color: C.dim, lineHeight: 1.6 }}>{hint}</div>}
    </div>
  );
}
