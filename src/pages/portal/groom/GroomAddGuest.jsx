// Groom → Add: form to add a new guest to the list.
import { AddressInput } from "../../../components/AddressInput.jsx";
import { PhoneInput } from "../../../components/PhoneInput.jsx";
import { usePortal } from "../../../context/PortalContext.jsx";
import { C } from "../../../styles/theme.js";

export function GroomAddGuest() {
  const {
    t, lang, addGuest,
    gName, setGName, gPhone, setGPhone, gArea, setGArea, gType, setGType,
  } = usePortal();
  return (
          <div style={{ animation: "fadeUp .3s ease" }}>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 19, fontWeight: 900, color: C.gold, fontFamily: "'Amiri',serif", marginBottom: 4 }}>
                {t("add_title")}
              </div>
              <div style={{ fontSize: 12, color: C.dim }}>
                {t("add_subtitle")}
              </div>
            </div>

            <div className="gold-card" style={{ padding: 24 }}>
              <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("field_name")}</div>
              <input data-testid="field-guest-name" className="input-field" type="text" placeholder={t("example_name")}
                     aria-label={t("field_name")}
                     value={gName} onChange={e => setGName(e.target.value)}
                     style={{ marginBottom: 14 }}/>

              <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("field_phone")}</div>
              <div style={{ marginBottom: 14 }}>
                <PhoneInput value={gPhone} onChange={setGPhone} t={t} lang={lang} />
              </div>

              <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>
                {t("field_address")} <span style={{ color: "#5a5040", fontWeight: 400 }}>{t("field_address_optional")}</span>
              </div>
              <div data-testid="field-guest-area" style={{ marginBottom: 14 }}>
                <AddressInput value={gArea} onChange={setGArea}
                              placeholder={t("example_address")} lang={lang} t={t}/>
              </div>

              <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("field_invite_type")}</div>
              <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                {[
                  { val: "premium", lbl: t("type_premium"), color: C.gold },
                  { val: "vip",     lbl: t("type_vip"),     color: "#c084fc" },
                ].map(opt => (
                  <button key={opt.val} data-testid={`btn-guest-type-${opt.val}`} onClick={() => setGType(opt.val)} style={{
                    flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer",
                    background: gType===opt.val ? `${opt.color}22` : "rgba(255,255,255,.04)",
                    border: `1.5px solid ${gType===opt.val ? opt.color : "rgba(255,255,255,.08)"}`,
                    color: gType===opt.val ? opt.color : C.dim,
                    fontWeight: 800, fontSize: 13, fontFamily: "inherit", transition: "all .2s",
                  }}>{opt.lbl}</button>
                ))}
              </div>

              <button data-testid="btn-add-guest" className="gold-btn" style={{ width: "100%" }} onClick={addGuest}
                      disabled={!gName.trim() || !gPhone.trim()}>
                {t("add_submit")}
              </button>
            </div>

            <div style={{
              marginTop: 16, padding: 14, borderRadius: 12,
              background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)",
              fontSize: 12, color: C.dim, lineHeight: 1.8,
            }}>
              {t("add_tip")}
            </div>
          </div>
  );
}
