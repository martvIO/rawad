// Admin edit modal for a guest confirmation. Edits name, phone, and address.
// On save, propagates changes to both /confirmations/{id} and the matched
// guest record (if any) — see saveConfirmationEdit in usePortalState.js.
// When the confirmation includes GPS coords, also exposes an "attach location
// to guest" picker so the admin can resolve ambiguous auto-match cases.
import { useEffect, useState } from "react";
import { usePortal } from "../context/PortalContext.jsx";
import { C } from "../styles/theme.js";

export function EditConfirmationModal() {
  const {
    editingConf, setEditingConf, saveConfirmationEdit,
    guests, attachConfirmationToGuest, t,
  } = usePortal();

  // Local form state — pre-filled from the confirmation when the modal opens.
  const [name,  setName]  = useState("");
  const [phone, setPhone] = useState("");
  const [city,  setCity]  = useState("");
  const [pickGuestId, setPickGuestId] = useState("");
  const [attaching, setAttaching] = useState(false);

  useEffect(() => {
    if (editingConf) {
      setName (editingConf.submittedName  || "");
      setPhone(editingConf.submittedPhone || "");
      // Show city + street + house joined; admin can edit as one address field.
      setCity ([editingConf.submittedCity, editingConf.submittedStreet, editingConf.submittedHouse]
        .filter(Boolean).join("، "));
      setPickGuestId("");
    }
  }, [editingConf]);

  if (!editingConf) return null;

  const hasCoords = typeof editingConf.lat === "number" && typeof editingConf.lng === "number";
  const candidateGuests = hasCoords
    ? (guests || []).filter(g => g.groomUid === editingConf.groomUid)
    : [];

  const close = () => setEditingConf(null);
  const save = () => {
    if (!name.trim() || !phone.trim()) return;
    saveConfirmationEdit(editingConf.id, {
      submittedName:  name.trim(),
      submittedPhone: phone.trim(),
      submittedCity:  city.trim(),
    });
  };
  const attach = async () => {
    if (!pickGuestId || attaching) return;
    setAttaching(true);
    try {
      await attachConfirmationToGuest(editingConf.id, pickGuestId);
      setEditingConf(null);
    } finally { setAttaching(false); }
  };

  return (
    <div onClick={close} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.78)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 20, animation: "fadeIn .25s ease",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        maxWidth: 460, width: "100%",
        background: "#0c0c11", border: "1px solid rgba(201,168,76,.3)",
        borderRadius: 18, padding: 24, animation: "slideUp .3s ease",
        maxHeight: "92vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ color: C.gold, fontWeight: 900, fontSize: 18, fontFamily: "'Amiri',serif" }}>
            {t("admin_conf_edit")}
          </div>
          <button onClick={close} style={{
            background: "none", border: "none", color: C.dim, fontSize: 22,
            cursor: "pointer", padding: 0, lineHeight: 1,
          }}>×</button>
        </div>

        <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("field_name")}</div>
        <input className="input-field" type="text"
               value={name} onChange={e => setName(e.target.value)}
               style={{ marginBottom: 12 }}/>

        <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("field_phone")}</div>
        <input className="input-field" type="tel" inputMode="tel" maxLength={30}
               value={phone}
               onChange={e => setPhone(e.target.value)}
               style={{ marginBottom: 12, direction: "ltr", textAlign: "right" }}/>

        <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>
          {t("field_address")} <span style={{ color: "#5a5040", fontWeight: 400 }}>{t("field_address_optional")}</span>
        </div>
        <input className="input-field" type="text"
               value={city} onChange={e => setCity(e.target.value)}
               style={{ marginBottom: 20 }}/>

        {/* Attach location to guest — only when the confirmation carries coords */}
        {hasCoords && (
          <div style={{
            marginBottom: 20, padding: 14, borderRadius: 12,
            background: "rgba(75,159,212,.06)", border: "1px solid rgba(75,159,212,.22)",
          }}>
            <div style={{ fontSize: 12, color: C.blue, fontWeight: 800, marginBottom: 8 }}>
              📍 {t("admin_conf_attach_title")}
              {editingConf.attachedGuestId && (
                <span style={{
                  marginInlineStart: 8, fontSize: 10, padding: "2px 8px", borderRadius: 10,
                  background: "rgba(76,201,122,.18)", color: "#4cc97a",
                }}>{t("admin_conf_attach_done")}</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 10, lineHeight: 1.7 }}>
              {t("admin_conf_attach_hint")}
            </div>
            <select className="input-field" value={pickGuestId}
                    onChange={e => setPickGuestId(e.target.value)}
                    style={{ marginBottom: 10, fontSize: 13 }}>
              <option value="">{t("admin_conf_attach_pick")}</option>
              {candidateGuests.map(g => (
                <option key={g.id} value={g.id}>
                  {g.name} — {g.phone}{g.area ? ` · ${g.area}` : ""}
                </option>
              ))}
            </select>
            <button onClick={attach} disabled={!pickGuestId || attaching} style={{
              width: "100%", padding: "10px 0", borderRadius: 10, border: "none",
              background: pickGuestId
                ? "linear-gradient(135deg,#4b9fd4,#3a7fb0)" : "rgba(255,255,255,.05)",
              color: pickGuestId ? "#fff" : "#5a5040",
              fontSize: 13, fontWeight: 800, fontFamily: "inherit",
              cursor: pickGuestId && !attaching ? "pointer" : "not-allowed",
            }}>
              {attaching ? "…" : t("admin_conf_attach_btn")}
            </button>
          </div>
        )}

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
