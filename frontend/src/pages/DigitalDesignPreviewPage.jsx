// Groom-facing DRAFT design preview — the target of the native app's WebView
// "design-preview" screen. The app injects the groom's tokens into this page's
// localStorage before load, so getStoredUid() + subscribeDesign() authenticate
// as the owner and we can render an as-yet-unapproved draft (which the public
// /d route would refuse). Renders the exact <DigitalInvitationView> the guest
// will see — its WebGL 3D envelope runs on the device GPU inside the WebView.
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { subscribeDesign } from "../services/digitalInvitation.js";
import { loadStoredTokens, getStoredUid } from "../utils/tokenManager.js";
import { TemplateRenderer } from "../components/digital/templates/TemplateRenderer.jsx";
import { C } from "../styles/theme.js";

export function DigitalDesignPreviewPage({ lang: appLang, setLang }) {
  const { designId } = useParams();
  const [params] = useSearchParams();
  const lang = params.get("lang") === "he" ? "he" : params.get("lang") === "ar" ? "ar" : appLang || "ar";

  const [design, setDesign] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    // Ensure tokens injected into localStorage by the WebView are in memory.
    try { loadStoredTokens(); } catch { /* noop */ }
    const uid = getStoredUid();
    if (!uid) { setError("no_session"); return undefined; }
    if (!designId) { setError("no_design"); return undefined; }
    return subscribeDesign(
      uid,
      designId,
      (d) => setDesign(d || null),
      () => setError("load_failed"),
    );
  }, [designId]);

  if (error) {
    return (
      <div style={wrap}>
        <div style={{ color: C.dim, textAlign: "center", padding: 40 }}>
          {error === "no_session"
            ? (lang === "he" ? "אין הרשאה — התחבר מחדש באפליקציה." : "لا صلاحية — أعد تسجيل الدخول في التطبيق.")
            : (lang === "he" ? "טעינת התצוגה נכשלה." : "تعذّر تحميل المعاينة.")}
        </div>
      </div>
    );
  }

  if (!design) {
    return (
      <div style={wrap}>
        <div style={{ color: C.dim, textAlign: "center", padding: 40 }}>
          <span className="spinner" /> {lang === "he" ? "טוען תצוגה…" : "جاري تحميل المعاينة…"}
        </div>
      </div>
    );
  }

  return (
    <TemplateRenderer
      design={design}
      lang={lang}
      setLang={setLang}
      mode="preview"
      showEnvelope
      demo
      fullscreen
      guestName={lang === "he" ? "שם האורח" : "اسم الضيف"}
    />
  );
}

const wrap = { minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" };
