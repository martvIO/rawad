// Digital invitation — Add guest form.
// Validation: name must be 2+ words, phone must be exactly 10 digits.
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { usePortal } from "../../../../context/PortalContext.jsx";
import { addDigitalGuest, subscribeDigitalMedia } from "../../../../services/digitalInvitation.js";
import { logErr } from "../../../../utils/logger.js";
import { C } from "../../../../styles/theme.js";

export function DigitalAddGuest() {
  const { lang, currentUid, showToast } = usePortal();
  const navigate = useNavigate();
  const [name,   setName]   = useState("");
  const [phone,  setPhone]  = useState("");
  const [rank,   setRank]   = useState("");
  const [ranks,  setRanks]  = useState([]);
  const [saving, setSaving] = useState(false);
  // Tracks unmount so we don't call setSaving on a dead component after the
  // optimistic navigate has fired. Avoids React's "state on unmounted" warning
  // and prevents the spinner state from being reset to stale on a fast remount.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Load the groom's custom ranks from the parent invitation doc.
  useEffect(() => {
    if (!currentUid) return;
    return subscribeDigitalMedia(currentUid, (d) => setRanks(d?.guestRanks || []));
  }, [currentUid]);

  const nameWords  = name.trim().split(/\s+/).filter(Boolean);
  const phoneDigits = phone.replace(/\D/g, "");
  const nameOk   = nameWords.length >= 2;
  const phoneOk  = phoneDigits.length === 10;
  // Block submit until auth resolves — otherwise addDigitalGuest 401s,
  // apiClient retries once, then throws "session_expired" — which we'd show
  // as a generic toast and confuse the user.
  const canSubmit = nameOk && phoneOk && !saving && !!currentUid;

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
    if (!currentUid) {
      showToast(lang === "he" ? "אנא התחבר מחדש" : "يرجى إعادة تسجيل الدخول");
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const trimName = name.trim();
      const cleanRank = rank.trim();
      const id = await addDigitalGuest(currentUid, {
        name: trimName, phone: phoneDigits, rank: cleanRank,
      });
      showToast(lang === "he" ? "✓ המוזמן נוסף" : "✓ تم إضافة المدعو");
      setName(""); setPhone(""); setRank("");
      // Pass the new guest via navigation state so the list shows it immediately
      // without waiting for the next subscription tick.
      const optimistic = {
        id, name: trimName, phone: phoneDigits, status: "pending", createdAt: Date.now(),
      };
      if (cleanRank) optimistic.rank = cleanRank;
      navigate("/portal/groom/digital/guests", { state: { newGuest: optimistic } });
    } catch (err) {
      logErr("addDigitalGuest", err);
      const isTimeout = err?.message === "request_timeout";
      showToast(
        isTimeout
          ? (lang === "he" ? "פג זמן הבקשה — נסה שוב" : "انتهت مهلة الطلب — حاول مرة أخرى")
          : err?.message || (lang === "he" ? "שגיאה" : "خطأ"),
      );
    } finally {
      // Only flip the local spinner off if we're still mounted. After a
      // successful submit, the optimistic navigate unmounts this view; React
      // would warn on setState-on-unmounted otherwise.
      if (mountedRef.current) setSaving(false);
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
          fontSize: 10, marginBottom: 16, direction: "ltr", textAlign: "right",
          color: phoneOk ? "#4cc97a" : phoneDigits.length > 0 ? C.dim : "transparent",
        }}>
          {phoneDigits.length} / 10
        </div>

        {/* Rank dropdown — dynamically loaded from the groom's saved ranks */}
        <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>
          {lang === "he" ? "רמת המוזמן" : "رتبة المدعو"}
        </div>
        <select
          className="input-field"
          value={rank}
          onChange={e => setRank(e.target.value)}
          disabled={ranks.length === 0}
          style={{ marginBottom: 6, fontFamily: "inherit",
                   cursor: ranks.length === 0 ? "not-allowed" : "pointer" }}
        >
          <option value="">
            {ranks.length === 0
              ? (lang === "he" ? "אין רמות — הוסף ברשימה הראשית" : "لا توجد رتب — أضفها في الرئيسية")
              : (lang === "he" ? "— ללא רמה —" : "— بدون رتبة —")}
          </option>
          {ranks.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <div style={{ fontSize: 10, color: C.dim, marginBottom: 20, lineHeight: 1.6 }}>
          {lang === "he"
            ? "ניתן לנהל את הרמות בעמוד הראשי"
            : "يمكن إدارة الرتب في الصفحة الرئيسية"}
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
