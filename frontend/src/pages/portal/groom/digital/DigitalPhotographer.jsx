// Digital invitation — Photographer area: multi-file upload + list with immediate preview.
import { useState, useEffect, useRef } from "react";
import { usePortal } from "../../../../context/PortalContext.jsx";
import {
  subscribePhotographerFiles, uploadPhotographerFile, removePhotographerFile,
  renamePhotographerFile,
  healPhotographerFiles,
  subscribeDigitalMedia, setPhotographerPublished,
} from "../../../../services/digitalInvitation.js";
import { getGallery, patchGallery } from "../../../../services/gallery.js";
import { runUploadQueue } from "@dawa/core/utils/uploadQueue.js";
import { logErr } from "../../../../utils/logger.js";
import { localizeApiError } from "../../../../utils/apiError.js";
import { load, save, removeKey } from "../../../../utils/storage.js";
import { C } from "../../../../styles/theme.js";
import { Num } from "../../../../components/Num.jsx";
import { getStoredUid } from "../../../../utils/tokenManager.js";
import { SkeletonList } from "../../../../components/Skeleton.jsx";
import { useListFilter } from "../../../../utils/searchFilter.js";
import { SearchBar } from "../../../../components/SearchBar.jsx";
import { FilterChips } from "../../../../components/FilterChips.jsx";

const cacheKey = (uid) => `dawa_photographer_${uid}`;

// Search + file-type chip config — module-level so the hook's memos hold.
const FILES_FIELDS = ["name"];
const FILES_PHONE = [];
const filesStatusOf = (f) => {
  const ty = String(f.type || "");
  return ty.startsWith("image/") ? "images" : ty.startsWith("video/") ? "videos" : "other";
};

// Mirror of MAX_PHOTOG_BYTES on the server (functions/src/constants/limits.ts).
// 2 GB ceiling — direct-to-Storage uploads have no function-memory limit.
const MAX_PHOTOG_BYTES = 2 * 1024 * 1024 * 1024;

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
  const { t, lang, currentUid, showToast, canUsePhotographer } = usePortal();
  const [files,      setFiles]      = useState([]);
  // Storage-listed files (authoritative for "what exists"). Firestore docs are
  // an optional metadata layer joined to these via storagePath.
  // Lazy-initialized from localStorage so the first paint is instant on reload.
  const [storageFiles, setStorageFiles] = useState(() => load(cacheKey(currentUid), []));
  // True while the first Storage scan is in flight
  const [loadingStorage, setLoadingStorage] = useState(true);
  const [uploading,  setUploading]  = useState(false);
  const [progress,   setProgress]   = useState(0); // 0..1 aggregate upload progress
  const [uploadedCount, setUploadedCount] = useState(0); // files finished this batch
  const [totalCount,    setTotalCount]    = useState(0); // files in the current batch
  const [deletingId, setDeletingId] = useState(null);
  const [editingId,  setEditingId]  = useState(null);
  const [editName,   setEditName]   = useState("");
  const [published,  setPublished]  = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [ackOpen,    setAckOpen]    = useState(false); // biometric-indexing ack modal
  const [ackChecked, setAckChecked] = useState(false);
  // Auto-send "your photos are ready" WhatsApp link to every guest on publish.
  const [autoSend,    setAutoSend]    = useState(false);
  const [autoSendBusy, setAutoSendBusy] = useState(false);
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
    // Load the auto-send-on-publish preference from the gallery config.
    getGallery(currentUid)
      .then((cfg) => setAutoSend(cfg?.autoSendOnPublish === true))
      .catch(() => {});
    return () => { u1(); u2(); };
  }, [currentUid]);

  const toggleAutoSend = async () => {
    const next = !autoSend;
    setAutoSendBusy(true);
    setAutoSend(next); // optimistic
    try {
      await patchGallery(currentUid, { autoSendOnPublish: next });
    } catch (err) {
      logErr("patchGallery autoSendOnPublish", err);
      setAutoSend(!next); // revert
      showToast(localizeApiError(err, lang));
    } finally {
      setAutoSendBusy(false);
    }
  };

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
    // Publishing turns on biometric face indexing for EVERYONE visible in the
    // photos (including non-registered guests) — require an explicit
    // acknowledgment first. Un-publishing needs no ack.
    if (!published) { setAckChecked(false); setAckOpen(true); return; }
    await applyPublish(false, false);
  };

  const applyPublish = async (next, ack) => {
    setPublishBusy(true);
    try {
      await setPhotographerPublished(currentUid, next, ack);
      showToast(next
        ? (lang === "he" ? "✓ הצילומים פורסמו" : "✓ تم نشر الصور")
        : (lang === "he" ? "הצילומים נמחקו מהפרסום" : "تم إلغاء نشر الصور"));
      setAckOpen(false);
    } catch (err) {
      logErr("setPhotographerPublished", err);
      showToast(localizeApiError(err, lang));
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
        ? `קבצים חורגים מ-2GB: ${names}`
        : `ملفات تتجاوز 2 غيغابايت: ${names}`);
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
    setUploadedCount(0);
    setTotalCount(arr.length);
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    // Aggregate per-file fractions into one 0..1 progress value.
    const fracs = new Array(arr.length).fill(0);
    const onFileProgress = (i) => (frac) => {
      fracs[i] = frac;
      setProgress(fracs.reduce((a, b) => a + b, 0) / fracs.length);
    };
    try {
      // Bounded-concurrency queue + per-file retry (see utils/uploadQueue.js) —
      // reliable for hundreds of photos where "fire everything at once" timed
      // out in the queue.
      const results = await runUploadQueue(
        arr,
        (f, i) => uploadPhotographerFile(uid, f, { signal: controller.signal, onProgress: onFileProgress(i) }),
        {
          signal: controller.signal,
          onRetryReset: (i) => onFileProgress(i)(0), // reset this file's bar before the retry
          onItemDone: () => setUploadedCount((c) => c + 1),
        },
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
      setUploadedCount(0);
      setTotalCount(0);
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
      showToast(localizeApiError(err, lang, "خطأ"));
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
      showToast(localizeApiError(err, lang, "خطأ"));
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

  // ── Search + file-type filter (runs on the full displayList; the rendered
  // list maps over `filtered`, the file-count line keeps the full total). ──
  const filesStatuses = [
    { key: "images", label: t("chip_files_images") },
    { key: "videos", label: t("chip_files_videos") },
    { key: "other",  label: t("chip_files_other") },
  ];
  const { query, setQuery, activeStatus, setActiveStatus, filtered, chips } =
    useListFilter(displayList, {
      fields: FILES_FIELDS, phoneFields: FILES_PHONE, lang,
      statusOf: filesStatusOf, statuses: filesStatuses, allLabel: t("filter_all"),
    });

  // Gated off by the admin → show a locked screen instead of the uploader.
  if (!canUsePhotographer) {
    return (
      <div style={{ animation: "fadeUp .3s ease", textAlign: "center", padding: "60px 24px" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🔒</div>
        <div style={{ fontSize: 19, fontWeight: 900, color: C.gold, fontFamily: "'Amiri','Frank Ruhl Libre','Amiri Fallback',serif", marginBottom: 8 }}>
          📸 {lang === "he" ? "אזור הצלם" : "منطقة المصور"}
        </div>
        <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.9, maxWidth: 420, margin: "0 auto" }}>
          {lang === "he"
            ? "אזור הצלם אינו מופעל בחשבונך. פנה לניהול כדי להפעיל אותו."
            : "منطقة المصوّر غير مُفعّلة لحسابك. تواصل مع الإدارة لتفعيلها."}
        </div>
      </div>
    );
  }

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>

      {/* Title */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 19, fontWeight: 900, color: C.gold, fontFamily: "'Amiri','Frank Ruhl Libre','Amiri Fallback',serif", marginBottom: 4 }}>
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
            <div style={{ fontSize: 12, color: C.goldDim, marginTop: 4 }}>
              <Num>{uploadedCount.toLocaleString("en")}</Num> / <Num>{totalCount.toLocaleString("en")}</Num>{" "}
              {lang === "he" ? "הועלו" : "تم رفعها"}
            </div>
            <div style={{ fontSize: 10, color: C.dim, marginTop: 6 }}>
              {lang === "he" ? "אפשר להעלות מאות תמונות — אל תסגור את העמוד" : "بتقدر ترفع مئات الصور — لا تغلق الصفحة"}
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

      {/* ── Biometric-indexing acknowledgment (DPIA lawful-basis gate) ──── */}
      {ackOpen && (
        <div onClick={() => !publishBusy && setAckOpen(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: "#15131a", border: "1px solid rgba(201,168,76,.35)", borderRadius: 16,
            padding: 24, maxWidth: 440, width: "100%",
          }}>
            <div style={{ fontSize: 32, textAlign: "center", marginBottom: 8 }}>🪪</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.gold, textAlign: "center", marginBottom: 12 }}>
              {lang === "he" ? "פרסום מפעיל זיהוי פנים" : "النشر يُفعّل التعرف على الوجوه"}
            </div>
            <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.9, marginBottom: 16 }}>
              {lang === "he"
                ? "פרסום הצילומים מנתח את כל הפנים הנראות בתמונות (כולל אורחים שאינם רשומים) באמצעות זיהוי פנים (AWS) כדי לאפשר חיפוש לפי אדם. החתימות נמחקות אוטומטית אחרי האירוע."
                : "نشر الصور يحلّل كل الوجوه الظاهرة في الصور (بما في ذلك ضيوف غير مسجّلين) عبر التعرف على الوجه (AWS) لتمكين البحث حسب الشخص. تُحذف التواقيع تلقائياً بعد الحفل."}
            </div>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: 12.5, color: C.dim, lineHeight: 1.7, marginBottom: 18 }}>
              <input type="checkbox" checked={ackChecked} onChange={(e) => setAckChecked(e.target.checked)}
                     style={{ marginTop: 3, flexShrink: 0, width: 16, height: 16, accentColor: C.gold, cursor: "pointer" }} />
              <span>{lang === "he"
                ? "אני מאשר שהמוזמנים יודעו שכל הפנים בתמונות מנותחות לצורך חיפוש."
                : "أؤكّد أن المعازيم أُبلغوا بأن كل الوجوه في الصور تُحلَّل لغرض البحث."}</span>
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setAckOpen(false)} disabled={publishBusy} style={{
                flex: 1, padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,.15)",
                background: "none", color: C.dim, cursor: "pointer", fontWeight: 700, fontSize: 13,
              }}>
                {lang === "he" ? "ביטול" : "إلغاء"}
              </button>
              <button onClick={() => applyPublish(true, true)} disabled={!ackChecked || publishBusy} style={{
                flex: 1, padding: "10px 14px", borderRadius: 10, border: "none", fontWeight: 800, fontSize: 13,
                background: "linear-gradient(135deg,#4cc97a,#2da85a)", color: "#fff",
                opacity: (!ackChecked || publishBusy) ? 0.5 : 1, cursor: (!ackChecked || publishBusy) ? "not-allowed" : "pointer",
              }}>
                {publishBusy ? "..." : (lang === "he" ? "📢 פרסם" : "📢 أنشر")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Auto-send photos to guests on publish ──────────────────────── */}
      <div style={{
        display: "flex", gap: 12, alignItems: "center",
        padding: "12px 14px", borderRadius: 12, marginBottom: 20,
        background: autoSend ? "rgba(76,201,122,.06)" : "rgba(255,255,255,.03)",
        border: `1px solid ${autoSend ? "rgba(76,201,122,.3)" : "rgba(255,255,255,.08)"}`,
      }}>
        <div style={{ fontSize: 22 }}>{autoSend ? "📲" : "✉️"}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: autoSend ? "#4cc97a" : C.gold, marginBottom: 2 }}>
            {lang === "he" ? "שליחה אוטומטית של התמונות בעת פרסום" : "إرسال الصور تلقائياً عند النشر"}
          </div>
          <div style={{ fontSize: 10, color: C.dim, lineHeight: 1.6 }}>
            {lang === "he"
              ? "כשתפרסם, כל מוזמן יקבל בוואטסאפ קישור לתמונות שלו (זיהוי פנים)."
              : "عند النشر، يصل كل مدعو رابط واتساب لصوره عبر التعرف على الوجه."}
          </div>
        </div>
        <button onClick={toggleAutoSend} disabled={autoSendBusy} style={{
          padding: "8px 14px", borderRadius: 10, cursor: autoSendBusy ? "wait" : "pointer",
          border: "none", fontWeight: 800, fontSize: 12, fontFamily: "inherit",
          background: autoSend ? "rgba(212,80,58,.14)" : "linear-gradient(135deg,#4cc97a,#2da85a)",
          color: autoSend ? C.red : "#fff", whiteSpace: "nowrap",
        }}>
          {autoSendBusy ? "..." :
            (autoSend
              ? (lang === "he" ? "כבה" : "إيقاف")
              : (lang === "he" ? "הפעל" : "تفعيل"))}
        </button>
      </div>

      {/* ── File list (RTDB confirmed + local pending) ─────────────────── */}
      <div style={{ fontSize: 13, fontWeight: 800, color: C.goldLight, marginBottom: 12 }}>
        {lang === "he" ? "קבצים שהועלו" : "الملفات المرفوعة"} (<Num>{displayList.length.toLocaleString("en")}</Num>)
      </div>

      {/* ── Search + file-type filter ──────────────────────────────────── */}
      {displayList.length > 0 && (
        <>
          <SearchBar
            value={query} onChange={setQuery} lang={lang}
            placeholder={t("search_files_placeholder")}
            resultCount={filtered.length} totalCount={displayList.length}
          />
          {chips.length > 0 && (
            <FilterChips options={chips} value={activeStatus} onChange={setActiveStatus} lang={lang} />
          )}
        </>
      )}

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
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 24, color: C.dim }}>
          {t("search_no_results")}
        </div>
      ) : (
        filtered.map(f => {
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
