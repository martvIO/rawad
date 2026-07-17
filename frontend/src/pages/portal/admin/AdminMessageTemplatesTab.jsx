// Admin → Message Templates tab. Slot-oriented guided editor for the 4 invite
// templates (physical/digital × ar/he). The admin writes the body wording (with
// a {{1}} guest-name variable) + button label; the system builds the correct
// Meta structure (the invite-link URL button) and submits to Meta. Shows live
// approval status; supports create / edit-resubmit / delete + a test send.
import { useState, useEffect } from "react";
import { usePortal } from "../../../context/PortalContext.jsx";
import { C } from "../../../styles/theme.js";
import { logErr } from "../../../utils/logger.js";
import { localizeApiError } from "../../../utils/apiError.js";
import { SLOT_STATUS_STYLE, slotLabel, statusText } from "./whatsappSlots.js";
import {
  listTemplates, createTemplate, editTemplate, deleteTemplate, sendTestMessage,
} from "../../../services/whatsappAdmin.js";

const DEFAULT_BODY = {
  ar: "مرحبا {{1}}، يسعدنا دعوتكم لحضور مناسبتنا. اضغطوا الزر أدناه لفتح الدعوة.",
  he: "שלום {{1}}, שמחים להזמין אתכם לאירוע שלנו. לחצו על הכפתור לפתיחת ההזמנה.",
};
const DEFAULT_LABEL = { ar: "افتح الدعوة", he: "פתח הזמנה" };

// Surface a Meta error detail (502 { error:'meta_error', detail }) when present.
function apiErr(e, t, fallback) {
  return e?.body?.detail || e?.body?.error || localizeApiError(e, t, fallback);
}

export function AdminMessageTemplatesTab() {
  const { t, lang, showToast } = usePortal();
  const [slots, setSlots] = useState([]);
  const [metaError, setMetaError] = useState(null);
  const [loading, setLoading] = useState(true);
  const he = lang === "he";

  const load = async () => {
    setLoading(true);
    try {
      const r = await listTemplates();
      setSlots(Array.isArray(r?.slots) ? r.slots : []);
      setMetaError(r?.metaError || null);
    } catch (e) {
      logErr("listTemplates", e);
      showToast(apiErr(e, t, t("wa_tpl_load_failed")));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div>
      <div style={{ fontSize: 19, fontWeight: 900, color: C.gold, fontFamily: "'Amiri','Frank Ruhl Libre','Amiri Fallback',serif", marginBottom: 4 }}>
        📝 {t("wa_tpl_title")}
      </div>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 12 }}>{t("wa_tpl_subtitle")}</div>

      <div className="gold-card" style={{ marginBottom: 16, background: "rgba(224,181,75,.06)", border: "1px solid rgba(224,181,75,.25)" }}>
        <div style={{ fontSize: 11.5, color: C.goldDim, lineHeight: 1.7 }}>ℹ️ {t("wa_tpl_marketing_note")}</div>
      </div>

      {metaError && (
        <div className="card" style={{ marginBottom: 14, padding: "10px 14px", background: "rgba(212,122,75,.08)", border: "1px solid rgba(212,122,75,.3)" }}>
          <div style={{ fontSize: 11.5, color: "#d47a4b", lineHeight: 1.7 }}>⚠️ {t("wa_tpl_meta_unreachable")}</div>
        </div>
      )}

      {loading && <div className="card" style={{ textAlign: "center", padding: 24, color: C.dim }}>…</div>}

      {slots.map((s) => (
        <SlotCard key={`${s.slot}:${s.status}`} slot={s} t={t} he={he} showToast={showToast} onChanged={load} />
      ))}
    </div>
  );
}

function SlotCard({ slot, t, he, showToast, onChanged }) {
  const exists = slot.status && slot.status !== "none";
  const [body, setBody] = useState(slot.bodyText || DEFAULT_BODY[slot.language] || DEFAULT_BODY.ar);
  const [label, setLabel] = useState(slot.buttonLabel || DEFAULT_LABEL[slot.language] || DEFAULT_LABEL.ar);
  const [category, setCategory] = useState(slot.category === "UTILITY" ? "UTILITY" : "MARKETING");
  const [testPhone, setTestPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const st = SLOT_STATUS_STYLE[slot.status] || SLOT_STATUS_STYLE.none;

  const submit = async (mode) => {
    if (!/\{\{1\}\}/.test(body)) { showToast(t("wa_tpl_need_var")); return; }
    if (!label.trim()) { showToast(t("wa_tpl_need_label")); return; }
    setBusy(true);
    try {
      const draft = { bodyText: body, buttonLabel: label.trim(), category };
      await (mode === "edit" ? editTemplate : createTemplate)(slot.slot, draft);
      showToast(mode === "edit" ? t("wa_tpl_resubmitted") : t("wa_tpl_created"));
      onChanged();
    } catch (e) {
      logErr("submitTemplate", e);
      showToast(apiErr(e, t, t("wa_tpl_submit_failed")));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(t("wa_tpl_delete_confirm"))) return;
    setBusy(true);
    try {
      await deleteTemplate(slot.slot);
      showToast(t("wa_tpl_deleted"));
      onChanged();
    } catch (e) {
      logErr("deleteTemplate", e);
      showToast(apiErr(e, t, t("wa_tpl_submit_failed")));
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    if (!testPhone.trim()) { showToast(t("wa_test_need_phone")); return; }
    setBusy(true);
    try {
      const { send } = await sendTestMessage({ phone: testPhone.trim(), slot: slot.slot });
      showToast(send?.ok ? t("wa_test_ok") : `${t("wa_test_failed")}${send?.error ? ` — ${send.error}` : ""}`);
    } catch (e) {
      logErr("testTemplate", e);
      showToast(apiErr(e, t, t("wa_test_failed")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gold-card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: C.gold }}>
          {slot.type === "digital" ? "🌐" : "✉️"} {slotLabel(slot.slot, he)}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 999, background: st.bg, color: st.color }}>
          {st.icon} {statusText(slot.status, t)}{slot.category ? ` · ${slot.category}` : ""}
        </span>
      </div>

      <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 6 }}>{t("wa_tpl_body")}</div>
      <textarea className="input-field" rows={4} value={body}
                onChange={(e) => setBody(e.target.value.slice(0, 1024))}
                style={{ fontSize: 13, resize: "vertical", fontFamily: "inherit", marginBottom: 4 }} />
      <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.6, marginBottom: 12 }}>{t("wa_tpl_body_hint")}</div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 6 }}>{t("wa_tpl_button_label")}</div>
          <input className="input-field" type="text" value={label}
                 onChange={(e) => setLabel(e.target.value.slice(0, 25))}
                 style={{ fontSize: 13 }} />
        </div>
        <div style={{ width: 150 }}>
          <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 6 }}>{t("wa_tpl_category")}</div>
          <select className="input-field" value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  style={{ fontSize: 13, cursor: "pointer" }}>
            <option value="MARKETING" style={{ background: "#0f0f15" }}>MARKETING</option>
            <option value="UTILITY" style={{ background: "#0f0f15" }}>UTILITY</option>
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="gold-btn" style={{ flex: "1 1 140px", opacity: busy ? 0.6 : 1 }}
                disabled={busy} onClick={() => submit(exists ? "edit" : "create")}>
          {exists ? "↻ " + t("wa_tpl_resubmit") : "＋ " + t("wa_tpl_create")}
        </button>
        {exists && (
          <button disabled={busy} onClick={remove} style={{
            flex: "0 1 110px", padding: "10px 14px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
            background: "rgba(212,80,58,.08)", border: "1px solid rgba(212,80,58,.3)", color: C.red, fontWeight: 800, fontSize: 12,
          }}>🗑 {t("wa_tpl_delete")}</button>
        )}
      </div>

      {/* Per-slot test send */}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input className="input-field" type="text" value={testPhone}
               onChange={(e) => setTestPhone(e.target.value)} placeholder={"🧪 " + "0544642743"}
               style={{ flex: 1, fontSize: 12, direction: "ltr", textAlign: "left" }} />
        <button disabled={busy} onClick={test} style={{
          minWidth: 90, padding: "8px 12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
          background: "rgba(75,159,212,.12)", border: "1px solid rgba(75,159,212,.35)", color: "#4b9fd4", fontWeight: 800, fontSize: 12,
        }}>{t("wa_test_send")}</button>
      </div>
    </div>
  );
}
