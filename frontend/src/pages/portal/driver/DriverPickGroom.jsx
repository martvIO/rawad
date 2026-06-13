// Driver gate — the distributor must choose which groom they are delivering for.
import { LangSwitcher } from "../../../components/LangSwitcher.jsx";
import { LogoutConfirm } from "../../../components/LogoutConfirm.jsx";
import { usePortal } from "../../../context/PortalContext.jsx";
import { C } from "../../../styles/theme.js";

export function DriverPickGroom() {
  const {
    t, lang, setLang, doLogout,
    driverGroomInput, setDriverGroomInput, driverGroomError, setDriverGroomError,
    submitDriverGroom, logoutAsking, setLogoutAsking,
  } = usePortal();
  return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ width: "100%", maxWidth: 420, animation: "fadeUp .4s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <button onClick={() => setLogoutAsking(true)} style={{
                background: "rgba(212,80,58,.08)", border: "1px solid rgba(212,80,58,.3)",
                color: C.red, padding: "6px 12px", borderRadius: 8,
                fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}>↩ {t("logout")}</button>
              <LangSwitcher lang={lang} setLang={setLang} />
            </div>
            <div style={{ textAlign: "center", marginBottom: 22 }}>
              <div style={{ fontSize: 44, marginBottom: 10 }}>🚗</div>
              <h1 style={{ fontFamily: "'Amiri','Frank Ruhl Libre',serif", color: C.blue, fontSize: 24, marginBottom: 6 }}>
                {t("driver_pick_groom_title")}
              </h1>
              <p style={{ color: C.dim, fontSize: 13, lineHeight: 1.7, maxWidth: 360, margin: "0 auto" }}>
                {t("driver_pick_groom_subtitle")}
              </p>
            </div>
            <div className="gold-card" style={{ padding: 24,
              background: "rgba(75,159,212,.06)", border: "1px solid rgba(75,159,212,.22)" }}>
              <div style={{ marginBottom: 10, fontSize: 13, color: C.goldDim }}>{t("driver_pick_groom_field")}</div>
              <input data-testid="field-driver-pick-groom" className="input-field" type="text" placeholder="username"
                     value={driverGroomInput}
                     onChange={e => { setDriverGroomInput(e.target.value); setDriverGroomError(""); }}
                     onKeyDown={e => e.key === "Enter" && submitDriverGroom()}
                     style={{ marginBottom: 12, direction: "ltr", textAlign: "right" }}/>
              {driverGroomError && (
                <div data-testid="alert-driver-pick-error" style={{ color: C.red, fontSize: 12, marginBottom: 12 }}>{driverGroomError}</div>
              )}
              <button data-testid="btn-driver-pick-groom-submit" onClick={submitDriverGroom}
                      disabled={!driverGroomInput.trim()}
                      style={{
                        width: "100%", padding: 12, borderRadius: 10,
                        background: driverGroomInput.trim() ? "linear-gradient(135deg,#4b9fd4,#3a7fb0)" : "rgba(255,255,255,.05)",
                        color: driverGroomInput.trim() ? "#fff" : "#5a5040",
                        border: "none", fontWeight: 900, fontSize: 14, fontFamily: "inherit",
                        cursor: driverGroomInput.trim() ? "pointer" : "not-allowed",
                      }}>
                {t("driver_pick_groom_submit")}
              </button>
            </div>
          </div>
          {logoutAsking && <LogoutConfirm t={t} lang={lang} onConfirm={doLogout} onCancel={() => setLogoutAsking(false)}/>}
        </div>
  );
}
