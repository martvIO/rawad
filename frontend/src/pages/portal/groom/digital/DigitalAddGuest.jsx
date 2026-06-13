// Digital invitation — Add guest form.
// Validation: name must be 2+ words, phone must be exactly 10 digits.
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { usePortal } from "../../../../context/PortalContext.jsx";
import { addDigitalGuest, subscribeDigitalMedia, subscribeDigitalGuests } from "../../../../services/digitalInvitation.js";
import { toIntlPhone } from "../../../../utils/phone.js";
import { logErr } from "../../../../utils/logger.js";
import { localizeApiError } from "../../../../utils/apiError.js";
import { C } from "../../../../styles/theme.js";
import { Num } from "../../../../components/Num.jsx";

export function DigitalAddGuest() {
  const { lang, currentUid, showToast } = usePortal();
  const navigate = useNavigate();
  const [name,           setName]           = useState("");
  const [phone,          setPhone]          = useState("");
  // `selectedRanks` is the multi-select state — an array of rank labels the
  // user has toggled on. `availableRanks` is the master list from the parent
  // invitation doc (managed in DigitalDashboard).
  const [selectedRanks,  setSelectedRanks]  = useState([]);
  const [availableRanks, setAvailableRanks] = useState([]);
  const [saving,         setSaving]         = useState(false);
  // The groom's existing digital guests — used to block a duplicate phone.
  const [existingGuests, setExistingGuests] = useState([]);
  // Tracks unmount so we don't call setSaving on a dead component after the
  // optimistic navigate has fired. Avoids React's "state on unmounted" warning
  // and prevents the spinner state from being reset to stale on a fast remount.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Load the groom's custom ranks from the parent invitation doc.
  useEffect(() => {
    if (!currentUid) return;
    return subscribeDigitalMedia(currentUid, (d) => setAvailableRanks(d?.guestRanks || []));
  }, [currentUid]);

  // Subscribe to the existing digital guests so we can block a duplicate phone.
  useEffect(() => {
    if (!currentUid) return;
    return subscribeDigitalGuests(currentUid, (list) =>
      setExistingGuests(Array.isArray(list) ? list : []));
  }, [currentUid]);

  const toggleRank = (r) => {
    setSelectedRanks((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r],
    );
  };

  const nameWords  = name.trim().split(/\s+/).filter(Boolean);
  const phoneDigits = phone.replace(/\D/g, "").slice(0, 9); // 9 national digits after +972
  const nameOk   = nameWords.length >= 2;
  const phoneOk  = phoneDigits.length === 9;
  // Duplicate phone within THIS groom's list — compared in canonical intl form.
  const newIntl = phoneOk ? toIntlPhone("0" + phoneDigits) : "";
  const isDuplicate = phoneOk && existingGuests.some((g) => toIntlPhone(g.phone) === newIntl);
  // Block submit until auth resolves — otherwise addDigitalGuest 401s,
  // apiClient retries once, then throws "session_expired" — which we'd show
  // as a generic toast and confuse the user.
  const canSubmit = nameOk && phoneOk && !isDuplicate && !saving && !!currentUid;

  // Show inline errors only once the user has typed something
  const nameErr  = name.trim()  && !nameOk
    ? (lang === "he" ? "שם חייב להכיל לפחות 2 מילים" : "يجب أن يحتوي الاسم على كلمتين على الأقل")
    : null;
  const phoneErr = phone && !phoneOk
    ? (lang === "he" ? "9 ספרות בדיוק" : "9 أرقام بالضبط")
    : isDuplicate
      ? (lang === "he" ? "המספר כבר קיים ברשימה" : "هذا الرقم مضاف مسبقاً لهذا العريس")
      : null;

  const submit = async () => {
    if (!nameOk)  { showToast(nameErr  || (lang === "he" ? "שם לא תקין" : "الاسم غير صحيح"));  return; }
    if (!phoneOk) { showToast(phoneErr || (lang === "he" ? "טלפון לא תקין" : "الهاتف غير صحيح")); return; }
    if (isDuplicate) { showToast(lang === "he" ? "המספר כבר קיים ברשימה" : "هذا الرقم مضاف مسبقاً لهذا العريس"); return; }
    if (!currentUid) {
      showToast(lang === "he" ? "אנא התחבר מחדש" : "يرجى إعادة تسجيل الدخول");
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const trimName = name.trim();
      // Keep only ranks the user actually picked AND that still exist in the
      // master list — protects against a race where the groom removed a rank
      // in another tab between selection and submit.
      const cleanRanks = selectedRanks.filter((r) => availableRanks.includes(r));
      // Store the canonical local form (0XXXXXXXXX) the rest of the app expects.
      const localPhone = "0" + phoneDigits;
      const id = await addDigitalGuest(currentUid, {
        name: trimName, phone: localPhone, ranks: cleanRanks,
      });
      showToast(lang === "he" ? "✓ המוזמן נוסף" : "✓ تم إضافة المدعو");
      setName(""); setPhone(""); setSelectedRanks([]);
      // Pass the new guest via navigation state so the list shows it immediately
      // without waiting for the next subscription tick.
      const optimistic = {
        id, name: trimName, phone: localPhone, status: "pending", createdAt: Date.now(),
      };
      if (cleanRanks.length > 0) optimistic.ranks = cleanRanks;
      navigate("/portal/groom/digital/guests", { state: { newGuest: optimistic } });
    } catch (err) {
      logErr("addDigitalGuest", err);
      const code = err?.body?.error || "";
      if (code === "duplicate_phone") {
        showToast(lang === "he" ? "המספר כבר קיים ברשימה" : "هذا الرقم مضاف مسبقاً لهذا العريس");
        return;
      }
      showToast(localizeApiError(err, lang));
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

        {/* Phone — fixed +972 prefix, exactly 9 national digits */}
        <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>
          {lang === "he" ? "מספר טלפון (+972 — 9 ספרות) *" : "رقم الهاتف (+972 — 9 أرقام) *"}
        </div>
        <div style={{ display: "flex", alignItems: "stretch", direction: "ltr", marginBottom: 4 }}>
          <span style={{
            display: "flex", alignItems: "center", padding: "0 14px", flexShrink: 0,
            background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.10)",
            borderInlineEnd: "none", borderStartStartRadius: 12, borderEndStartRadius: 12,
            color: C.goldLight, fontWeight: 800, fontSize: 15, letterSpacing: ".5px",
          }}>+972</span>
          <input
            className="input-field"
            type="tel"
            inputMode="numeric"
            placeholder="521234567"
            maxLength={9}
            value={phone}
            onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 9))}
            style={{ borderStartStartRadius: 0, borderEndStartRadius: 0, direction: "ltr", textAlign: "left", flex: 1, minWidth: 0 }}
          />
        </div>
        {phoneErr && (
          <div style={{ fontSize: 11, color: C.red, marginBottom: 4, paddingInlineStart: 4 }}>⚠ {phoneErr}</div>
        )}
        {/* Digit counter */}
        <div style={{
          fontSize: 10, marginBottom: 16, direction: "ltr", textAlign: "left",
          color: phoneOk && !isDuplicate ? "#4cc97a" : phoneDigits.length > 0 ? C.dim : "transparent",
        }}>
          {phoneDigits.length} / 9
        </div>

        {/* Ranks chip picker — tap each chip to toggle. Multi-select. */}
        <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim,
                      display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span>{lang === "he" ? "רמות המוזמן (אפשר לבחור כמה)" : "رتب المدعو (يمكن اختيار عدة)"}</span>
          {selectedRanks.length > 0 && (
            <span style={{ fontSize: 10, color: C.gold, fontWeight: 700 }}>
              <Num>{selectedRanks.length}</Num> {lang === "he" ? "נבחרו" : "محددة"}
            </span>
          )}
        </div>
        {availableRanks.length === 0 ? (
          <div style={{
            marginBottom: 16, padding: "10px 12px", borderRadius: 10,
            background: "rgba(255,255,255,.03)", border: "1px dashed rgba(255,255,255,.12)",
            fontSize: 12, color: C.dim, textAlign: "center",
          }}>
            {lang === "he" ? "אין רמות — הוסף ברשימה הראשית" : "لا توجد رتب — أضفها في الرئيسية"}
          </div>
        ) : (
          <div style={{
            display: "flex", flexWrap: "wrap", gap: 6,
            marginBottom: 6, padding: "8px 6px",
            borderRadius: 10, background: "rgba(255,255,255,.02)",
            border: "1px solid rgba(255,255,255,.06)",
          }}>
            {availableRanks.map(r => {
              const on = selectedRanks.includes(r);
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => toggleRank(r)}
                  style={{
                    padding: "6px 12px", borderRadius: 999,
                    border: on ? `1px solid ${C.gold}` : "1px solid rgba(255,255,255,.12)",
                    background: on ? "rgba(201,168,76,.18)" : "transparent",
                    color: on ? C.gold : C.goldDim,
                    fontWeight: on ? 800 : 600,
                    fontSize: 12, fontFamily: "inherit", cursor: "pointer",
                    transition: "all .15s",
                  }}
                >
                  {on ? "✓ " : ""}{r}
                </button>
              );
            })}
          </div>
        )}
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
          ? "💡 הזן שם מלא (לפחות 2 מילים) ומספר טלפון (+972 ואז 9 ספרות). אי אפשר להוסיף אותו מספר פעמיים. המוזמן יוסף עם סטטוס 'טרם ענה' — ניתן לעדכן ישירות מהרשימה."
          : "💡 أدخل الاسم الكامل (كلمتان على الأقل) ورقم الهاتف (+972 ثم 9 أرقام). لا يمكن إضافة نفس الرقم مرتين. يُضاف المدعو بحالة 'لم يرد' — يمكن تحديث الحالة مباشرة من القائمة."}
      </div>
    </div>
  );
}
