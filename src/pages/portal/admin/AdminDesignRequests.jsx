// Admin (designer) view — incoming design requests grouped by status.
// Admin starts a request → uploads mockups → either gets approval from the
// groom or receives revision notes asking for changes.
import { useState, useEffect, useMemo, useRef } from "react";
import { usePortal } from "../../../context/PortalContext.jsx";
import {
  subscribeAllDesignRequests, startDesigning,
  uploadMockup, commitMockup,
} from "../../../services/designRequests.js";
import { logErr } from "../../../utils/logger.js";
import { C } from "../../../styles/theme.js";

const STATUS_META = {
  submitted:          { icon: "📨", color: C.gold,    label_ar: "جديد",        label_he: "חדש",      bucket: "new" },
  designing:          { icon: "🎨", color: C.blue,    label_ar: "قيد العمل",   label_he: "בעבודה",   bucket: "working" },
  review:             { icon: "👀", color: "#c084fc", label_ar: "مع العريس",   label_he: "אצל החתן", bucket: "review" },
  revision_requested: { icon: "✎",  color: "#d4533a", label_ar: "طلب تعديل",   label_he: "בקשת שינוי", bucket: "revision" },
  approved:           { icon: "✓",  color: "#4cc97a", label_ar: "معتمد",       label_he: "אושר",      bucket: "done" },
};
const tt = (lang, ar, he) => (lang === "he" ? he : ar);

export function AdminDesignRequests() {
  const { lang, showToast } = usePortal();
  const [requests,  setRequests]  = useState([]);
  const [expanded,  setExpanded]  = useState(null);
  const [uploading, setUploading] = useState(null); // reqId being uploaded
  const inputRefs = useRef({});

  useEffect(() => subscribeAllDesignRequests(setRequests), []);

  const groups = useMemo(() => ({
    new:      requests.filter(r => r.status === "submitted"),
    working:  requests.filter(r => r.status === "designing"),
    review:   requests.filter(r => r.status === "review"),
    revision: requests.filter(r => r.status === "revision_requested"),
    done:     requests.filter(r => r.status === "approved"),
  }), [requests]);

  const handleStart = async (req) => {
    try { await startDesigning(req.groomUid, req.id); }
    catch (err) { logErr("startDesigning", err); showToast(err?.message || "خطأ"); }
  };

  const handleUpload = async (req, file) => {
    if (!file) return;
    setUploading(req.id);
    try {
      const newMockup = await uploadMockup(req.groomUid, req.id, file);
      await commitMockup(req.groomUid, req.id, req.mockups, newMockup);
      showToast(tt(lang, "✓ تم رفع التصميم", "✓ העיצוב הועלה"));
    } catch (err) {
      logErr("uploadMockup", err);
      showToast(err?.message || tt(lang, "فشل الرفع", "ההעלאה נכשלה"));
    } finally {
      setUploading(null);
      if (inputRefs.current[req.id]) inputRefs.current[req.id].value = "";
    }
  };

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 19, fontWeight: 900, color: C.gold, fontFamily: "'Amiri',serif", marginBottom: 4 }}>
          🎨 {tt(lang, "طلبات التصاميم", "בקשות עיצוב")}
        </div>
        <div style={{ fontSize: 12, color: C.dim }}>
          {tt(lang, "كل طلبات التصاميم من العرسان مرتبة حسب الحالة",
                    "כל בקשות העיצוב מהחתנים ממוינות לפי סטטוס")}
        </div>
      </div>

      {requests.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 32, color: C.dim }}>
          {tt(lang, "لا يوجد طلبات حالياً", "אין בקשות כרגע")}
        </div>
      )}

      {/* Sections, in workflow order */}
      <Section title={tt(lang, "📨 جديد", "📨 חדש")} count={groups.new.length} color={C.gold}>
        {groups.new.map(r => (
          <RequestCard key={r.id} req={r} lang={lang}
                       expanded={expanded === r.id}
                       onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                       inputRefs={inputRefs}
                       uploading={uploading === r.id}
                       onStart={handleStart}
                       onUpload={handleUpload}/>
        ))}
      </Section>

      <Section title={tt(lang, "🎨 قيد العمل", "🎨 בעבודה")} count={groups.working.length} color={C.blue}>
        {groups.working.map(r => (
          <RequestCard key={r.id} req={r} lang={lang}
                       expanded={expanded === r.id}
                       onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                       inputRefs={inputRefs}
                       uploading={uploading === r.id}
                       onStart={handleStart}
                       onUpload={handleUpload}/>
        ))}
      </Section>

      <Section title={tt(lang, "✎ طلب تعديل", "✎ בקשת שינוי")} count={groups.revision.length} color="#d4533a">
        {groups.revision.map(r => (
          <RequestCard key={r.id} req={r} lang={lang}
                       expanded={expanded === r.id}
                       onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                       inputRefs={inputRefs}
                       uploading={uploading === r.id}
                       onStart={handleStart}
                       onUpload={handleUpload}/>
        ))}
      </Section>

      <Section title={tt(lang, "👀 بانتظار العريس", "👀 ממתין לחתן")} count={groups.review.length} color="#c084fc">
        {groups.review.map(r => (
          <RequestCard key={r.id} req={r} lang={lang}
                       expanded={expanded === r.id}
                       onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                       inputRefs={inputRefs}
                       uploading={uploading === r.id}
                       onStart={handleStart}
                       onUpload={handleUpload}/>
        ))}
      </Section>

      <Section title={tt(lang, "✓ معتمد", "✓ אושר")} count={groups.done.length} color="#4cc97a">
        {groups.done.map(r => (
          <RequestCard key={r.id} req={r} lang={lang}
                       expanded={expanded === r.id}
                       onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                       inputRefs={inputRefs}
                       uploading={uploading === r.id}
                       onStart={handleStart}
                       onUpload={handleUpload}/>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, count, color, children }) {
  if (count === 0) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
        padding: "8px 12px", borderRadius: 10,
        background: `${color}10`, border: `1px solid ${color}33`,
      }}>
        <div style={{ flex: 1, fontWeight: 800, color, fontSize: 13 }}>{title}</div>
        <span style={{ fontSize: 11, color, fontWeight: 700 }}>{count.toLocaleString("en")}</span>
      </div>
      {children}
    </div>
  );
}

function RequestCard({ req, lang, expanded, onToggle, inputRefs, uploading, onStart, onUpload }) {
  const meta = STATUS_META[req.status] || STATUS_META.submitted;
  const fmt  = new Date(req.createdAt).toLocaleString(lang === "he" ? "he-IL" : "ar-SA", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div style={{
      background: "#0f0f15", border: "1px solid rgba(255,255,255,.07)",
      borderRadius: 12, padding: 12, marginBottom: 8,
    }}>
      {/* Header — always visible */}
      <div onClick={onToggle}
           style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
        <div style={{ fontSize: 22 }}>{meta.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.goldLight }}>
            {req.templateData?.brideName} & {req.templateData?.groomName}
          </div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
            @{req.groomUsername || "—"} · {fmt}
          </div>
        </div>
        <div style={{ fontSize: 18, color: C.dim, padding: "0 4px" }}>
          {expanded ? "▴" : "▾"}
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.05)" }}>
          {/* Template details */}
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", marginBottom: 12 }}>
            <Detail label={lang === "he" ? "תאריך" : "التاريخ"} val={req.templateData?.weddingDate} />
            <Detail label={lang === "he" ? "צבעים" : "الألوان"} val={req.templateData?.colors} />
            <Detail label={lang === "he" ? "סגנון" : "النمط"} val={req.templateData?.style} />
            <Detail label={lang === "he" ? "הערות" : "ملاحظات"} val={req.templateData?.notes} />
          </div>

          {/* Revision notes (when applicable) */}
          {req.status === "revision_requested" && req.revisionNotes && (
            <div style={{
              padding: "10px 12px", borderRadius: 10, marginBottom: 12,
              background: "rgba(212,80,58,.08)", border: "1px solid rgba(212,80,58,.25)",
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#d4533a", marginBottom: 4 }}>
                {lang === "he" ? "בקשת השינוי של החתן:" : "تعديلات العريس:"}
              </div>
              <div style={{ fontSize: 12, color: C.goldLight, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                {req.revisionNotes}
              </div>
            </div>
          )}

          {/* Existing mockups */}
          {req.mockups?.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: C.goldDim, marginBottom: 6 }}>
                {lang === "he" ? `עיצובים (${req.mockups.length})` : `التصاميم (${req.mockups.length})`}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 12 }}>
                {req.mockups.map((m, i) => (
                  <a key={i} href={m.url} target="_blank" rel="noreferrer">
                    <img src={m.url} alt={`mockup ${i+1}`}
                         style={{ width: "100%", aspectRatio: "1", objectFit: "cover",
                                  borderRadius: 8, border: "1px solid rgba(201,168,76,.2)" }}/>
                  </a>
                ))}
              </div>
            </>
          )}

          {/* Action area */}
          {req.status === "submitted" && (
            <button onClick={() => onStart(req)} className="gold-btn"
                    style={{ width: "100%", padding: "10px 0", fontSize: 13 }}>
              🎨 {lang === "he" ? "התחל לעבוד" : "ابدأ العمل"}
            </button>
          )}

          {(req.status === "designing" || req.status === "review" || req.status === "revision_requested") && (
            <label style={{
              display: "block", padding: "12px 16px", borderRadius: 10, textAlign: "center",
              border: `2px dashed ${uploading ? "rgba(201,168,76,.65)" : "rgba(201,168,76,.32)"}`,
              background: uploading ? "rgba(201,168,76,.06)" : "rgba(201,168,76,.02)",
              cursor: uploading ? "not-allowed" : "pointer",
            }}>
              <input ref={el => inputRefs.current[req.id] = el}
                     type="file" accept="image/*" style={{ display: "none" }} disabled={uploading}
                     onChange={e => onUpload(req, e.target.files?.[0])}/>
              {uploading ? (
                <div style={{ color: C.gold, fontSize: 12, fontWeight: 800 }}>
                  ⏳ {lang === "he" ? "מעלה..." : "جاري الرفع..."}
                </div>
              ) : (
                <div style={{ color: C.gold, fontSize: 12, fontWeight: 800 }}>
                  📁 {req.status === "revision_requested"
                       ? (lang === "he" ? "העלה גרסה חדשה" : "ارفع نسخة جديدة")
                       : (lang === "he" ? "העלה עיצוב" : "ارفع تصميم")}
                </div>
              )}
            </label>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ label, val }) {
  if (!val) return null;
  return (
    <>
      <div style={{ fontSize: 11, color: C.dim, fontWeight: 700 }}>{label}:</div>
      <div style={{ fontSize: 12, color: C.goldLight }}>{val}</div>
    </>
  );
}
