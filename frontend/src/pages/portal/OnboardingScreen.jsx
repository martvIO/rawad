// First-sign-in onboarding for a groom (the couple). Rendered by PortalRouter
// whenever the signed-in groom has no `onboardedAt` yet — blocks the portal until
// the couple enters their names. The names (+ optional wedding date) are stored on
// the account and pre-seed the first digital-invitation design, so Step 1 of the
// design wizard is effectively already done. Mirrors PasswordChangeScreen.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePortal } from "../../context/PortalContext.jsx";
import { BrandLogo } from "../../components/BrandLogo.jsx";
import { LangSwitcher } from "../../components/LangSwitcher.jsx";
import { submitOnboarding } from "../../services/auth.js";
import { logErr } from "../../utils/logger.js";
import { C } from "../../styles/theme.js";

const tt = (lang, ar, he) => (lang === "he" ? he : ar);

export function OnboardingScreen() {
  const { lang, setLang, markOnboarded } = usePortal();
  const navigate = useNavigate();
  const [groomName, setGroomName] = useState("");
  const [brideName, setBrideName] = useState("");
  const [weddingDate, setWeddingDate] = useState(""); // datetime-local string
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const canSubmit = groomName.trim().length > 0 && brideName.trim().length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) {
      setError(tt(lang, "الرجاء إدخال اسمَي العروسين.", "יש להזין את שמות החתן והכלה."));
      return;
    }
    setError("");
    setBusy(true);
    try {
      const ms = weddingDate ? new Date(weddingDate).getTime() : null;
      await submitOnboarding({
        groomName: groomName.trim(),
        brideName: brideName.trim(),
        weddingDate: Number.isFinite(ms) ? ms : null,
      });
      // Flip the local gate immediately (optimistic) so the portal opens without
      // waiting for the next /auth/me poll to echo onboardedAt back.
      markOnboarded();
      navigate("/portal/groom", { replace: true });
    } catch (err) {
      logErr("submitOnboarding", err);
      setError(tt(lang, "تعذّر الحفظ، حاول مرة أخرى.", "השמירה נכשלה, נסו שוב."));
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
          <h1 style={{ fontFamily: "'Amiri','Frank Ruhl Libre','Amiri Fallback',serif", color: C.gold, fontSize: 24, marginBottom: 8 }}>
            {tt(lang, "أهلاً بكم 💛", "ברוכים הבאים 💛")}
          </h1>
          <p style={{ color: "rgba(245,230,184,.78)", fontSize: 13, lineHeight: 1.8, maxWidth: 380, margin: "0 auto" }}>
            {tt(
              lang,
              "قبل أن نبدأ، أخبرونا بأسماء العروسين لنجهّز دعوتكم الرقمية تلقائياً.",
              "לפני שמתחילים, ספרו לנו את שמות החתן והכלה כדי שנכין את ההזמנה הדיגיטלית אוטומטית.",
            )}
          </p>
        </div>

        <div className="gold-card">
          <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{tt(lang, "اسم العريس *", "שם החתן *")}</div>
          <input data-testid="field-onb-groom" className="input-field" type="text" maxLength={120}
                 value={groomName} onChange={(e) => setGroomName(e.target.value)}
                 placeholder={tt(lang, "مثال: أحمد", "למשל: אחמד")} disabled={busy}
                 style={{ marginBottom: 14 }} />

          <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{tt(lang, "اسم العروس *", "שם הכלה *")}</div>
          <input data-testid="field-onb-bride" className="input-field" type="text" maxLength={120}
                 value={brideName} onChange={(e) => setBrideName(e.target.value)}
                 placeholder={tt(lang, "مثال: سارة", "למשל: שרה")} disabled={busy}
                 style={{ marginBottom: 14 }} />

          <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{tt(lang, "تاريخ الزفاف (اختياري)", "תאריך החתונה (אופציונלי)")}</div>
          <input data-testid="field-onb-date" className="input-field" type="datetime-local"
                 value={weddingDate} onChange={(e) => setWeddingDate(e.target.value)}
                 disabled={busy} style={{ marginBottom: 16, direction: "ltr" }} />

          {error && (
            <div data-testid="alert-onb-error" style={{ color: C.red, fontSize: 12, marginBottom: 12, textAlign: "center" }}>{error}</div>
          )}

          <button data-testid="btn-onb-submit" className="gold-btn" style={{ width: "100%" }} onClick={submit} disabled={!canSubmit}>
            {busy ? "…" : tt(lang, "متابعة →", "המשך →")}
          </button>
        </div>
      </div>
    </div>
  );
}
