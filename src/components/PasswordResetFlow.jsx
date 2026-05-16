// Three-step password reset: phone → SMS code → new password.
// Uses Firebase Phone Auth on steps 1–2 and the `resetPassword` Cloud
// Function on step 3 (server-side verifies that the phone-OTP session
// matches the target portal user's stored phoneE164).
import { useState, useRef, useEffect, useMemo } from "react";
import { sendPasswordResetCode, confirmPasswordResetCode, signOutNow } from "../services/auth.js";
import { callResetPassword } from "../services/users.js";
import { PasswordRules } from "./PasswordRules.jsx";
import { PhoneInput } from "./PhoneInput.jsx";
import { isStrongPassword } from "../utils/password.js";
import { makeT } from "../i18n/index.js";

const STRINGS = {
  ar: {
    title: "استعادة كلمة المرور",
    step1_label: "رقم الهاتف (مع رمز الدولة)",
    step1_placeholder: "+972501234567",
    step1_submit: "إرسال رمز التحقق",
    step2_label: "رمز التحقق المرسل بالرسالة",
    step2_placeholder: "123456",
    step2_submit: "تأكيد الرمز",
    step3_label: "كلمة المرور الجديدة",
    step3_placeholder: "٨ أحرف على الأقل",
    step3_submit: "تحديث كلمة المرور",
    success: "✓ تم تحديث كلمة المرور — يمكنك تسجيل الدخول الآن",
    invalid_phone: "رقم هاتف غير صالح (الصيغة E.164 مثل ‎+972…)",
    invalid_code: "رمز التحقق غير صحيح",
    invalid_password: "كلمة المرور يجب أن تكون ٨ أحرف على الأقل",
    close: "إغلاق",
    back: "← رجوع",
  },
  he: {
    title: "איפוס סיסמה",
    step1_label: "מספר טלפון (כולל קידומת מדינה)",
    step1_placeholder: "+972501234567",
    step1_submit: "שלח קוד אימות",
    step2_label: "קוד שנשלח ב-SMS",
    step2_placeholder: "123456",
    step2_submit: "אישור הקוד",
    step3_label: "סיסמה חדשה",
    step3_placeholder: "לפחות 8 תווים",
    step3_submit: "עדכן סיסמה",
    success: "✓ הסיסמה עודכנה — תוכל להתחבר עכשיו",
    invalid_phone: "מספר טלפון לא תקין (פורמט E.164, למשל ‎+972…)",
    invalid_code: "קוד שגוי",
    invalid_password: "הסיסמה חייבת להיות לפחות 8 תווים",
    close: "סגירה",
    back: "← חזרה",
  },
};
const tr = (lang, key) => (STRINGS[lang] || STRINGS.ar)[key] || STRINGS.ar[key] || key;

export function PasswordResetFlow({ lang, onClose }) {
  const T = (k) => tr(lang, k);
  const tGlobal = useMemo(() => makeT(lang), [lang]);
  const [step, setStep]   = useState(1);
  const [phone, setPhone] = useState("");
  const [code, setCode]   = useState("");
  const [pass, setPass]   = useState("");
  const [error, setError] = useState("");
  const [busy,  setBusy]  = useState(false);
  const confirmationRef = useRef(null);
  const captchaContainerId = "dawa-reset-recaptcha";

  // Sign out any lingering phone-auth user when the modal unmounts so it
  // never leaks into the portal session.
  useEffect(() => () => { signOutNow().catch(() => {}); }, []);

  const sendCode = async () => {
    setError("");
    if (!/^\+[1-9][0-9]{6,14}$/.test(phone.trim())) {
      setError(T("invalid_phone")); return;
    }
    setBusy(true);
    try {
      confirmationRef.current = await sendPasswordResetCode(phone.trim(), captchaContainerId);
      setStep(2);
    } catch (e) {
      setError(e?.message || T("invalid_phone"));
    } finally { setBusy(false); }
  };

  const verifyCode = async () => {
    setError("");
    if (!code.trim()) { setError(T("invalid_code")); return; }
    setBusy(true);
    try {
      await confirmPasswordResetCode(confirmationRef.current, code.trim());
      setStep(3);
    } catch (e) {
      setError(e?.message || T("invalid_code"));
    } finally { setBusy(false); }
  };

  const updatePassword = async () => {
    setError("");
    if (!isStrongPassword(pass)) { setError(tGlobal("pwd_weak")); return; }
    setBusy(true);
    try {
      await callResetPassword(pass);
      setStep(4);
    } catch (e) {
      setError(e?.message || tGlobal("pwd_weak"));
    } finally { setBusy(false); }
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.78)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1500, padding: 20, animation: "fadeIn .25s ease",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        maxWidth: 420, width: "100%",
        background: "#0c0c11", border: "1px solid rgba(201,168,76,.3)",
        borderRadius: 18, padding: 28, animation: "slideUp .3s ease",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ color: "#c9a84c", fontWeight: 900, fontSize: 18, fontFamily: "'Amiri',serif" }}>
            {T("title")}
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "#7a6a4a", fontSize: 22,
            cursor: "pointer", padding: 0, lineHeight: 1,
          }}>×</button>
        </div>

        {step === 1 && (
          <>
            <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{T("step1_label")}</div>
            <div style={{ marginBottom: 12 }}>
              <PhoneInput value={phone} onChange={(v) => { setPhone(v); setError(""); }} t={tGlobal} lang={lang} autoFocus />
            </div>
            {error && <div style={{ color: "#d47a4b", fontSize: 12, marginBottom: 10 }}>{error}</div>}
            <button className="gold-btn" style={{ width: "100%" }} disabled={busy || !phone} onClick={sendCode}>
              {T("step1_submit")}
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{T("step2_label")}</div>
            <input className="input-field" type="tel" inputMode="numeric" placeholder={T("step2_placeholder")}
                   value={code} onChange={e => { setCode(e.target.value.replace(/[^\d]/g, "")); setError(""); }}
                   style={{ marginBottom: 12, direction: "ltr", textAlign: "right" }}/>
            {error && <div style={{ color: "#d47a4b", fontSize: 12, marginBottom: 10 }}>{error}</div>}
            <button className="gold-btn" style={{ width: "100%" }} disabled={busy} onClick={verifyCode}>
              {T("step2_submit")}
            </button>
            <button className="ghost-btn" style={{ width: "100%", marginTop: 8 }} onClick={() => setStep(1)}>
              {T("back")}
            </button>
          </>
        )}

        {step === 3 && (
          <>
            <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{T("step3_label")}</div>
            <input className="input-field" type="password" placeholder={T("step3_placeholder")}
                   value={pass} onChange={e => { setPass(e.target.value); setError(""); }}
                   style={{ marginBottom: 10 }}/>
            <PasswordRules password={pass} t={tGlobal} />
            {error && <div style={{ color: "#d47a4b", fontSize: 12, marginBottom: 10 }}>{error}</div>}
            <button className="gold-btn" style={{ width: "100%" }}
                    disabled={busy || !isStrongPassword(pass)} onClick={updatePassword}>
              {T("step3_submit")}
            </button>
          </>
        )}

        {step === 4 && (
          <>
            <div style={{ color: "#4cc97a", fontSize: 14, fontWeight: 800, textAlign: "center", margin: "12px 0 18px" }}>
              {T("success")}
            </div>
            <button className="gold-btn" style={{ width: "100%" }} onClick={onClose}>
              {T("close")}
            </button>
          </>
        )}

        {/* Invisible reCAPTCHA mounts here on step 1. */}
        <div id={captchaContainerId} style={{ marginTop: 16 }} />
      </div>
    </div>
  );
}
