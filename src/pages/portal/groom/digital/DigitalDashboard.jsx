// Digital invitation — Dashboard: stats + background media upload.
import { useState, useEffect, useMemo, useRef } from "react";
import { usePortal } from "../../../../context/PortalContext.jsx";
import {
  subscribeDigitalGuests, subscribeDigitalMedia,
  saveDigitalMediaFile, removeDigitalMedia,
  getLatestDigitalMediaFromStorage, healDigitalMedia,
} from "../../../../services/digitalInvitation.js";
import { logErr } from "../../../../utils/logger.js";
import { C } from "../../../../styles/theme.js";
import { auth } from "../../../../firebase.js";

export function DigitalDashboard() {
  const { lang, currentUid, showToast } = usePortal();
  const [guests,        setGuests]        = useState([]);
  const [media,         setMedia]         = useState(null);
  const [uploading,     setUploading]     = useState(false);
  // Immediate local preview shown while the file is uploading (blob URL)
  const [localPreview,  setLocalPreview]  = useState(null); // { url, type } | null
  // Confirmed remote URL stored directly from upload response (no subscription dependency)
  const [confirmedMedia, setConfirmedMedia] = useState(null); // { url, type } | null
  // Storage-direct fallback — surfaces a previously-uploaded file even when the
  // Firestore metadata layer is silent (pre-deploy orphan or transient error).
  const [storageMedia,   setStorageMedia]   = useState(null); // { url, type, storagePath } | null
  const localBlobRef = useRef(null);
  const healedRef = useRef(false);

  useEffect(() => {
    if (!currentUid) return;
    const u1 = subscribeDigitalGuests(currentUid, setGuests);
    const u2 = subscribeDigitalMedia(currentUid, (m) => {
      setMedia(m);
      // If subscription fires with valid data, clear our local confirmed copy
      if (m?.backgroundUrl) setConfirmedMedia(null);
    });
    return () => { u1(); u2(); };
  }, [currentUid]);

  // Storage-direct scan — runs once per uid. Reads the latest object in
  // digitalMedia/{uid}/ and shows it as a fallback when Firestore has nothing.
  useEffect(() => {
    if (!currentUid) return;
    let cancelled = false;
    (async () => {
      const s = await getLatestDigitalMediaFromStorage(currentUid);
      if (!cancelled) setStorageMedia(s);
    })();
    return () => { cancelled = true; };
  }, [currentUid]);

  // Auto-heal — once both layers settle, write a Firestore doc for the latest
  // Storage object if Firestore is missing it.
  useEffect(() => {
    if (!currentUid || healedRef.current || !storageMedia) return;
    healedRef.current = true;
    healDigitalMedia(currentUid, storageMedia, media).catch(() => {});
  }, [currentUid, storageMedia, media]);

  const stats = useMemo(() => {
    const total     = guests.length;
    const attending = guests.filter(g => g.status === "attending").length;
    const absent    = guests.filter(g => g.status === "absent").length;
    const pending   = guests.filter(g => g.status === "pending").length;
    return { total, attending, absent, pending };
  }, [guests]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // ── Immediate local preview — no auth needed, pure client-side ──
    if (localBlobRef.current) URL.revokeObjectURL(localBlobRef.current);
    const blobUrl = URL.createObjectURL(file);
    localBlobRef.current = blobUrl;
    setLocalPreview({ url: blobUrl, type: file.type.startsWith("video") ? "video" : "image" });

    // Auth fallback: use auth.currentUser.uid if React state lags
    const uid = currentUid || auth.currentUser?.uid;
    if (!uid) {
      showToast(lang === "he" ? "אנא התחבר מחדש" : "يرجى إعادة تسجيل الدخول");
      return;
    }

    setUploading(true);
    try {
      const { url, type } = await saveDigitalMediaFile(uid, file);
      // Store confirmed URL directly — no subscription dependency
      setConfirmedMedia({ url, type });
      setLocalPreview(null);
      URL.revokeObjectURL(blobUrl);
      localBlobRef.current = null;
      // Refresh Storage-direct fallback so it tracks the new upload
      getLatestDigitalMediaFromStorage(uid).then(setStorageMedia).catch(() => {});
      showToast(lang === "he" ? "✓ הועלה בהצלחה" : "✓ تم الرفع بنجاح");
    } catch (err) {
      logErr("uploadDigitalMedia", err);
      showToast(err?.message || (lang === "he" ? "שגיאה בהעלאה" : "فشل الرفع"));
      // Keep localPreview on error so user can still see their selected file
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleRemove = async () => {
    setLocalPreview(null);
    setConfirmedMedia(null);
    setStorageMedia(null); // prevent the Storage-direct fallback from resurfacing
    if (localBlobRef.current) { URL.revokeObjectURL(localBlobRef.current); localBlobRef.current = null; }
    try { await removeDigitalMedia(currentUid); setMedia(null); }
    catch (err) { logErr("removeDigitalMedia", err); }
  };

  // Priority: localPreview (blob during upload) > confirmedMedia (upload response)
  //           > Firestore subscription > Storage-direct fallback > nothing
  const display = localPreview
    ?? confirmedMedia
    ?? (media?.backgroundUrl ? { url: media.backgroundUrl, type: media.backgroundType } : null)
    ?? (storageMedia ? { url: storageMedia.url, type: storageMedia.type } : null);

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>

      {/* ── الميديا الاحتفالية ──────────────────────────────────────────── */}
      <div style={{ marginBottom: 22 }}>
        {display ? (
          <div style={{ position: "relative", borderRadius: 16, overflow: "hidden" }}>
            {display.type === "video" ? (
              <video
                src={display.url}
                autoPlay muted loop playsInline
                style={{ width: "100%", maxHeight: 340, objectFit: "cover", display: "block" }}
              />
            ) : (
              <img
                src={display.url}
                alt="background"
                style={{ width: "100%", maxHeight: 340, objectFit: "cover", display: "block" }}
              />
            )}
            {/* Uploading overlay */}
            {uploading && (
              <div style={{
                position: "absolute", inset: 0, display: "flex",
                alignItems: "center", justifyContent: "center",
                background: "rgba(0,0,0,.45)", backdropFilter: "blur(2px)",
              }}>
                <div style={{ color: "#fff", fontSize: 14, fontWeight: 800 }}>
                  {lang === "he" ? "⏳ מעלה..." : "⏳ جاري الرفع..."}
                </div>
              </div>
            )}
            {!uploading && (
              <div style={{
                position: "absolute", bottom: 0, insetInline: 0,
                padding: "14px 14px 12px",
                background: "linear-gradient(transparent, rgba(0,0,0,.72))",
                display: "flex", gap: 8,
              }}>
                <label style={{
                  flex: 1, padding: "8px 0", borderRadius: 8, textAlign: "center",
                  background: "rgba(255,255,255,.14)", backdropFilter: "blur(4px)",
                  color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}>
                  <input type="file" accept="image/*,image/gif,video/*" style={{ display: "none" }} onChange={handleUpload} />
                  {lang === "he" ? "🔄 החלף" : "🔄 استبدال"}
                </label>
                <button onClick={handleRemove} style={{
                  flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
                  background: "rgba(212,80,58,.45)", backdropFilter: "blur(4px)",
                  color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}>
                  {lang === "he" ? "✕ הסר" : "✕ إزالة"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <label style={{
            display: "block", borderRadius: 16,
            border: `2px dashed ${uploading ? "rgba(75,159,212,.7)" : "rgba(75,159,212,.28)"}`,
            background: uploading ? "rgba(75,159,212,.04)" : "rgba(75,159,212,.02)",
            padding: "44px 24px", textAlign: "center", cursor: "pointer",
            transition: "all .2s",
          }}>
            <input type="file" accept="image/*,image/gif,video/*" style={{ display: "none" }} onChange={handleUpload} />
            <div style={{ fontSize: 56, marginBottom: 12 }}>{uploading ? "⏳" : "🎬"}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.blue, marginBottom: 8 }}>
              {uploading
                ? (lang === "he" ? "מעלה..." : "جاري الرفع...")
                : (lang === "he" ? "הוסף תמונה / GIF / וידאו" : "أضف صورة / GIF / فيديو")}
            </div>
            <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.8 }}>
              {lang === "he"
                ? "תמונה, GIF, או וידאו חגיגי יוצג כרקע בולט בלוח הבקרה"
                : "صورة أو GIF أو فيديو احتفالي يظهر كعنصر بارز في لوحة التحكم"}
            </div>
          </label>
        )}
      </div>

      {/* ── الإحصائيات ─────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: lang === "he" ? "סה״כ מוזמנים" : "الإجمالي",  val: stats.total,     color: C.goldLight, icon: "📋" },
          { label: lang === "he" ? "נוכחים"        : "حضور",      val: stats.attending, color: "#4cc97a",   icon: "✓" },
          { label: lang === "he" ? "נעדרים"         : "غياب",      val: stats.absent,    color: C.red,       icon: "✗" },
          { label: lang === "he" ? "טרם ענו"        : "لم يرد",   val: stats.pending,   color: C.gold,      icon: "⌛" },
        ].map(s => (
          <div key={s.label} className="card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 26 }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 900, color: s.color }}>{s.val.toLocaleString("en")}</div>
              <div style={{ fontSize: 11, color: C.dim }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── شريط نسبة الحضور ───────────────────────────────────────────── */}
      {stats.total > 0 && (
        <div className="gold-card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: C.goldDim, fontWeight: 700 }}>
              {lang === "he" ? "אחוז נוכחות" : "نسبة الحضور"}
            </span>
            <span style={{ fontSize: 20, fontWeight: 900, color: "#4cc97a" }}>
              {Math.round(stats.attending / stats.total * 100)}%
            </span>
          </div>
          <div style={{ height: 10, background: "rgba(255,255,255,.06)", borderRadius: 5, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${Math.round(stats.attending / stats.total * 100)}%`,
              background: "linear-gradient(90deg,#4cc97a,#2da85a)",
              borderRadius: 5, transition: "width .6s ease",
            }}/>
          </div>
        </div>
      )}
    </div>
  );
}
