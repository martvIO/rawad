// Digital invitation — Add guest form.
// Validation: name must be 2+ words, phone must be exactly 10 digits.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePortal } from "../../../../context/PortalContext.jsx";
import { addDigitalGuest } from "../../../../services/digitalInvitation.js";
import { logErr } from "../../../../utils/logger.js";
import { C } from "../../../../styles/theme.js";

export function DigitalAddGuest() {
  const { lang, currentUid, showToast } = usePortal();
  const navigate = useNavigate();
  const [name,   setName]   = useState("");
  const [phone,  setPhone]  = useState("");
  const [saving, setSaving] = useState(false);

  const nameWords  = name.trim().split(/\s+/).filter(Boolean);
  const phoneDigits = phone.replace(/\D/g, "");
  const nameOk   = nameWords.length >= 2;
  const phoneOk  = phoneDigits.length === 10;
  const canSubmit = nameOk && phoneOk && !saving;

  // Show inline errors only once the user has typed something
  const nameErr  = name.trim()  && !nameOk
    ? (lang === "he" ? "שם חייב להכיל לפחות 2 מילים" : "يجب أن يحتوي الاسم على كلمتين على الأقل")
    : null;
  const phoneErr = phone.trim() && !phoneOk
    ? (lang === "he" ? "10 ספרות בדיוק" : "يجب أن يكون الرقم 10 أرقام بالضبط")
    : null;

  const submit = async () => {
    if (!nameOk)  { showToast(nameErr  || (lang === "he" ? "שם לא תקין" : "الاسم غير صحيح"));  return; }
    if (!phoneOk) { showToast(phoneErr || (lang === "he" ? "טלפון לא תקין" : "الهاتف غير صحيح")); return; }
    if (saving) return;
    setSaving(true);
    try {
      const trimName  = name.trim();
      const id        = await addDigitalGuest(currentUid, { name: trimName, phone: phoneDigits });
      showToast(lang === "he" ? "✓ המוזמן נוסף" : "✓ تم إضافة المدعو");
      setName(""); setPhone("");
      // Pass the new guest via navigation state so the list shows it immediately
      // without waiting for the Firebase subscription to fire.
      navigate("/portal/groom/digital/guests", {
        state: { newGuest: { id, name: trimName, phone: phoneDigits, status: "pending", createdAt: Date.now() } },
      });
    } catch (err) {
      logErr("addDigitalGuest", err);
      showToast(err?.message || "خطأ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 19, fontWeight: 900, color: C.gold, fontFamily: "'Amiri',serif", marginBottom: 4 }}>
          {lang === "he" ? "הוסף מוזמן חדש" : "إضافة مدعو جديد"}
        </div>
        <div style={{ fontSize: 12, color: C.dim }}>
          {lang === "he" ? "כל השדות חובה" : "جميع الحقول إجبارية"}
        </div>
      </div>

      <div className="gold-card" style={{ padding: 24 }}>

        {/* Name */}
        <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>
          {lang === "he" ? "שם מלא (2 מילים לפחות) *" : "الاسم الكامل (كلمتان على الأقل) *"}
        </div>
        <input
          className="input-field"
          type="text"
          placeholder={lang === "he" ? "מוחמד אחמד" : "محمد أحمد"}
          value={name}
          onChange={e => setName(e.target.value)}
          style={{ marginBottom: nameErr ? 4 : 14 }}
        />
        {nameErr && (
          <div style={{ fontSize: 11, color: C.red, marginBottom: 12, paddingInlineStart: 4 }}>⚠ {nameErr}</div>
        )}

        {/* Phone */}
        <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>
          {lang === "he" ? "מספר טלפון (10 ספרות בדיוק) *" : "رقم الهاتف (10 أرقام بالضبط) *"}
        </div>
        <input
          className="input-field"
          type="tel"
          placeholder="0501234567"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          style={{ marginBottom: phoneErr ? 4 : 4, direction: "ltr", textAlign: "right" }}
        />
        {phoneErr && (
          <div style={{ fontSize: 11, color: C.red, marginBottom: 4, paddingInlineStart: 4 }}>⚠ {phoneErr}</div>
        )}
        {/* Digit counter */}
        <div style={{
          fontSize: 10, marginBottom: 20, direction: "ltr", textAlign: "right",
          color: phoneOk ? "#4cc97a" : phoneDigits.length > 0 ? C.dim : "transparent",
        }}>
          {phoneDigits.length} / 10
        </div>

        <button
          className="gold-btn"
          style={{ width: "100%", opacity: canSubmit ? 1 : 0.45, cursor: canSubmit ? "pointer" : "not-allowed" }}
          onClick={submit}
          disabled={!canSubmit}
        >
          {saving
            ? (lang === "he" ? "מוסיף..." : "جاري الإضافة...")
            : (lang === "he" ? "➕ הוסף מוזמן לרשימה" : "➕ إضافة المدعو إلى القائمة")}
        </button>
      </div>

      <div style={{
        marginTop: 16, padding: 14, borderRadius: 12,
        background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)",
        fontSize: 12, color: C.dim, lineHeight: 1.8,
      }}>
        {lang === "he"
          ? "💡 הזן שם מלא (לפחות 2 מילים) ומספר טלפון של 10 ספרות. המוזמן יוסף עם סטטוס 'טרם ענה' — ניתן לעדכן את סטטוסו ישירות מהרשימה."
          : "💡 أدخل الاسم الكامل (كلمتان على الأقل) ورقم الهاتف (10 أرقام بالضبط). يُضاف المدعو بحالة 'لم يرد' — يمكن تحديث الحالة مباشرة من القائمة."}
      </div>
    </div>
  );
}
