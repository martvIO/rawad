// Login screen — shown until the user authenticates.
// زرّ «استعادة كلمة المرور عبر SMS» أُزيل لأنّ كثيراً من المستخدمين بدون
// أرقام هواتف؛ تُعاد كلمة المرور للمستخدم من قِبل الأدمن عبر صفحة إدارة
// الحسابات (زرّ ✎ تعديل → كلمة مرور جديدة).
import { BrandLogo } from "../../components/BrandLogo.jsx";
import { LangSwitcher } from "../../components/LangSwitcher.jsx";
import { usePortal } from "../../context/PortalContext.jsx";
import { C } from "../../styles/theme.js";

export function LoginScreen() {
  const {
    onBack, t, lang, setLang,
    loginUser, setLoginUser, loginPass, setLoginPass,
    loginError, setLoginError, handleLogin, loginLoading,
  } = usePortal();
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 400, animation: "fadeUp .4s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <button data-testid="btn-login-back" onClick={onBack} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 13 }}>
            {t("login_back")}
          </button>
          <LangSwitcher lang={lang} setLang={setLang} />
        </div>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <BrandLogo size={62} />
          </div>
          <h1 style={{ fontFamily: "'Amiri','Frank Ruhl Libre',serif", color: C.gold, fontSize: 26, marginBottom: 6 }}>{t("login_title")}</h1>
          <p style={{ color: C.dim, fontSize: 13 }}>{t("login_subtitle")}</p>
        </div>
        <div className="gold-card" style={{ padding: 28 }}>
          <div style={{ marginBottom: 10, fontSize: 13, color: C.goldDim }}>{t("login_user")}</div>
          <input data-testid="field-login-user" className="input-field" type="text" placeholder={t("login_user")}
                 aria-label={t("login_user")} autoComplete="username"
                 value={loginUser} onChange={e => { setLoginUser(e.target.value); setLoginError(""); }}
                 style={{ marginBottom: 14 }}/>
          <div style={{ marginBottom: 10, fontSize: 13, color: C.goldDim }}>{t("login_pass")}</div>
          <input data-testid="field-login-pass" className="input-field" type="password" placeholder="••••••"
                 aria-label={t("login_pass")} autoComplete="current-password"
                 value={loginPass} onChange={e => { setLoginPass(e.target.value); setLoginError(""); }}
                 onKeyDown={e => e.key === "Enter" && !loginLoading && handleLogin()}
                 style={{ marginBottom: 12 }}/>
          {loginError && <div data-testid="alert-login-error" style={{ color: C.red, fontSize: 12, marginBottom: 12 }}>{loginError}</div>}
          <button data-testid="btn-login-submit" className="gold-btn" style={{ width: "100%" }}
                  onClick={handleLogin} disabled={loginLoading}>
            {loginLoading ? <span className="spinner" /> : t("login_submit")}
          </button>
          <div style={{ marginTop: 18, padding: "12px 14px", borderRadius: 10,
            background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)",
            textAlign: "center", color: C.dim, fontSize: 12, lineHeight: 1.9 }}>
            {t("login_hint")}
          </div>
        </div>
      </div>
    </div>
  );
}
