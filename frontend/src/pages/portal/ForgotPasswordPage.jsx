// Forgot-password page — self-service reset via SMS verification code.
// Route: /portal/forgot-password (reachable while signed out).
//
// Single page, three internal steps: request → verify → reset → done.
//   1. request: username + phone (+ reCAPTCHA v2). The server checks the pair
//      matches a real account BEFORE sending an SMS (account_phone_mismatch),
//      so phone-less users are steered to the admin instead of an SMS.
//   2. verify:  the SMS code → mints a phone-auth session (token stored by
//      confirmPasswordResetCode so the next call is authenticated).
//   3. reset:   new password (+ confirm, live rules) → callResetPassword.
//
// Design mirrors LoginScreen's centered gold-card, dressed up with the landing
// page's gold-gradient title. reCAPTCHA wiring is copied from PeopleGallery.jsx.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BrandLogo } from "../../components/BrandLogo.jsx";
import { LangSwitcher } from "../../components/LangSwitcher.jsx";
import { PhoneInput, isCompletePhone } from "../../components/PhoneInput.jsx";
import { PasswordRules } from "../../components/PasswordRules.jsx";
import { usePortal } from "../../context/PortalContext.jsx";
import {
  sendPasswordResetCode,
  confirmPasswordResetCode,
  callResetPassword,
} from "../../services/auth.js";
import { isStrongPassword } from "../../utils/password.js";
import { clearTokens } from "../../utils/tokenManager.js";
import { C } from "../../styles/theme.js";

const SITE_KEY = import.meta.env.VITE_RECAPTCHA_V2_SITE_KEY || "";
const RESEND_COOLDOWN_S = 30;
const STEPS = ["request", "verify", "reset"];

// Show only the last 3 digits of an E.164 number, e.g. "•••• 567".
function maskPhone(e164) {
  const tail = (e164 || "").replace(/\D/g, "").slice(-3);
  return tail ? "•••• " + tail : "";
}

export function ForgotPasswordPage() {
  const { t, lang, setLang } = usePortal();
  const navigate = useNavigate();

  const [step, setStep] = useState("request");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [sessionInfo, setSessionInfo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const recaptchaElRef = useRef(null);
  const widgetIdRef = useRef(null);

  // Map a backend ApiError to a user-facing message. `account_phone_mismatch`
  // is deliberately generic (covers both "no such user" and "wrong phone").
  const mapError = (err, fallbackKey) => {
    const codeStr = err?.body?.error;
    if (err?.status === 429 || codeStr === "too_many_requests") return t("fr_err_rate");
    if (
      codeStr === "account_phone_mismatch" ||
      codeStr === "no_account_for_phone" ||
      codeStr === "phone_does_not_match_account"
    )
      return t("fr_err_mismatch");
    // The phone-auth session expired between verify and reset — the user must
    // request a fresh code, so point them back rather than show a dead-end.
    if (codeStr === "phone_verified_session_required") return t("fr_err_session_expired");
    if (codeStr === "verify_failed") return t("fr_err_code");
    if (codeStr === "weak_password") return t("pwd_weak");
    return t(fallbackKey);
  };

  // Render the reCAPTCHA widget whenever we're on the request step. The cleanup
  // nulls the widget id so re-entering the step (e.g. via "resend") mounts a
  // fresh widget into the new DOM node instead of silently skipping render.
  useEffect(() => {
    if (step !== "request" || !SITE_KEY) return undefined;
    let cancelled = false;
    const render = () => {
      if (cancelled || !window.grecaptcha || !recaptchaElRef.current || widgetIdRef.current != null) return;
      try {
        window.grecaptcha.ready(() => {
          if (!cancelled && widgetIdRef.current == null && recaptchaElRef.current) {
            widgetIdRef.current = window.grecaptcha.render(recaptchaElRef.current, { sitekey: SITE_KEY });
          }
        });
      } catch { /* already rendered */ }
    };
    if (window.grecaptcha) {
      render();
    } else {
      const existing = document.getElementById("dawa-recaptcha");
      if (existing) {
        existing.addEventListener("load", render);
      } else {
        const s = document.createElement("script");
        s.id = "dawa-recaptcha";
        s.src = "https://www.google.com/recaptcha/api.js?render=explicit";
        s.async = true; s.defer = true; s.onload = render;
        document.head.appendChild(s);
      }
    }
    return () => { cancelled = true; widgetIdRef.current = null; };
  }, [step]);

  // Tick down the resend cooldown.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  // After a successful reset, bounce to login (tokens were revoked server-side).
  useEffect(() => {
    if (step !== "done") return undefined;
    const id = setTimeout(() => navigate("/portal/login"), 4000);
    return () => clearTimeout(id);
  }, [step, navigate]);

  const canSend = !busy && cooldown <= 0 && username.trim() && isCompletePhone(phone);
  const canReset = !busy && isStrongPassword(pw1) && pw1 === pw2;

  const doSend = async () => {
    if (!canSend) return;
    // getResponse() throws if the widget hasn't rendered yet (fast click) or the
    // id is stale — treat any throw as "no token" so we fall through to the guard.
    let recaptchaToken = "";
    try {
      recaptchaToken =
        SITE_KEY && window.grecaptcha ? window.grecaptcha.getResponse(widgetIdRef.current ?? undefined) : "";
    } catch {
      recaptchaToken = "";
    }
    if (SITE_KEY && !recaptchaToken) { setError(t("fr_err_recaptcha")); return; }
    setBusy(true); setError("");
    try {
      const r = await sendPasswordResetCode(username.trim(), phone, recaptchaToken);
      setSessionInfo(r.sessionInfo);
      setCode("");
      setStep("verify");
      setCooldown(RESEND_COOLDOWN_S);
    } catch (err) {
      setError(mapError(err, "fr_err_send"));
    } finally {
      // A v2 token is single-use; clear the checkbox so any retry forces a fresh solve.
      try { window.grecaptcha?.reset(widgetIdRef.current ?? undefined); } catch { /* */ }
      setBusy(false);
    }
  };

  const doVerify = async () => {
    if (busy || !code.trim()) return;
    setBusy(true); setError("");
    try {
      await confirmPasswordResetCode({ sessionInfo }, code.trim());
      setStep("reset");
    } catch (err) {
      setError(mapError(err, "fr_err_code"));
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    if (!canReset) return;
    setBusy(true); setError("");
    try {
      await callResetPassword(pw1);
      // The phone-auth session is spent now (reset-password revoked its refresh
      // tokens); drop it from storage so no dead token lingers or fires a doomed
      // background refresh after we land on the login screen.
      clearTokens();
      setStep("done");
    } catch (err) {
      setError(mapError(err, "fr_err_generic"));
    } finally {
      setBusy(false);
    }
  };

  const labelStyle = { marginBottom: 10, fontSize: 13, color: C.goldDim };
  const activeIdx = step === "done" ? STEPS.length : STEPS.indexOf(step);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 400, animation: "fadeUp .4s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <button data-testid="btn-fr-back" onClick={() => navigate("/portal/login")}
                  style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 13 }}>
            {t("login_back")}
          </button>
          <LangSwitcher lang={lang} setLang={setLang} />
        </div>

        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <BrandLogo size={62} />
          </div>
          <h1 style={{
            fontFamily: "'Amiri','Frank Ruhl Libre',serif", fontSize: 26, marginBottom: 6,
            background: "linear-gradient(135deg,#fff3c0 0%,#f0c84c 35%,#c9a84c 70%,#a0832c 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>{t("fr_title")}</h1>
          <p style={{ color: C.dim, fontSize: 13 }}>{t("fr_subtitle")}</p>
        </div>

        {/* Step indicator 1-2-3 (bars are decorative; the sr-only line announces progress) */}
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 18 }}>
          {STEPS.map((s, i) => (
            <span key={s} aria-hidden style={{
              width: 26, height: 4, borderRadius: 999,
              background: i <= activeIdx ? C.gold : "rgba(255,255,255,.12)",
              transition: "background .25s ease",
            }} />
          ))}
        </div>
        {step !== "done" && (
          <span aria-live="polite" style={{
            position: "absolute", width: 1, height: 1, padding: 0, margin: -1,
            overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0,
          }}>
            {`${t("fr_step")} ${activeIdx + 1} / ${STEPS.length}`}
          </span>
        )}

        <div className="gold-card" style={{ padding: 28 }}>
          {step === "request" && (
            <>
              <div style={labelStyle}>{t("login_user")}</div>
              <input data-testid="field-fr-user" className="input-field" type="text"
                     placeholder={t("login_user")} aria-label={t("login_user")} autoComplete="username" autoFocus
                     value={username} onChange={(e) => { setUsername(e.target.value); setError(""); }}
                     style={{ marginBottom: 14 }} />
              <div style={labelStyle}>{t("fr_phone")}</div>
              <div style={{ marginBottom: 14 }}>
                <PhoneInput value={phone} onChange={(v) => { setPhone(v); setError(""); }} t={t} lang={lang}
                            inputId="fr-phone" hasError={!!phone && !isCompletePhone(phone)} />
              </div>
              {SITE_KEY
                ? <div ref={recaptchaElRef} style={{ display: "flex", justifyContent: "center", margin: "4px 0 12px" }} />
                : <div style={{ fontSize: 11, color: C.dim, textAlign: "center", margin: "4px 0 12px" }}>{t("fr_recaptcha_missing")}</div>}
              {error && <div data-testid="alert-fr-error" role="alert" aria-live="assertive" style={{ color: C.red, fontSize: 12, marginBottom: 12, lineHeight: 1.7 }}>{error}</div>}
              <button data-testid="btn-fr-send" className="gold-btn" style={{ width: "100%" }} onClick={doSend} disabled={!canSend}>
                {busy ? <span className="spinner" /> : (cooldown > 0 ? `${t("fr_resend_in")} ${cooldown}` : t("fr_send"))}
              </button>
            </>
          )}

          {step === "verify" && (
            <>
              <div style={{ textAlign: "center", color: C.dim, fontSize: 13, marginBottom: 16, lineHeight: 1.7 }}>
                {t("fr_code_sent")} <span style={{ direction: "ltr", display: "inline-block", color: C.goldDim }}>{maskPhone(phone)}</span>
              </div>
              <div style={labelStyle}>{t("fr_code_label")}</div>
              <input data-testid="field-fr-code" className="input-field" type="text" inputMode="numeric"
                     placeholder="123456" aria-label={t("fr_code_label")} autoComplete="one-time-code" autoFocus
                     value={code} onChange={(e) => { setCode(e.target.value); setError(""); }}
                     onKeyDown={(e) => e.key === "Enter" && doVerify()}
                     style={{ marginBottom: 14, textAlign: "center", letterSpacing: 6, fontSize: 20, direction: "ltr" }} />
              {error && <div data-testid="alert-fr-error" role="alert" aria-live="assertive" style={{ color: C.red, fontSize: 12, marginBottom: 12, lineHeight: 1.7 }}>{error}</div>}
              <button data-testid="btn-fr-verify" className="gold-btn" style={{ width: "100%" }} onClick={doVerify} disabled={busy || !code.trim()}>
                {busy ? <span className="spinner" /> : t("fr_verify")}
              </button>
              <button data-testid="btn-fr-resend"
                      onClick={() => { if (cooldown <= 0) { setError(""); setStep("request"); } }}
                      disabled={cooldown > 0}
                      style={{ background: "none", border: "none", width: "100%", marginTop: 14,
                        color: cooldown > 0 ? C.dim : C.gold, cursor: cooldown > 0 ? "default" : "pointer", fontSize: 12 }}>
                {cooldown > 0 ? `${t("fr_resend_in")} ${cooldown}` : t("fr_resend")}
              </button>
            </>
          )}

          {step === "reset" && (
            <>
              <div style={labelStyle}>{t("fr_newpass")}</div>
              <input data-testid="field-fr-pw1" className="input-field" type="password" placeholder="••••••"
                     aria-label={t("fr_newpass")} autoComplete="new-password" autoFocus
                     value={pw1} onChange={(e) => { setPw1(e.target.value); setError(""); }}
                     style={{ marginBottom: 14 }} />
              <PasswordRules password={pw1} t={t} compact />
              <div style={labelStyle}>{t("fr_confirmpass")}</div>
              <input data-testid="field-fr-pw2" className="input-field" type="password" placeholder="••••••"
                     aria-label={t("fr_confirmpass")} autoComplete="new-password"
                     value={pw2} onChange={(e) => { setPw2(e.target.value); setError(""); }}
                     onKeyDown={(e) => e.key === "Enter" && doReset()}
                     style={{ marginBottom: 8 }} />
              {pw2 && pw1 !== pw2 && <div role="alert" aria-live="assertive" style={{ color: C.red, fontSize: 12, marginBottom: 12 }}>{t("fr_mismatch_pw")}</div>}
              {error && <div data-testid="alert-fr-error" role="alert" aria-live="assertive" style={{ color: C.red, fontSize: 12, margin: "4px 0 12px", lineHeight: 1.7 }}>{error}</div>}
              <button data-testid="btn-fr-reset" className="gold-btn" style={{ width: "100%", marginTop: 6 }} onClick={doReset} disabled={!canReset}>
                {busy ? <span className="spinner" /> : t("fr_reset_btn")}
              </button>
            </>
          )}

          {step === "done" && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 44, marginBottom: 10 }}>✅</div>
              <div style={{ color: C.gold, fontWeight: 800, fontSize: 16, marginBottom: 8 }}>{t("fr_success_title")}</div>
              <div style={{ color: C.dim, fontSize: 13, lineHeight: 1.8, marginBottom: 18 }}>{t("fr_success_body")}</div>
              <button data-testid="btn-fr-to-login" className="gold-btn" style={{ width: "100%" }} onClick={() => navigate("/portal/login")}>
                {t("fr_to_login")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
