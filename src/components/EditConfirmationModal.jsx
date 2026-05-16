// Admin edit modal for a guest confirmation. Edits name, phone, and address.
// On save, propagates changes to both /confirmations/{id} and the matched
// guest record (if any) — see saveConfirmationEdit in usePortalState.js.
import { useEffect, useState } from "react";
import { usePortal } from "../context/PortalContext.jsx";

export function EditConfirmationModal() {
  const { editingConf, setEditingConf, saveConfirmationEdit, t } = usePortal();

  // Local form state — pre-filled from the confirmation when the modal opens.
  const [name,  setName]  = useState("");
  const [phone, setPhone] = useState("");
  const [city,  setCity]  = useState("");

  useEffect(() => {
    if (editingConf) {
      setName (editingConf.submittedName  || "");
      setPhone(editingConf.submittedPhone || "");
      // Show city + street + house joined; admin can edit as one address field.
      setCity ([editingConf.submittedCity, editingConf.submittedStreet, editingConf.submittedHouse]
        .filter(Boolean).join("، "));
    }
  }, [editingConf]);

  if (!editingConf) return null;

  const close = () => setEditingConf(null);
  const save = () => {
    if (!name.trim() || !phone.trim()) return;
    saveConfirmationEdit(editingConf.id, {
      submittedName:  name.trim(),
      submittedPhone: phone.trim(),
      submittedCity:  city.trim(),
    });
  };

  return (
    <div onClick={close} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.78)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 20, animation: "fadeIn .25s ease",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        maxWidth: 440, width: "100%",
        background: "#0c0c11", border: "1px solid rgba(201,168,76,.3)",
        borderRadius: 18, padding: 24, animation: "slideUp .3s ease",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ color: "#c9a84c", fontWeight: 900, fontSize: 18, fontFamily: "'Amiri',serif" }}>
            {t("admin_conf_edit")}
          </div>
          <button onClick={close} style={{
            background: "none", border: "none", color: "#7a6a4a", fontSize: 22,
            cursor: "pointer", padding: 0, lineHeight: 1,
          }}>×</button>
        </div>

        <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("field_name")}</div>
        <input className="input-field" type="text"
               value={name} onChange={e => setName(e.target.value)}
               style={{ marginBottom: 12 }}/>

        <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("field_phone")}</div>
        <input className="input-field" type="tel" inputMode="tel" maxLength={30}
               value={phone}
               onChange={e => setPhone(e.target.value)}
               style={{ marginBottom: 12, direction: "ltr", textAlign: "right" }}/>

        <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>
          {t("field_address")} <span style={{ color: "#5a5040", fontWeight: 400 }}>{t("field_address_optional")}</span>
        </div>
        <input className="input-field" type="text"
               value={city} onChange={e => setCity(e.target.value)}
               style={{ marginBottom: 20 }}/>

        <div style={{ display: "flex", gap: 10 }}>
          <button className="ghost-btn" style={{ flex: 1 }} onClick={close}>
            {t("edit_cancel")}
          </button>
          <button className="gold-btn" style={{ flex: 1 }} onClick={save}
                  disabled={!name.trim() || !phone.trim()}>
            {t("edit_save")}
          </button>
        </div>
      </div>
    </div>
  );
}
