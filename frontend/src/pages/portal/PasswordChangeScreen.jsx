// Forced first-login password change. Rendered by PortalRouter whenever the
// signed-in user carries `mustChangePassword` (an auto-provisioned groom logging
// in with the generated password). Blocks every role dashboard until the
// password is changed. Also usable as a generic self-service change screen.
//
// On success the backend revokes refresh tokens, so we sign the user out and
// send them back to /portal/login to re-authenticate with the new password.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePortal } from "../../context/PortalContext.jsx";
import { BrandLogo } from "../../components/BrandLogo.jsx";
import { LangSwitcher } from "../../components/LangSwitcher.jsx";
import { PasswordRules } from "../../components/PasswordRules.jsx";
import { isStrongPassword } from "../../utils/password.js";
import { changePassword, signOutNow } from "../../services/auth.js";
import { logErr } from "../../utils/logger.js";
import { C } from "../../styles/theme.js";

export function PasswordChangeScreen() {
  const { t, lang, setLang, applySignedOut } = usePortal();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const strong = isStrongPassword(next);
  const matches = next.length > 0 && next === confirm;
  const canSubmit = current.length > 0 && strong && matches && !busy;

  const submit = async () => {
    if (!canSubmit) {
      if (!matches) setError(t("pwch_mismatch"));
      else if (!strong) setError(t("pwch_weak"));
      return;
    }
    setError("");
    setBusy(true);
    try {
      await changePassword(current, next);
      // Tokens were revoked server-side — sign out cleanly and route to login.
      // applySignedOut() drops the local authUser (which still carries
      // mustChangePassword) immediately so the gate flips to LoginScreen now,
      // instead of waiting up to ~30s for the next /auth/me poll to 401.
      await signOutNow();
      applySignedOut();
      navigate("/portal/login", { replace: true });
    } catch (err) {
      logErr("changePassword", err);
      const code = err?.body?.error || "";
      if (code === "invalid_credentials") setError(t("pwch_wrong_current"));
      else if (code === "password_unchanged") setError(t("pwch_unchanged"));
      else if (code === "weak_password") setError(t("pwch_weak"));
      else setError(t("pay_error_generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", padding: "24px 16px" }}>
      <div style={{ maxWidth: 440, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <LangSwitcher lang={lang} setLang={setLang} />
        </div>

        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
            <BrandLogo size={60} />
          </div>
          <h1 style={{ fontFamily: "'Amiri','Frank Ruhl Libre',serif", color: C.gold, fontSize: 24, marginBottom: 8 }}>
            {t("pwch_title")}
          </h1>
          <p style={{ color: "rgba(245,230,184,.78)", fontSize: 13, lineHeight: 1.8, maxWidth: 380, margin: "0 auto" }}>
            {t("pwch_subtitle")}
          </p>
        </div>

        <div className="gold-card">
          <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("pwch_current")} *</div>
          <input data-testid="field-pwch-current" className="input-field" type="password" autoComplete="current-password"
                 value={current} onChange={(e) => setCurrent(e.target.value)}
                 placeholder="••••••••" disabled={busy}
                 style={{ marginBottom: 14, direction: "ltr", textAlign: "left" }} />

          <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("pwch_new")} *</div>
          <input data-testid="field-pwch-new" className="input-field" type="password" autoComplete="new-password"
                 value={next} onChange={(e) => setNext(e.target.value)}
                 placeholder="••••••••" disabled={busy}
                 style={{ marginBottom: next ? 8 : 14, direction: "ltr", textAlign: "left" }} />
          {next.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <PasswordRules password={next} t={t} compact />
            </div>
          )}

          <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("pwch_confirm")} *</div>
          <input data-testid="field-pwch-confirm" className="input-field" type="password" autoComplete="new-password"
                 value={confirm} onChange={(e) => setConfirm(e.target.value)}
                 placeholder="••••••••" disabled={busy}
                 style={{ marginBottom: 14, direction: "ltr", textAlign: "left" }} />

          {error && (
            <div data-testid="alert-pwch-error" style={{ color: C.red, fontSize: 12, marginBottom: 12, textAlign: "center" }}>{error}</div>
          )}

          <button data-testid="btn-pwch-submit" className="gold-btn" style={{ width: "100%" }} onClick={submit} disabled={!canSubmit}>
            {busy ? "…" : t("pwch_submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
