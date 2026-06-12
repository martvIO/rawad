// Digital invitation — Photographer area: multi-file upload + list with immediate preview.
import { useState, useEffect, useRef } from "react";
import { usePortal } from "../../../../context/PortalContext.jsx";
import {
  subscribePhotographerFiles, uploadPhotographerFile, removePhotographerFile,
  renamePhotographerFile,
  healPhotographerFiles,
  subscribeDigitalMedia, setPhotographerPublished,
} from "../../../../services/digitalInvitation.js";
import { logErr } from "../../../../utils/logger.js";
import { load, save, removeKey } from "../../../../utils/storage.js";
import { C } from "../../../../styles/theme.js";
import { Num } from "../../../../components/Num.jsx";
import { getStoredUid } from "../../../../utils/tokenManager.js";
import { SkeletonList } from "../../../../components/Skeleton.jsx";

const cacheKey = (uid) => `dawa_photographer_${uid}`;

// Mirror of MAX_PHOTOG_BYTES on the server (functions/src/constants/limits.ts).
// 200 MB ceiling matches the multipart parser limit.
const MAX_PHOTOG_BYTES = 200 * 1024 * 1024;

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
    numberingSystem: "latn",
  });
};

export function DigitalPhotographer() {
  const { lang, currentUid, showToast } = usePortal();
  const [files,      setFiles]      = useState([]);
  // Storage-listed files (authoritative for "what exists"). Firestore docs are
  // an optional metadata layer joined to these via storagePath.
  // Lazy-initialized from localStorage so the first paint is instant on reload.
  const [storageFiles, setStorageFiles] = useState(() => load(cacheKey(currentUid), []));
  // True while the first Storage scan is in flight
  const [loadingStorage, setLoadingStorage] = useState(true);
  const [uploading,  setUploading]  = useState(false);
  const [progress,   setProgress]   = useState(0); // 0..1 aggregate upload progress
  const [inProgress, setInProgress] = useState([]);
  const [deletingId, setDeletingId] = useState(null);
  const [editingId,  setEditingId]  = useState(null);
  const [editName,   setEditName]   = useState("");
  const [published,  setPublished]  = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  // Local previews: shown immediately while uploading, before RTDB confirms
  const [pendingFiles, setPendingFiles] = useState([]); // [{ id, name, type, url, blobUrl }]
  const inputRef = useRef(null);
  const healedRef = useRef(false);
  // Abort in-flight uploads on unmount so pending state can't strand.
  const uploadAbortRef = useRef(null);
  // BUG-O002 — ids of files we just uploaded whose Firestore doc the poller
  // hasn't yet echoed back. Each pending entry is spliced into a poll
  // result that omits its id and removed once the server confirms it. A
  // poll that started before the upload but resolved after the optimistic
  // merge would otherwise wipe out the just-uploaded file.
  const pendingFilesRef = useRef(new Map()); // id -> file record
  useEffect(() => () => { if (uploadAbortRef.current) uploadAbortRef.current.abort(); }, []);

  useEffect(() => {
    if (!currentUid) return;
    const onErr = (err) => showToast(`✗ ${err?.code || err?.message || "read failed"}`);
    const u1 = subscribePhotographerFiles(currentUid, setFiles, onErr, mergePendingFiles);
    const u2 = subscribeDigitalMedia(currentUid, (d) => setPublished(d?.photographerPublished === true), onErr);
    return () => { u1(); u2(); };
  }, [currentUid]);

  // Splice any optimistic uploads the poll result is missing; drop entries
  // the server has now echoed.
  function mergePendingFiles(serverList) {
    const pending = pendingFilesRef.current;
    if (pending.size === 0) return serverList;
    const serverIds = new Set(serverList.map(f => f.id).filter(Boolean));
    const missing = [];
    for (const [id, rec] of pending) {
      if (serverIds.has(id)) pending.delete(id);
      else missing.push(rec);
    }
    if (missing.length === 0) return serverList;
    return [...missing, ...serverList];
  }

  // Files come exclusively from the Firestore subscription; Storage listing
  // is a no-op stub. Flip loadingStorage off immediately so the skeleton
  // loader resolves on the first subscription result rather than hanging.
  useEffect(() => {
    setLoadingStorage(false);
  }, [currentUid]);

  // Auto-heal — once both Firestore and Storage have reported in, create
  // Firestore docs for any Storage objects that lack metadata. Runs at most
  // once per session; the next Firestore snapshot picks up the new docs.
  useEffect(() => {
    if (!currentUid || healedRef.current || storageFiles.length === 0) return;
    healedRef.current = true;
    healPhotographerFiles(currentUid, storageFiles, files).catch(() => {});
  }, [currentUid, storageFiles, files]);

  const togglePublish = async () => {
    setPublishBusy(true);
    try {
      await setPhotographerPublished(currentUid, !published);
      showToast(!published
        ? (lang === "he" ? "✓ הצילומים פורסמו" : "✓ تم نشر الصور")
        : (lang === "he" ? "הצילומים נמחקו מהפרסום" : "تم إلغاء نشر الصور"));
    } catch (err) {
      logErr("setPhotographerPublished", err);
      showToast(err?.message || (lang === "he" ? "שגיאה" : "خطأ"));
    } finally {
      setPublishBusy(false);
    }
  };

  // Safety net: clean up any pending blobs whose name now exists in confirmed files
  // (handles the rare case where a file arrived via subscription without going
  //  through our handleFiles flow — e.g. another device uploaded simultaneously).
  useEffect(() => {
    if (pendingFiles.length === 0) return;
    const arrivedNames = new Set(files.map(f => f.name));
    const stillPending = pendingFiles.filter(p => !arrivedNames.has(p.name));
    if (stillPending.length !== pendingFiles.length) {
      pendingFiles
        .filter(p => arrivedNames.has(p.name))
        .forEach(p => URL.revokeObjectURL(p.url));
      setPendingFiles(stillPending);
    }
  }, [files]);

  const handleFiles = async (fileList) => {
    let arr = Array.from(fileList);
    if (!arr.length) return;

    // Client-side size guard. The server enforces the same cap, but rejecting
    // locally avoids a 200 MB POST that ends in 413 — particularly painful on
    // a mobile connection.
    const oversized = arr.filter(f => f.size > MAX_PHOTOG_BYTES);
    if (oversized.length) {
      const names = oversized.map(f => f.name).join("، ");
      showToast(lang === "he"
        ? `קבצים חורגים מ-200MB: ${names}`
        : `ملفات تتجاوز 200 MB: ${names}`);
      arr = arr.filter(f => f.size <= MAX_PHOTOG_BYTES);
      if (!arr.length) return;
    }

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
    const uid = currentUid || getStoredUid();
    if (!uid) {
      showToast(lang === "he" ? "אנא התחבר מחדש" : "يرجى إعادة تسجيل الدخول");
      // Clean up the previews we just added
      previews.forEach(p => URL.revokeObjectURL(p.url));
      setPendingFiles(prev => prev.filter(p => !previews.some(pf => pf.id === p.id)));
      return;
    }

    setUploading(true);
    setProgress(0);
    setInProgress(arr.map(f => f.name));
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    // Aggregate per-file fractions into one 0..1 progress value.
    const fracs = new Array(arr.length).fill(0);
    const onFileProgress = (i) => (frac) => {
      fracs[i] = frac;
      setProgress(fracs.reduce((a, b) => a + b, 0) / fracs.length);
    };
    try {
      const results = await Promise.allSettled(
        arr.map((f, i) => uploadPhotographerFile(uid, f, { signal: controller.signal, onProgress: onFileProgress(i) })),
      );

      // Always revoke + clear every preview so pending state can't strand.
      previews.forEach(p => URL.revokeObjectURL(p.url));
      const previewIds = new Set(previews.map(p => p.id));
      setPendingFiles(prev => prev.filter(p => !previewIds.has(p.id)));

      // Optimistic merge — splice every successful upload into `files`
      // right away so the gallery shows the new entries the moment the
      // request resolves, instead of waiting up to 15s for the next poll.
      // pendingFilesRef keeps these visible if a mid-flight poll resolves
      // late and would otherwise overwrite them with stale data (BUG-O002).
      const uploaded = results
        .filter(r => r.status === "fulfilled")
        .map(r => r.value)
        .filter(rec => rec && rec.id);
      if (uploaded.length) {
        for (const rec of uploaded) {
          pendingFilesRef.current.set(rec.id, rec);
        }
        setFiles(prev => {
          const knownIds = new Set(prev.map(f => f.id).filter(Boolean));
          const fresh = uploaded.filter(rec => !knownIds.has(rec.id));
          return fresh.length === 0 ? prev : [...fresh, ...prev];
        });
      }

      const failedResults = results.filter(r => r.status === "rejected");
      if (failedResults.length === 0) {
        showToast(lang === "he"
          ? `✓ הועלו ${arr.length} קבצים`
          : `✓ تم رفع ${arr.length.toLocaleString("en")} ملف`);
      } else {
        const reason = failedResults[0].reason;
        logErr("uploadPhotographerFiles", reason);
        const isTimeout = reason?.message === "request_timeout";
        const isAbort = reason?.name === "AbortError";
        if (!isAbort) {
          showToast(
            isTimeout
              ? (lang === "he" ? "פג זמן ההעלאה — נסה שוב" : "انتهت مهلة الرفع — حاول مرة أخرى")
              : (lang === "he"
                  ? `נכשלה העלאה של ${failedResults.length} קבצים`
                  : `فشل رفع ${failedResults.length} ملف`),
          );
        }
      }
    } finally {
      uploadAbortRef.current = null;
      setUploading(false);
      setProgress(0);
      setInProgress([]);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const confirmDelete = async (item) => {
    try {
      await removePhotographerFile(currentUid, item.id);
      // Drop from pending-uploads so a poll mid-delete can't resurrect the
      // entry via the optimistic merge. (BUG-O002)
      pendingFilesRef.current.delete(item.id);
      // Remove from local files immediately — don't wait for the next poll.
      setFiles(prev => prev.filter(f => f.id !== item.id));
      // Refresh Storage list so the deleted entry disappears from the merge
      setStorageFiles(prev => {
        const next = prev.filter(s => s.storagePath !== (item.storagePath || item.id));
        if (next.length) save(cacheKey(currentUid), next);
        else             removeKey(cacheKey(currentUid));
        return next;
      });
      setDeletingId(null);
    } catch (err) {
      logErr("deletePhotographerFile", err);
      showToast(err?.message || "خطأ");
    }
  };

  const startRename = (f) => {
    setEditingId(f.id);
    setEditName(f.name);
    setDeletingId(null);
  };

  const saveRename = async () => {
    const trimmed = editName.trim();
    if (!trimmed) {
      showToast(lang === "he" ? "שם לא יכול להיות ריק" : "الاسم لا يمكن أن يكون فارغاً");
      return;
    }
    try {
      await renamePhotographerFile(currentUid, editingId, trimmed);
      // Optimistic update — onSnapshot will reconcile
      setFiles(prev => prev.map(f => f.id === editingId ? { ...f, name: trimmed } : f));
      setEditingId(null);
    } catch (err) {
      logErr("renamePhotographerFile", err);
      showToast(err?.message || "خطأ");
    }
  };

  // Merge: Firestore (with custom names + uploadedAt) ∪ Storage-only (orphans) +
  // pending uploads. Firestore wins where storagePath matches — preserves user
  // edits like renames. Storage-only entries surface so files are never hidden.
  const firestoreByPath = new Map(files.map(f => [f.storagePath, f]).filter(([k]) => k));
  const merged = [...files];
  for (const s of storageFiles) {
    if (!firestoreByPath.has(s.storagePath)) merged.push(s);
  }
  // Sort newest first by uploadedAt (Firestore items keep theirs; Storage items
  // got an inferred timestamp from the filename prefix)
  merged.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
  const realNames   = new Set(merged.map(f => f.name));
  const displayList = [
    ...merged,
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
              {(lang === "he" ? "מעלה קבצים..." : "جاري رفع الملفات...")} {Math.round(progress * 100)}%
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

      {/* ── أنشر الصور — toggle (controls is_published flag) ───────────── */}
      <div style={{
        display: "flex", gap: 12, alignItems: "center",
        padding: "12px 14px", borderRadius: 12, marginBottom: 20,
        background: published ? "rgba(76,201,122,.06)" : "rgba(201,168,76,.06)",
        border: `1px solid ${published ? "rgba(76,201,122,.3)" : "rgba(201,168,76,.3)"}`,
      }}>
        <div style={{ fontSize: 22 }}>{published ? "✓" : "🔒"}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: published ? "#4cc97a" : C.gold, marginBottom: 2 }}>
            {published
              ? (lang === "he" ? "הצילומים פורסמו" : "الصور منشورة")
              : (lang === "he" ? "הצילומים לא פורסמו" : "الصور غير منشورة")}
          </div>
          <div style={{ fontSize: 10, color: C.dim, lineHeight: 1.6 }}>
            {published
              ? (lang === "he" ? "המוזמנים יכולים למצוא את תמונותיהם בעמוד הדיגיטלי" : "يستطيع المعازيم إيجاد صورهم في صفحة الدعوة")
              : (lang === "he" ? "פרסם כדי לאפשר זיהוי פנים למוזמנים" : "انشر لتمكين التعرف على الوجوه للمعازيم")}
          </div>
        </div>
        <button onClick={togglePublish} disabled={publishBusy} style={{
          padding: "8px 14px", borderRadius: 10, cursor: publishBusy ? "wait" : "pointer",
          border: "none", fontWeight: 800, fontSize: 12, fontFamily: "inherit",
          background: published
            ? "rgba(212,80,58,.14)"
            : "linear-gradient(135deg,#4cc97a,#2da85a)",
          color: published ? C.red : "#fff",
          whiteSpace: "nowrap",
        }}>
          {publishBusy ? "..." :
            (published
              ? (lang === "he" ? "ביטול פרסום" : "إلغاء النشر")
              : (lang === "he" ? "📢 פרסם" : "📢 أنشر الصور"))}
        </button>
      </div>

      {/* ── File list (RTDB confirmed + local pending) ─────────────────── */}
      <div style={{ fontSize: 13, fontWeight: 800, color: C.goldLight, marginBottom: 12 }}>
        {lang === "he" ? "קבצים שהועלו" : "الملفات المرفوعة"} (<Num>{displayList.length.toLocaleString("en")}</Num>)
      </div>

      {displayList.length === 0 ? (
        loadingStorage ? (
          <SkeletonList count={3}/>
        ) : (
          <div className="card" style={{ textAlign: "center", padding: 28, color: C.dim }}>
            {lang === "he"
              ? "אין קבצים עדיין — העלה תמונות וסרטוני האירוע"
              : "لا يوجد ملفات بعد — ارفع صور وفيديوهات من الحفل"}
          </div>
        )
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
                  {editingId === f.id ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setEditingId(null); }}
                      autoFocus
                      style={{
                        width: "100%", fontSize: 13, fontWeight: 800,
                        padding: "4px 8px", borderRadius: 6,
                        background: "rgba(201,168,76,.08)", border: "1px solid rgba(201,168,76,.4)",
                        color: C.goldLight, fontFamily: "inherit",
                      }}
                    />
                  ) : (
                    <div style={{
                      fontWeight: 800, color: C.goldLight, fontSize: 13, marginBottom: 2,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{f.name}</div>
                  )}
                  <div style={{ fontSize: 10, color: C.dim }}>
                    {isPending
                      ? (lang === "he" ? "⏳ מעלה..." : "⏳ جاري الرفع...")
                      : fmtDate(f.uploadedAt, lang)}
                  </div>
                </div>
                {!isPending && (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {editingId === f.id ? (
                      <>
                        <button onClick={saveRename} style={{
                          padding: "6px 10px", borderRadius: 8,
                          background: "rgba(76,201,122,.12)", border: "1px solid rgba(76,201,122,.35)",
                          color: "#4cc97a", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                        }}>💾</button>
                        <button onClick={() => setEditingId(null)} style={{
                          padding: "6px 10px", borderRadius: 8,
                          background: "none", border: "1px solid rgba(255,255,255,.1)",
                          color: C.dim, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                        }}>✕</button>
                      </>
                    ) : (
                      <>
                        <a href={f.url} target="_blank" rel="noreferrer" style={{
                          padding: "6px 10px", borderRadius: 8,
                          background: "rgba(75,159,212,.1)", border: "1px solid rgba(75,159,212,.25)",
                          color: C.blue, fontSize: 12, fontWeight: 700, textDecoration: "none",
                        }}>⬇</a>
                        <button onClick={() => startRename(f)} title={lang === "he" ? "ערוך שם" : "تعديل الاسم"} style={{
                          padding: "6px 10px", borderRadius: 8,
                          background: "rgba(201,168,76,.12)", border: "1px solid rgba(201,168,76,.3)",
                          color: C.gold, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                        }}>✎</button>
                        {!isDeleting && (
                          <button onClick={() => setDeletingId(f.id)} style={{
                            padding: "6px 10px", borderRadius: 8,
                            background: "rgba(212,80,58,.08)", border: "1px solid rgba(212,80,58,.25)",
                            color: C.red, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                          }}>🗑</button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {isDeleting && (
                <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: C.red, flex: 1 }}>
                    {lang === "he" ? "למחוק?" : "حذف هذا الملف؟"}
                  </span>
                  <button onClick={() => confirmDelete(f)} style={{
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
