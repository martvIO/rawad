// Login screen — shown until the user authenticates.
import { useState } from "react";
import { BrandLogo } from "../../components/BrandLogo.jsx";
import { LangSwitcher } from "../../components/LangSwitcher.jsx";
import { PasswordResetFlow } from "../../components/PasswordResetFlow.jsx";
import { usePortal } from "../../context/PortalContext.jsx";
import { C } from "../../styles/theme.js";

export function LoginScreen() {
  const {
    onBack, t, lang, setLang,
    loginUser, setLoginUser, loginPass, setLoginPass,
    loginError, setLoginError, handleLogin,
  } = usePortal();
  const [showReset, setShowReset] = useState(false);
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 400, animation: "fadeUp .4s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 13 }}>
            {t("login_back")}
          </button>
          <LangSwitcher lang={lang} setLang={setLang} />
        </div>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <BrandLogo size={62} />
          </div>
          <h1 style={{ fontFamily: "'Amiri',serif", color: C.gold, fontSize: 26, marginBottom: 6 }}>{t("login_title")}</h1>
          <p style={{ color: C.dim, fontSize: 13 }}>{t("login_subtitle")}</p>
        </div>
        <div className="gold-card" style={{ padding: 28 }}>
          <div style={{ marginBottom: 10, fontSize: 13, color: C.goldDim }}>{t("login_user")}</div>
          <input className="input-field" type="text" placeholder={t("login_user")}
                 value={loginUser} onChange={e => { setLoginUser(e.target.value); setLoginError(""); }}
                 style={{ marginBottom: 14 }}/>
          <div style={{ marginBottom: 10, fontSize: 13, color: C.goldDim }}>{t("login_pass")}</div>
          <input className="input-field" type="password" placeholder="••••••"
                 value={loginPass} onChange={e => { setLoginPass(e.target.value); setLoginError(""); }}
                 onKeyDown={e => e.key === "Enter" && handleLogin()}
                 style={{ marginBottom: 12 }}/>
          {loginError && <div style={{ color: C.red, fontSize: 12, marginBottom: 12 }}>{loginError}</div>}
          <button className="gold-btn" style={{ width: "100%" }} onClick={handleLogin}>
            {t("login_submit")}
          </button>
          <button onClick={() => setShowReset(true)} style={{
            marginTop: 12, width: "100%", background: "none", border: "none",
            color: C.gold, fontSize: 12, fontWeight: 700, cursor: "pointer",
            fontFamily: "inherit", padding: "4px 0",
          }}>
            {lang === "he" ? "שכחתי סיסמה — איפוס באמצעות SMS" : "نسيت كلمة المرور — استعادة عبر SMS"}
          </button>
          <div style={{ marginTop: 18, padding: "12px 14px", borderRadius: 10,
            background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)",
            textAlign: "center", color: C.dim, fontSize: 12, lineHeight: 1.9 }}>
            {t("login_hint")}
          </div>
        </div>
      </div>
      {showReset && <PasswordResetFlow lang={lang} onClose={() => setShowReset(false)} />}
    </div>
  );
}
