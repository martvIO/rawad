// Digital invitation — Design request workflow.
// Groom submits a template, designer (admin) uploads mockups, groom approves
// or asks for revisions. Multi-step UI driven by the request's current status.
import { useState, useEffect, useMemo } from "react";
import { usePortal } from "../../../../context/PortalContext.jsx";
import {
  subscribeDesignRequests, submitDesignTemplate,
  approveDesign, requestRevision,
} from "../../../../services/designRequests.js";
import { logErr } from "../../../../utils/logger.js";
import { C } from "../../../../styles/theme.js";

const STATUS_META = {
  submitted:          { icon: "📨", color: C.gold,    label_ar: "تم الإرسال",       label_he: "נשלח" },
  designing:          { icon: "🎨", color: C.blue,    label_ar: "قيد التصميم",      label_he: "בעיצוב" },
  review:             { icon: "👀", color: "#c084fc", label_ar: "بانتظار موافقتك",  label_he: "ממתין לאישור" },
  revision_requested: { icon: "✎",  color: C.gold,    label_ar: "تم طلب تعديل",     label_he: "התבקש שינוי" },
  approved:           { icon: "✓",  color: "#4cc97a", label_ar: "تمت الموافقة",     label_he: "אושר" },
};

const tt = (lang, ar, he) => (lang === "he" ? he : ar);

export function DigitalDesignRequest() {
  const { lang, currentUid, currentUsername, showToast } = usePortal();
  const [requests, setRequests]   = useState([]);
  const [lightbox, setLightbox]   = useState(null);
  const [revising, setRevising]   = useState(false);
  const [revText,  setRevText]    = useState("");

  // Form state for new request
  const [showForm, setShowForm] = useState(false);
  const [brideName,   setBrideName]   = useState("");
  const [groomName,   setGroomName]   = useState("");
  const [weddingDate, setWeddingDate] = useState("");
  const [colors,      setColors]      = useState("");
  const [style,       setStyle]       = useState("");
  const [notes,       setNotes]       = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!currentUid) return;
    return subscribeDesignRequests(currentUid, setRequests);
  }, [currentUid]);

  // The "active" request is the most recent non-approved one.
  // Once approved, the request becomes "past" and the groom can start a new one.
  const active = useMemo(
    () => requests.find(r => r.status !== "approved"),
    [requests],
  );
  const approved = useMemo(
    () => requests.filter(r => r.status === "approved"),
    [requests],
  );

  const submitForm = async () => {
    if (!brideName.trim() || !groomName.trim()) {
      showToast(tt(lang, "اسم العروسين مطلوبان", "שמות הזוג נדרשים"));
      return;
    }
    setBusy(true);
    try {
      await submitDesignTemplate(currentUid, currentUsername, {
        brideName:   brideName.trim(),
        groomName:   groomName.trim(),
        weddingDate: weddingDate.trim(),
        colors:      colors.trim(),
        style:       style.trim(),
        notes:       notes.trim(),
      });
      // Clear form
      setBrideName(""); setGroomName(""); setWeddingDate("");
      setColors(""); setStyle(""); setNotes("");
      setShowForm(false);
      showToast(tt(lang, "✓ تم إرسال الطلب", "✓ הבקשה נשלחה"));
    } catch (err) {
      logErr("submitDesignTemplate", err);
      showToast(err?.message || tt(lang, "خطأ", "שגיאה"));
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async (reqId) => {
    try {
      await approveDesign(currentUid, reqId);
      showToast(tt(lang, "✓ تمت الموافقة", "✓ אושר"));
    } catch (err) {
      logErr("approveDesign", err);
      showToast(err?.message || tt(lang, "خطأ", "שגיאה"));
    }
  };

  const handleRevise = async (reqId) => {
    if (!revText.trim()) {
      showToast(tt(lang, "اكتب ما يجب تغييره", "כתוב מה לשנות"));
      return;
    }
    try {
      await requestRevision(currentUid, reqId, revText.trim());
      setRevising(false);
      setRevText("");
      showToast(tt(lang, "✓ تم إرسال طلب التعديل", "✓ הבקשה לשינוי נשלחה"));
    } catch (err) {
      logErr("requestRevision", err);
      showToast(err?.message || tt(lang, "خطأ", "שגיאה"));
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ animation: "fadeUp .3s ease" }}>

      {/* Title */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 19, fontWeight: 900, color: C.gold, fontFamily: "'Amiri',serif", marginBottom: 4 }}>
          🎨 {tt(lang, "تصميم الدعوة", "עיצוב ההזמנה")}
        </div>
        <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.7 }}>
          {tt(lang,
            "املأ النموذج ليبدأ المصمم بإعداد التصاميم الخاصة بدعوتك. ستراجع التصاميم وتوافق عليها أو تطلب تعديلات.",
            "מלא את הטופס כדי שהמעצב יתחיל להכין עיצובים להזמנה שלך. תוכל לאשר או לבקש שינויים.")}
        </div>
      </div>

      {/* ── ACTIVE REQUEST ──────────────────────────────────────────────────── */}
      {active && (
        <ActiveRequestCard
          req={active}
          lang={lang}
          lightbox={lightbox} setLightbox={setLightbox}
          revising={revising} setRevising={setRevising}
          revText={revText}   setRevText={setRevText}
          onApprove={handleApprove}
          onRevise={handleRevise}
        />
      )}

      {/* ── NEW REQUEST FORM ────────────────────────────────────────────────── */}
      {!active && !showForm && (
        <button onClick={() => setShowForm(true)} className="gold-btn"
                style={{ width: "100%", padding: "16px 0", fontSize: 14, marginBottom: 18 }}>
          ➕ {tt(lang, "طلب تصميم جديد", "בקשת עיצוב חדשה")}
        </button>
      )}
      {!active && showForm && (
        <div className="gold-card" style={{ marginBottom: 18 }}>
          <FormField label={tt(lang, "اسم العروس *", "שם הכלה *")}>
            <input className="input-field" type="text" value={brideName}
                   onChange={e => setBrideName(e.target.value)} />
          </FormField>
          <FormField label={tt(lang, "اسم العريس *", "שם החתן *")}>
            <input className="input-field" type="text" value={groomName}
                   onChange={e => setGroomName(e.target.value)} />
          </FormField>
          <FormField label={tt(lang, "تاريخ الزفاف", "תאריך החתונה")}>
            <input className="input-field" type="text" value={weddingDate}
                   onChange={e => setWeddingDate(e.target.value)}
                   placeholder="15/08/2026" />
          </FormField>
          <FormField label={tt(lang, "الألوان المفضلة", "צבעים מועדפים")}>
            <input className="input-field" type="text" value={colors}
                   onChange={e => setColors(e.target.value)}
                   placeholder={tt(lang, "ذهبي وعاجي", "זהב ושנהב")} />
          </FormField>
          <FormField label={tt(lang, "نمط التصميم", "סגנון העיצוב")}>
            <input className="input-field" type="text" value={style}
                   onChange={e => setStyle(e.target.value)}
                   placeholder={tt(lang, "كلاسيكي / عصري / بسيط", "קלאסי / מודרני / פשוט")} />
          </FormField>
          <FormField label={tt(lang, "ملاحظات إضافية", "הערות נוספות")}>
            <textarea className="input-field" rows={4} value={notes}
                      onChange={e => setNotes(e.target.value.slice(0, 1000))}
                      placeholder={tt(lang, "أي تفاصيل أخرى تود إضافتها", "פרטים נוספים שתרצה להוסיף")}
                      style={{ resize: "vertical", minHeight: 80, fontFamily: "inherit" }}/>
          </FormField>
          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button className="gold-btn" onClick={submitForm} disabled={busy}
                    style={{ flex: 1, padding: "10px 0", fontSize: 13 }}>
              {busy ? "..." : tt(lang, "📨 إرسال الطلب", "📨 שלח בקשה")}
            </button>
            <button onClick={() => setShowForm(false)}
                    style={{
                      flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 700,
                      background: "none", border: "1px solid rgba(255,255,255,.1)",
                      borderRadius: 10, color: C.dim, fontFamily: "inherit", cursor: "pointer",
                    }}>
              {tt(lang, "إلغاء", "ביטול")}
            </button>
          </div>
        </div>
      )}

      {/* ── PAST APPROVED DESIGNS ───────────────────────────────────────────── */}
      {approved.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{
            fontSize: 13, fontWeight: 800, color: C.goldLight, marginBottom: 10,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span>✓ {tt(lang, "التصاميم المعتمدة", "עיצובים מאושרים")}</span>
            <span style={{ fontSize: 11, color: C.dim, fontWeight: 600 }}>
              ({approved.length.toLocaleString("en")})
            </span>
          </div>
          {approved.map(r => (
            <ApprovedCard key={r.id} req={r} lang={lang} onOpen={setLightbox} />
          ))}
        </div>
      )}

      {/* ── LIGHTBOX ────────────────────────────────────────────────────────── */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.92)", zIndex: 2000,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 16, cursor: "zoom-out",
        }}>
          <button onClick={() => setLightbox(null)} style={{
            position: "absolute", top: 16, insetInlineEnd: 16,
            background: "rgba(0,0,0,.6)", border: "1px solid rgba(255,255,255,.2)",
            color: "#fff", padding: "8px 14px", borderRadius: 10,
            fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
          }}>✕</button>
          <img src={lightbox} alt="mockup" onClick={e => e.stopPropagation()}
               style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }}/>
        </div>
      )}
    </div>
  );
}

// ── Active request card — switches content based on status ──────────────────
function ActiveRequestCard({ req, lang, lightbox, setLightbox, revising, setRevising, revText, setRevText, onApprove, onRevise }) {
  const meta   = STATUS_META[req.status] || STATUS_META.submitted;
  const status = lang === "he" ? meta.label_he : meta.label_ar;

  return (
    <div className="gold-card" style={{ marginBottom: 18 }}>
      {/* Status header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, marginBottom: 14,
        paddingBottom: 12, borderBottom: "1px solid rgba(201,168,76,.15)",
      }}>
        <div style={{ fontSize: 28 }}>{meta.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 2 }}>
            {tt(lang, "الحالة الحالية", "סטטוס נוכחי")}
          </div>
          <div style={{ fontSize: 15, fontWeight: 900, color: meta.color }}>{status}</div>
        </div>
      </div>

      {/* Template summary */}
      <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,.02)" }}>
        <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 4 }}>
          {tt(lang, "تفاصيل الطلب", "פרטי הבקשה")}
        </div>
        <div style={{ fontSize: 13, color: C.goldLight, fontWeight: 700 }}>
          {req.templateData?.brideName} & {req.templateData?.groomName}
        </div>
        {req.templateData?.weddingDate && (
          <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>
            📅 {req.templateData.weddingDate}
          </div>
        )}
        {req.templateData?.style && (
          <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
            🎨 {req.templateData.style}
          </div>
        )}
      </div>

      {/* Step-specific content */}
      {(req.status === "submitted" || req.status === "designing") && (
        <WaitingCard lang={lang} req={req} />
      )}

      {req.status === "revision_requested" && (
        <div style={{
          padding: "12px 14px", borderRadius: 10, marginBottom: 12,
          background: "rgba(201,168,76,.06)", border: "1px solid rgba(201,168,76,.2)",
        }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.gold, marginBottom: 6 }}>
            {tt(lang, "تعديلاتك:", "השינויים שלך:")}
          </div>
          <div style={{ fontSize: 13, color: C.goldLight, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {req.revisionNotes || "—"}
          </div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 8 }}>
            ⏳ {tt(lang, "بانتظار النسخة الجديدة من المصمم", "ממתין לגרסה החדשה מהמעצב")}
          </div>
        </div>
      )}

      {req.status === "review" && req.mockups?.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 8 }}>
            {tt(lang, `التصاميم (${req.mockups.length})`, `עיצובים (${req.mockups.length})`)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginBottom: 14 }}>
            {req.mockups.map((m, i) => (
              <img key={i} src={m.url} alt={`mockup ${i+1}`}
                   onClick={() => setLightbox(m.url)}
                   style={{
                     width: "100%", aspectRatio: "1", objectFit: "cover",
                     borderRadius: 10, cursor: "zoom-in",
                     border: "1px solid rgba(201,168,76,.2)",
                   }}/>
            ))}
          </div>

          {!revising ? (
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => onApprove(req.id)}
                      style={{
                        flex: 1, padding: "12px 0", borderRadius: 10, border: "none", cursor: "pointer",
                        background: "linear-gradient(135deg,#4cc97a,#2da85a)",
                        color: "#fff", fontWeight: 900, fontSize: 13, fontFamily: "inherit",
                      }}>
                ✓ {tt(lang, "موافق على التصميم", "מאשר את העיצוב")}
              </button>
              <button onClick={() => setRevising(true)}
                      style={{
                        flex: 1, padding: "12px 0", borderRadius: 10, cursor: "pointer",
                        background: "rgba(201,168,76,.12)", border: "1px solid rgba(201,168,76,.35)",
                        color: C.gold, fontWeight: 800, fontSize: 13, fontFamily: "inherit",
                      }}>
                ✎ {tt(lang, "طلب تعديل", "בקש שינוי")}
              </button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 6 }}>
                {tt(lang, "ما الذي تود تغييره؟", "מה תרצה לשנות?")}
              </div>
              <textarea className="input-field" rows={4} value={revText}
                        onChange={e => setRevText(e.target.value.slice(0, 1000))}
                        placeholder={tt(lang, "اشرح بدقة ما يجب تعديله", "פרט מה לשנות")}
                        style={{ resize: "vertical", minHeight: 80, fontFamily: "inherit", marginBottom: 10 }}/>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => onRevise(req.id)} className="gold-btn"
                        style={{ flex: 1, padding: "10px 0", fontSize: 13 }}>
                  📨 {tt(lang, "إرسال", "שלח")}
                </button>
                <button onClick={() => { setRevising(false); setRevText(""); }}
                        style={{
                          flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 700,
                          background: "none", border: "1px solid rgba(255,255,255,.1)",
                          borderRadius: 10, color: C.dim, fontFamily: "inherit", cursor: "pointer",
                        }}>
                  {tt(lang, "إلغاء", "ביטול")}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function WaitingCard({ lang, req }) {
  const msg = req.status === "submitted"
    ? tt(lang, "تم استلام طلبك. سيبدأ المصمم العمل قريباً.", "בקשתך התקבלה. המעצב יתחיל לעבוד בקרוב.")
    : tt(lang, "المصمم يعمل على تصميماتك الآن.", "המעצב עובד על העיצובים שלך.");
  return (
    <div style={{
      padding: "20px 16px", borderRadius: 12, textAlign: "center",
      background: "rgba(75,159,212,.04)", border: "1px solid rgba(75,159,212,.18)",
    }}>
      <div style={{ fontSize: 40, marginBottom: 10 }}>⏳</div>
      <div style={{ fontSize: 13, color: C.goldLight, lineHeight: 1.7 }}>{msg}</div>
    </div>
  );
}

function ApprovedCard({ req, lang, onOpen }) {
  const cover = req.mockups?.[req.mockups.length - 1]?.url;
  return (
    <div className="card" style={{ marginBottom: 10, padding: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {cover && (
          <img src={cover} alt="approved design"
               onClick={() => onOpen(cover)}
               style={{
                 width: 72, height: 72, objectFit: "cover", borderRadius: 10, cursor: "zoom-in",
                 border: "1px solid rgba(76,201,122,.3)",
               }}/>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.goldLight, marginBottom: 3 }}>
            {req.templateData?.brideName} & {req.templateData?.groomName}
          </div>
          <div style={{ fontSize: 10, color: "#4cc97a", fontWeight: 700 }}>
            ✓ {tt(lang, "تمت الموافقة", "אושר")} · {new Date(req.approvedAt || req.updatedAt).toLocaleDateString(lang === "he" ? "he-IL" : "ar-SA")}
          </div>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}
