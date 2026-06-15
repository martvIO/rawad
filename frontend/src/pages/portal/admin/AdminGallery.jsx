// Admin People-gallery console: monitor indexing/clustering progress, approve
// or reject each wedding's gallery, flip the kill-switch, curate people
// (hide / rename / merge), recompute, send photo links, and erase face data.
import { useEffect, useState } from "react";
import {
  listGalleries, getGallery, getIndexStatus, getClusterStatus, getGalleryClusters,
  recomputeGallery, setGalleryStatus, setGalleryEnabled, hideCluster, labelCluster,
  mergeClusters, eraseFaces, sendPhotoLinks,
} from "../../../services/gallery.js";
import { ProgressBar } from "../../../components/ProgressBar.jsx";
import { C } from "../../../styles/theme.js";

const tt = (lang, ar, he) => (lang === "he" ? he : ar);
const STATUS_META = {
  draft:            { ar: "مسودة", he: "טיוטה", color: "#c9a84c" },
  pending_approval: { ar: "بانتظار الموافقة", he: "ממתין לאישור", color: "#4b9fd4" },
  approved:         { ar: "معتمد", he: "מאושר", color: "#4cc97a" },
  rejected:         { ar: "مرفوض", he: "נדחה", color: "#d4533a" },
};

export function AdminGallery({ lang = "ar" }) {
  const [rows, setRows] = useState([]);
  const [sel, setSel] = useState(null);     // uid
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mergeSrc, setMergeSrc] = useState(null);
  const [msg, setMsg] = useState("");

  const refreshList = () => listGalleries().then(setRows).catch(() => setRows([]));
  useEffect(() => { refreshList(); }, []);

  async function open(uid) {
    setSel(uid); setDetail(null); setMergeSrc(null); setMsg("");
    try {
      const [config, indexStatus, clusterStatus, clusters] = await Promise.all([
        getGallery(uid), getIndexStatus(uid), getClusterStatus(uid), getGalleryClusters(uid),
      ]);
      setDetail({ config, indexStatus, clusterStatus, clusters });
    } catch {
      setDetail({ error: true });
    }
  }
  const reload = () => sel && open(sel);

  async function act(fn, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true); setMsg("");
    try { await fn(); await reload(); refreshList(); }
    catch (e) { setMsg(tt(lang, "فشل الإجراء", "הפעולה נכשלה") + (e?.body?.error ? `: ${e.body.error}` : "")); }
    finally { setBusy(false); }
  }

  const pill = (status) => {
    const m = STATUS_META[status] || STATUS_META.draft;
    return <span style={{ fontSize: 11, fontWeight: 800, color: m.color, border: `1px solid ${m.color}`, borderRadius: 20, padding: "2px 10px" }}>{tt(lang, m.ar, m.he)}</span>;
  };

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "8px 4px 60px" }}>
      <h2 style={{ color: C.gold, fontSize: 18 }}>📸 {tt(lang, "معرض الأشخاص", "גלריית האנשים")}</h2>
      {msg && <div style={{ color: C.red, fontSize: 13, margin: "8px 0" }}>{msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: sel ? "1fr 1.4fr" : "1fr", gap: 16 }}>
        {/* List */}
        <div>
          {rows.length === 0 && <div style={{ color: C.dim, fontSize: 13, padding: 12 }}>{tt(lang, "لا توجد معارض بعد", "אין גלריות עדיין")}</div>}
          {rows.map((r) => (
            <button key={r.uid} onClick={() => open(r.uid)} className="card"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", textAlign: "start", marginBottom: 8, padding: 12, cursor: "pointer", border: sel === r.uid ? `1px solid ${C.gold}` : undefined }}>
              <span style={{ fontSize: 13, color: C.text, overflow: "hidden", textOverflow: "ellipsis" }}>
                {labelText(r.title, lang) || r.uid.slice(0, 10)}
                {r.enabled ? " 🟢" : " ⚪"}
              </span>
              {pill(r.galleryStatus)}
            </button>
          ))}
        </div>

        {/* Detail */}
        {sel && detail && !detail.error && (
          <div className="gold-card" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 800, color: C.gold }}>{pill(detail.config.galleryStatus)}</div>
              <label style={{ fontSize: 12, color: C.dim, display: "flex", alignItems: "center", gap: 6 }}>
                {tt(lang, "مُفعّل (Kill-switch)", "פעיל (Kill-switch)")}
                <input type="checkbox" checked={!!detail.config.enabled} disabled={busy}
                  onChange={(e) => act(() => setGalleryEnabled(sel, e.target.checked))} />
              </label>
            </div>

            {detail.config.galleryRejectionNote && (
              <div style={{ fontSize: 12, color: "#e07070", marginBottom: 8 }}>📝 {detail.config.galleryRejectionNote}</div>
            )}

            {/* Progress */}
            <ProgressBar label={tt(lang, "فهرسة الصور", "אינדוקס תמונות")}
              value={detail.indexStatus.indexed} total={detail.indexStatus.totalImages}
              sublabel={`${detail.indexStatus.faceCount} ${tt(lang, "وجه", "פנים")} · ${detail.indexStatus.failed} ${tt(lang, "فشل", "נכשל")} · ${detail.indexStatus.pending} ${tt(lang, "قيد الانتظار", "ממתין")}`} />
            <div style={{ fontSize: 12, color: C.dim, margin: "6px 0" }}>
              {tt(lang, "الأشخاص", "אנשים")}: <b style={{ color: C.gold }}>{detail.clusters.length}</b>
              {" · "}{tt(lang, "حالة التجميع", "סטטוס איגוד")}: {detail.clusterStatus?.phase || "idle"}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
              <Btn onClick={() => act(() => recomputeGallery(sel))} disabled={busy} color={C.gold}>🔄 {tt(lang, "إعادة التجميع", "חישוב מחדש")}</Btn>
              <Btn onClick={() => act(() => setGalleryStatus(sel, "approved"))} disabled={busy} color="#4cc97a">✓ {tt(lang, "اعتماد", "אישור")}</Btn>
              <Btn onClick={() => { const n = window.prompt(tt(lang, "سبب الرفض", "סיבת הדחייה")); if (n != null) act(() => setGalleryStatus(sel, "rejected", n)); }} disabled={busy} color="#d4533a">✗ {tt(lang, "رفض", "דחייה")}</Btn>
              <Btn onClick={() => act(() => setGalleryStatus(sel, "draft"))} disabled={busy} color="#c9a84c">✎ {tt(lang, "مسودة", "טיוטה")}</Btn>
              <Btn onClick={() => act(() => sendPhotoLinks(sel))} disabled={busy} color="#25D366">📲 {tt(lang, "إرسال روابط الصور", "שלח קישורי תמונות")}</Btn>
              <Btn onClick={() => act(() => eraseFaces(sel), tt(lang, "حذف كل بيانات الوجوه نهائياً؟", "למחוק לצמיתות את כל נתוני הפנים?"))} disabled={busy} color="#e07070">🗑 {tt(lang, "حذف بيانات الوجوه", "מחק נתוני פנים")}</Btn>
            </div>

            {/* People curation */}
            <div style={{ fontWeight: 800, color: C.gold, fontSize: 13, margin: "10px 0 6px" }}>{tt(lang, "الأشخاص (تنسيق)", "אנשים (עריכה)")}</div>
            {mergeSrc && <div style={{ fontSize: 11, color: C.gold, marginBottom: 6 }}>{tt(lang, "اختر شخصاً للدمج معه…", "בחר אדם למיזוג…")}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(96px,1fr))", gap: 10 }}>
              {detail.clusters.map((c) => (
                <div key={c.id} style={{ textAlign: "center", opacity: c.hidden ? 0.45 : 1 }}>
                  <div style={{ width: 72, height: 72, borderRadius: "50%", overflow: "hidden", margin: "0 auto", border: `2px solid ${mergeSrc === c.id ? C.gold : "rgba(201,168,76,.3)"}`, background: "#0b0b0f" }}>
                    {c.rep?.url && <img src={c.rep.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: faceCenter(c.rep.box), transform: "scale(1.6)" }} />}
                  </div>
                  <div style={{ fontSize: 11, color: C.text, marginTop: 4 }}>{labelText(c.label, lang) || "—"}</div>
                  <div style={{ fontSize: 10, color: C.dim }}>{c.photoCount} 📷</div>
                  <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                    <Mini onClick={() => act(() => hideCluster(sel, c.id, !c.hidden))} disabled={busy}>{c.hidden ? "👁" : "🚫"}</Mini>
                    <Mini onClick={() => { const n = window.prompt(tt(lang, "اسم الشخص", "שם האדם"), labelText(c.label, lang)); if (n != null) act(() => labelCluster(sel, c.id, n)); }} disabled={busy}>✎</Mini>
                    <Mini onClick={() => {
                      if (!mergeSrc) { setMergeSrc(c.id); }
                      else if (mergeSrc !== c.id) { const s = mergeSrc; setMergeSrc(null); act(() => mergeClusters(sel, s, c.id)); }
                    }} disabled={busy}>🔗</Mini>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {sel && detail?.error && <div className="card" style={{ padding: 16, color: C.red }}>{tt(lang, "فشل تحميل التفاصيل", "טעינת הפרטים נכשלה")}</div>}
      </div>
    </div>
  );
}

function labelText(label, lang) {
  if (label && typeof label === "object") return lang === "he" ? (label.he || label.ar || "") : (label.ar || label.he || "");
  return String(label || "");
}
function faceCenter(box) {
  if (!box) return "50% 50%";
  const cx = Math.min(1, Math.max(0, (box.x ?? 0) + (box.w ?? 1) / 2));
  const cy = Math.min(1, Math.max(0, (box.y ?? 0) + (box.h ?? 1) / 2));
  return `${cx * 100}% ${cy * 100}%`;
}
function Btn({ children, color, ...p }) {
  return <button {...p} style={{ background: "none", border: `1px solid ${color}`, color, borderRadius: 9, padding: "7px 11px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>{children}</button>;
}
function Mini({ children, ...p }) {
  return <button {...p} style={{ background: "rgba(255,255,255,.06)", border: "none", borderRadius: 6, padding: "3px 6px", cursor: "pointer", fontSize: 12 }}>{children}</button>;
}
