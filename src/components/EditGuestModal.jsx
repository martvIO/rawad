// Edit-guest modal — overlays every groom view. Renders nothing when no guest is being edited.
import { AddressInput } from "./AddressInput.jsx";
import { PhoneInput } from "./PhoneInput.jsx";
import { usePortal } from "../context/PortalContext.jsx";

export function EditGuestModal() {
  const {
    editingGuest, cancelEdit, saveEdit, t, lang,
    eName, setEName, ePhone, setEPhone, eArea, setEArea, eType, setEType,
  } = usePortal();
  if (!editingGuest) return null;
  return (
        <div onClick={cancelEdit} style={{
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
                {t("edit_title")}
              </div>
              <button onClick={cancelEdit} style={{
                background: "none", border: "none", color: "#7a6a4a", fontSize: 22,
                cursor: "pointer", padding: 0, lineHeight: 1,
              }}>×</button>
            </div>

            <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("field_name")}</div>
            <input className="input-field" type="text" placeholder={t("example_name")}
                   value={eName} onChange={e => setEName(e.target.value)}
                   style={{ marginBottom: 12 }}/>

            <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("field_phone")}</div>
            <div style={{ marginBottom: 12 }}>
              <PhoneInput value={ePhone} onChange={setEPhone} t={t} lang={lang} />
            </div>

            <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>
              {t("field_address")} <span style={{ color: "#5a5040", fontWeight: 400 }}>{t("field_address_optional")}</span>
            </div>
            <div style={{ marginBottom: 12 }}>
              <AddressInput value={eArea} onChange={setEArea}
                            placeholder={t("example_address")} lang={lang} t={t}/>
            </div>

            <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("field_invite_type")}</div>
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              {[
                { val: "premium", lbl: t("type_premium"), color: "#c9a84c" },
                { val: "vip",     lbl: t("type_vip"),     color: "#c084fc" },
              ].map(opt => (
                <button key={opt.val} onClick={() => setEType(opt.val)} style={{
                  flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer",
                  background: eType===opt.val ? `${opt.color}22` : "rgba(255,255,255,.04)",
                  border: `1.5px solid ${eType===opt.val ? opt.color : "rgba(255,255,255,.08)"}`,
                  color: eType===opt.val ? opt.color : "#7a6a4a",
                  fontWeight: 800, fontSize: 13, fontFamily: "inherit",
                }}>{opt.lbl}</button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button className="ghost-btn" style={{ flex: 1 }} onClick={cancelEdit}>
                {t("edit_cancel")}
              </button>
              <button className="gold-btn" style={{ flex: 1 }} onClick={saveEdit}
                      disabled={!eName.trim() || !ePhone.trim()}>
                {t("edit_save")}
              </button>
            </div>
          </div>
        </div>
  );
}
