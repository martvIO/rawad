// Digital invitation — Photographer area: multi-file upload + list with immediate preview.
import { useState, useEffect, useRef } from "react";
import { usePortal } from "../../../../context/PortalContext.jsx";
import {
  subscribePhotographerFiles, uploadPhotographerFile, removePhotographerFile,
} from "../../../../services/digitalInvitation.js";
import { logErr } from "../../../../utils/logger.js";
import { C } from "../../../../styles/theme.js";
import { auth } from "../../../../firebase.js";

const iconFor = (type = "") => {
  if (type.startsWith("image")) return "🖼";
  if (type.startsWith("video")) return "🎥";
  if (type.startsWith("audio")) return "🎵";
  if (type === "application/pdf") return "📄";
  return "📁";
};

const fmtDate = (ts, lang) => {
  if (!ts) return "";
  return new Date(ts).toLocaleString(lang === "he" ? "he-IL" : "ar-SA", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
};

export function DigitalPhotographer() {
  const { lang, currentUid, showToast } = usePortal();
  const [files,      setFiles]      = useState([]);
  const [uploading,  setUploading]  = useState(false);
  const [inProgress, setInProgress] = useState([]);
  const [deletingId, setDeletingId] = useState(null);
  // Local previews: shown immediately while uploading, before RTDB confirms
  const [pendingFiles, setPendingFiles] = useState([]); // [{ id, name, type, url, blobUrl }]
  const inputRef = useRef(null);

  useEffect(() => {
    if (!currentUid) return;
    return subscribePhotographerFiles(currentUid, setFiles);
  }, [currentUid]);

  // Clean up blob URLs when real RTDB files arrive
  useEffect(() => {
    if (pendingFiles.length === 0) return;
    const arrivedNames = new Set(files.map(f => f.name));
    const stillPending = pendingFiles.filter(p => !arrivedNames.has(p.name));
    if (stillPending.length !== pendingFiles.length) {
      pendingFiles
        .filter(p => arrivedNames.has(p.name))
        .forEach(p => URL.revokeObjectURL(p.blobUrl));
      setPendingFiles(stillPending);
    }
  }, [files]);

  const handleFiles = async (fileList) => {
    const arr = Array.from(fileList);
    if (!arr.length) return;

    // ── Immediate local previews — no auth needed ──
    const previews = arr.map(f => ({
      id:      `pending_${Date.now()}_${Math.random()}`,
      name:    f.name,
      type:    f.type,
      url:     URL.createObjectURL(f),
      pending: true,
      uploadedAt: null,
    }));
    setPendingFiles(prev => [...prev, ...previews]);

    // Auth fallback
    const uid = currentUid || auth.currentUser?.uid;
    if (!uid) {
      showToast(lang === "he" ? "אנא התחבר מחדש" : "يرجى إعادة تسجيل الدخول");
      return;
    }

    setUploading(true);
    setInProgress(arr.map(f => f.name));

    const results = await Promise.allSettled(arr.map(f => uploadPhotographerFile(uid, f)));
    const failed  = results.filter(r => r.status === "rejected");

    if (failed.length === 0) {
      showToast(lang === "he"
        ? `✓ הועלו ${arr.length} קבצים`
        : `✓ تم رفع ${arr.length.toLocaleString("en")} ملف`);
    } else {
      logErr("uploadPhotographerFiles", failed[0].reason);
      showToast(lang === "he"
        ? `נכשלה העלאה של ${failed.length} קבצים`
        : `فشل رفع ${failed.length} ملف`);
      // Clean up blobs for failed files only
      previews.forEach(p => URL.revokeObjectURL(p.url));
      setPendingFiles(prev => prev.filter(p => !previews.some(pf => pf.id === p.id)));
    }

    setUploading(false);
    setInProgress([]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const confirmDelete = async (id) => {
    try {
      await removePhotographerFile(currentUid, id);
      setDeletingId(null);
    } catch (err) {
      logErr("deletePhotographerFile", err);
      showToast(err?.message || "خطأ");
    }
  };

  // Merge: real RTDB files + pending (those not yet in RTDB)
  const realNames   = new Set(files.map(f => f.name));
  const displayList = [
    ...files,
    ...pendingFiles.filter(p => !realNames.has(p.name)),
  ];

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>

      {/* Title */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 19, fontWeight: 900, color: C.gold, fontFamily: "'Amiri',serif", marginBottom: 4 }}>
          📸 {lang === "he" ? "אזור הצלם" : "منطقة المصور"}
        </div>
        <div style={{ fontSize: 12, color: C.dim }}>
          {lang === "he"
            ? "העלה תמונות, וידאו וקבצים מצילומי האירוע"
            : "ارفع صوراً وفيديوهات وملفات من تصوير الحفل"}
        </div>
      </div>

      {/* ── Upload button ──────────────────────────────────────────────── */}
      <label style={{
        display: "block", padding: "36px 24px", borderRadius: 16, textAlign: "center",
        border: `2px dashed ${uploading ? "rgba(201,168,76,.65)" : "rgba(201,168,76,.32)"}`,
        background: uploading ? "rgba(201,168,76,.05)" : "rgba(201,168,76,.02)",
        cursor: uploading ? "not-allowed" : "pointer", marginBottom: 24,
        transition: "all .2s",
      }}>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.zip,.rar"
          style={{ display: "none" }}
          disabled={uploading}
          onChange={e => handleFiles(e.target.files)}
        />
        {uploading ? (
          <>
            <div style={{ fontSize: 44, marginBottom: 8 }}>⏳</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.gold, marginBottom: 6 }}>
              {lang === "he" ? "מעלה קבצים..." : "جاري رفع الملفات..."}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center", marginTop: 8 }}>
              {inProgress.map(n => (
                <span key={n} style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 20,
                  background: "rgba(201,168,76,.12)", color: C.goldDim,
                  maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{n}</span>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 52, marginBottom: 10 }}>📁</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: C.gold, marginBottom: 8 }}>
              {lang === "he" ? "העלה קבצים, תמונות ווידאו" : "تحميل الملفات والصور والفيديوهات"}
            </div>
            <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.8 }}>
              {lang === "he"
                ? "לחץ לבחירת קבצים — ניתן לבחור מספר קבצים בו זמנית"
                : "اضغط لاختيار الملفات — يمكن اختيار عدة ملفات في نفس الوقت"}
            </div>
          </>
        )}
      </label>

      {/* ── File list (RTDB confirmed + local pending) ─────────────────── */}
      <div style={{ fontSize: 13, fontWeight: 800, color: C.goldLight, marginBottom: 12 }}>
        {lang === "he" ? "קבצים שהועלו" : "الملفات المرفوعة"} ({displayList.length.toLocaleString("en")})
      </div>

      {displayList.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 28, color: C.dim }}>
          {lang === "he"
            ? "אין קבצים עדיין — העלה תמונות וסרטוני האירוע"
            : "لا يوجد ملفات بعد — ارفع صور وفيديوهات من الحفل"}
        </div>
      ) : (
        displayList.map(f => {
          const isDeleting = deletingId === f.id;
          const isPending  = !!f.pending;
          const isImage    = f.type?.startsWith("image");
          const isVideo    = f.type?.startsWith("video");

          return (
            <div key={f.id} style={{
              background: isPending ? "rgba(201,168,76,.04)" : "#0f0f15",
              border: `1px solid ${isPending ? "rgba(201,168,76,.2)" : "rgba(255,255,255,.07)"}`,
              borderRadius: 14, padding: "12px 14px", marginBottom: 8,
              transition: "background .3s",
            }}>
              {/* Media preview for images/videos */}
              {(isImage || isVideo) && f.url && (
                <div style={{ marginBottom: 8, borderRadius: 10, overflow: "hidden" }}>
                  {isVideo ? (
                    <video
                      src={f.url}
                      controls
                      style={{ width: "100%", maxHeight: 200, objectFit: "cover", display: "block", borderRadius: 10 }}
                    />
                  ) : (
                    <img
                      src={f.url}
                      alt={f.name}
                      style={{ width: "100%", maxHeight: 200, objectFit: "cover", display: "block", borderRadius: 10 }}
                    />
                  )}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ fontSize: 28, flexShrink: 0 }}>{iconFor(f.type)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: 800, color: C.goldLight, fontSize: 13, marginBottom: 2,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{f.name}</div>
                  <div style={{ fontSize: 10, color: C.dim }}>
                    {isPending
                      ? (lang === "he" ? "⏳ מעלה..." : "⏳ جاري الرفع...")
                      : fmtDate(f.uploadedAt, lang)}
                  </div>
                </div>
                {!isPending && (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <a href={f.url} target="_blank" rel="noreferrer" style={{
                      padding: "6px 10px", borderRadius: 8,
                      background: "rgba(75,159,212,.1)", border: "1px solid rgba(75,159,212,.25)",
                      color: C.blue, fontSize: 12, fontWeight: 700, textDecoration: "none",
                    }}>⬇</a>
                    {!isDeleting && (
                      <button onClick={() => setDeletingId(f.id)} style={{
                        padding: "6px 10px", borderRadius: 8,
                        background: "rgba(212,80,58,.08)", border: "1px solid rgba(212,80,58,.25)",
                        color: C.red, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                      }}>🗑</button>
                    )}
                  </div>
                )}
              </div>

              {isDeleting && (
                <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: C.red, flex: 1 }}>
                    {lang === "he" ? "למחוק?" : "حذف هذا الملف؟"}
                  </span>
                  <button onClick={() => confirmDelete(f.id)} style={{
                    padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                    background: "rgba(212,80,58,.2)", color: C.red, fontWeight: 700, fontSize: 12, fontFamily: "inherit",
                  }}>{lang === "he" ? "כן, מחק" : "نعم، احذف"}</button>
                  <button onClick={() => setDeletingId(null)} style={{
                    padding: "6px 12px", borderRadius: 8, cursor: "pointer",
                    border: "1px solid rgba(255,255,255,.1)", background: "none",
                    color: C.dim, fontWeight: 700, fontSize: 12, fontFamily: "inherit",
                  }}>{lang === "he" ? "ביטול" : "إلغاء"}</button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
