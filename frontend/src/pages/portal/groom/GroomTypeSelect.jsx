// First screen when a groom enters their portal — choose handwritten vs digital.
// The choice is persisted in localStorage so they land directly next time.
import { useNavigate } from "react-router-dom";
import { usePortal } from "../../../context/PortalContext.jsx";
import { C } from "../../../styles/theme.js";
import { STORAGE_KEYS } from "../../../constants/storageKeys.js";
import { FEATURES } from "../../../config/index.js";

export function GroomTypeSelect() {
  const { lang, onBack } = usePortal();
  const navigate = useNavigate();

  const pick = (type) => {
    localStorage.setItem(STORAGE_KEYS.GROOM_TYPE, type);
    navigate(
      type === "handwritten"
        ? "/portal/groom/handwritten/dashboard"
        : "/portal/groom/digital/dashboard",
      { replace: true },
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{
        padding: "14px 20px", display: "flex", alignItems: "center", gap: 12,
        borderBottom: "1px solid rgba(201,168,76,.12)",
        background: "rgba(7,7,10,.95)", backdropFilter: "blur(12px)",
      }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 18 }}>←</button>
        <span style={{ fontFamily: "'Amiri','Frank Ruhl Libre','Amiri Fallback',serif", color: C.gold, fontWeight: 900, fontSize: 22 }}>
          {lang === "he" ? "דעוה" : "دعوة"}
        </span>
      </div>

      {/* Selection area */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "28px 20px" }}>
        <div style={{ maxWidth: 460, width: "100%" }}>

          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: C.goldLight, marginBottom: 8 }}>
              {lang === "he" ? "בחר סוג ההזמנה" : "اختر نوع المكتوب"}
            </div>
            <div style={{ fontSize: 13, color: C.dim }}>
              {lang === "he" ? "ניתן לשנות את הבחירה בכל עת" : "يمكنك تغيير الاختيار في أي وقت"}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Handwritten — gated behind the physical beta flag (FEATURES.physical) */}
            {FEATURES.physical && (
            <button data-testid="btn-type-handwritten"
              onClick={() => pick("handwritten")}
              style={{
                position: "relative",
                padding: "28px 24px", borderRadius: 18, textAlign: "right", fontFamily: "inherit",
                border: "2px solid rgba(201,168,76,.35)", background: "rgba(201,168,76,.04)",
                cursor: "pointer", transition: "border-color .2s, background .2s",
              }}
            >
              <span style={{
                position: "absolute", top: 12, insetInlineEnd: 12,
                fontSize: 10, fontWeight: 800, letterSpacing: lang === "he" ? ".5px" : 0,
                padding: "3px 8px", borderRadius: 8,
                background: "rgba(201,168,76,.16)", color: C.gold,
              }}>{lang === "he" ? "בטא" : "تجريبي"}</span>
              <div style={{ fontSize: 48, marginBottom: 10 }}>📜</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: C.gold, marginBottom: 8 }}>
                {lang === "he" ? "הזמנה כתובה ידנית" : "مكتوب يدوي"}
              </div>
              <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.7 }}>
                {lang === "he"
                  ? "חלוקת הזמנות מודפסות עם מעקב חי על כל מכתב"
                  : "توزيع مكاتيب ورقية مع متابعة حية لكل مكتوب لحظة بلحظة"}
              </div>
            </button>
            )}

            {/* Digital */}
            <button data-testid="btn-type-digital"
              onClick={() => pick("digital")}
              style={{
                padding: "28px 24px", borderRadius: 18, textAlign: "right", fontFamily: "inherit",
                border: "2px solid rgba(75,159,212,.35)", background: "rgba(75,159,212,.04)",
                cursor: "pointer", transition: "border-color .2s, background .2s",
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 10 }}>✨</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: C.blue, marginBottom: 8 }}>
                {lang === "he" ? "הזמנה דיגיטלית" : "دعوة رقمية"}
              </div>
              <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.7 }}>
                {lang === "he"
                  ? "הזמנה אלקטרונית עם מעקב נוכחות / היעדרות ואזור מיוחד לצלם"
                  : "دعوة إلكترونية مع متابعة الحضور والغياب ومنطقة المصور"}
              </div>
            </button>

          </div>
        </div>
      </div>
    </div>
  );
}
