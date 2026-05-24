// Digital invitation — Dashboard: stats + multi-media gallery + wedding date.
import { useState, useEffect, useMemo, useRef } from "react";
import { usePortal } from "../../../../context/PortalContext.jsx";
import {
  subscribeDigitalGuests, subscribeDigitalMedia,
  addInvitationMedia, removeInvitationMedia, setWeddingDate,
  setGuestRanks,
} from "../../../../services/digitalInvitation.js";
import { logErr } from "../../../../utils/logger.js";
import { C } from "../../../../styles/theme.js";
import { getStoredUid } from "../../../../utils/tokenManager.js";

const tt = (lang, ar, he) => (lang === "he" ? he : ar);

// Convert epoch ms ⇄ <input type="datetime-local"> value (in user's local zone).
function epochToInputValue(epoch) {
  if (!epoch) return "";
  const d = new Date(epoch);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function inputValueToEpoch(v) {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

export function DigitalDashboard() {
  const { lang, currentUid, showToast } = usePortal();
  const [guests, setGuests] = useState([]);
  const [doc,    setDoc]    = useState(null);     // full invitation doc
  const [busy,   setBusy]   = useState(false);
  // Pending uploads — shown in the gallery while uploading completes.
  const [pendingMedia, setPendingMedia] = useState([]); // [{ id, url, kind, pending: true }]
  const [newRank, setNewRank] = useState("");
  const inputRef = useRef(null);
  // Abort controller for in-flight uploads. Aborted on unmount so a pending
  // upload can't leave the spinner stranded if the user navigates away.
  const uploadAbortRef = useRef(null);

  useEffect(() => {
    if (!currentUid) return;
    const onErr = (err) => showToast(`✗ ${err?.code || err?.message || "read failed"}`);
    const u1 = subscribeDigitalGuests(currentUid, setGuests, onErr);
    const u2 = subscribeDigitalMedia(currentUid, setDoc, onErr);
    return () => { u1(); u2(); };
  }, [currentUid]);

  // Abort any uploads in flight when the component unmounts so revoked blob
  // URLs are reclaimed and pending state isn't applied to a dead component.
  useEffect(() => () => {
    if (uploadAbortRef.current) uploadAbortRef.current.abort();
  }, []);

  const stats = useMemo(() => {
    const total     = guests.length;
    const attending = guests.filter(g => g.status === "attending").length;
    const absent    = guests.filter(g => g.status === "absent").length;
    const pending   = guests.filter(g => g.status === "pending").length;
    return { total, attending, absent, pending };
  }, [guests]);

  const media = doc?.media || [];

  // ── Media upload ─────────────────────────────────────────────────────────────
  const handleAddMedia = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (inputRef.current) inputRef.current.value = "";

    // Build immediate previews so the gallery shows the upload progress.
    const previews = files.map(f => ({
      id:          `pending_${Date.now()}_${Math.random()}`,
      url:         URL.createObjectURL(f),
      kind:        f.type.startsWith("video") ? "video" : f.type === "image/gif" ? "gif" : "image",
      pending:     true,
    }));
    setPendingMedia(prev => [...prev, ...previews]);

    const uid = currentUid || getStoredUid();
    if (!uid) {
      showToast(tt(lang, "يرجى إعادة تسجيل الدخول", "אנא התחבר מחדש"));
      previews.forEach(p => URL.revokeObjectURL(p.url));
      setPendingMedia(prev => prev.filter(p => !previews.some(pp => pp.id === p.id)));
      return;
    }

    setBusy(true);
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    const results = await Promise.allSettled(
      files.map(f => addInvitationMedia(uid, f, { signal: controller.signal })),
    );
    uploadAbortRef.current = null;
    setBusy(false);

    // Always clear pending previews so the spinner can't strand if a request
    // hangs and is later resolved by the abort path. Revoke every blob URL
    // because none of them are still in use — the media[] poll repopulates
    // the gallery with server-hosted URLs.
    previews.forEach(p => URL.revokeObjectURL(p.url));
    setPendingMedia(prev => prev.filter(p => !previews.some(pp => pp.id === p.id)));

    const failedResults = results.filter(r => r.status === "rejected");
    if (failedResults.length) {
      const reason = failedResults[0].reason;
      logErr("addInvitationMedia", reason);
      const isTimeout = reason?.message === "request_timeout";
      const isAbort = reason?.name === "AbortError";
      if (!isAbort) {
        showToast(
          isTimeout
            ? tt(lang, "انتهت مهلة الرفع — حاول مرة أخرى", "פג זמן ההעלאה — נסה שוב")
            : reason?.message || tt(lang, "فشل الرفع", "ההעלאה נכשלה"),
        );
      }
    } else {
      showToast(tt(lang, "✓ تم الرفع", "✓ הועלה"));
    }
  };

  const handleRemoveMedia = async (item) => {
    try {
      await removeInvitationMedia(currentUid, item);
    } catch (err) {
      logErr("removeInvitationMedia", err);
      showToast(err?.message || tt(lang, "خطأ", "שגיאה"));
    }
  };

  // ── Guest ranks ──────────────────────────────────────────────────────────────
  const ranks = doc?.guestRanks || [];
  const handleAddRank = async () => {
    const v = newRank.trim();
    if (!v) return;
    if (ranks.includes(v)) {
      showToast(tt(lang, "موجود مسبقاً", "כבר קיים"));
      setNewRank("");
      return;
    }
    try {
      await setGuestRanks(currentUid, [...ranks, v]);
      setNewRank("");
    } catch (err) {
      logErr("setGuestRanks", err);
      showToast(err?.message || tt(lang, "خطأ", "שגיאה"));
    }
  };
  const handleRemoveRank = async (r) => {
    try {
      await setGuestRanks(currentUid, ranks.filter(x => x !== r));
    } catch (err) {
      logErr("setGuestRanks", err);
      showToast(err?.message || tt(lang, "خطأ", "שגיאה"));
    }
  };

  // ── Wedding date ─────────────────────────────────────────────────────────────
  const handleDateChange = async (e) => {
    const epoch = inputValueToEpoch(e.target.value);
    try {
      await setWeddingDate(currentUid, epoch);
      showToast(tt(lang, "✓ تم حفظ التاريخ", "✓ התאריך נשמר"));
    } catch (err) {
      logErr("setWeddingDate", err);
      showToast(err?.message || tt(lang, "خطأ", "שגיאה"));
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  const galleryItems = [...media, ...pendingMedia];

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>

      {/* ── معرض الوسائط ─────────────────────────────────────────── */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.goldLight, marginBottom: 10 }}>
          🎬 {tt(lang, "وسائط الدعوة", "מדיית ההזמנה")}
          <span style={{ fontSize: 11, color: C.dim, fontWeight: 600, marginInlineStart: 8 }}>
            ({media.length.toLocaleString("en")})
          </span>
        </div>
        <div style={{ fontSize: 11, color: C.dim, marginBottom: 12, lineHeight: 1.7 }}>
          {tt(lang,
            "ارفع عدة صور / فيديوهات / GIF — ستظهر للضيوف على صفحة الدعوة",
            "העלה מספר תמונות / סרטונים / GIF — יוצגו לאורחים בעמוד ההזמנה")}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))", gap: 8 }}>
          {galleryItems.map((m, i) => (
            <MediaTile key={m.storagePath || m.id || i} item={m}
                       onRemove={m.pending ? null : () => handleRemoveMedia(m)} />
          ))}

          {/* Add tile */}
          <label style={{
            aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center",
            flexDirection: "column", gap: 4,
            background: busy ? "rgba(75,159,212,.06)" : "rgba(75,159,212,.03)",
            border: `2px dashed ${busy ? "rgba(75,159,212,.65)" : "rgba(75,159,212,.32)"}`,
            borderRadius: 12, cursor: busy ? "wait" : "pointer", transition: "all .2s",
          }}>
            <input ref={inputRef} type="file" multiple style={{ display: "none" }}
                   accept="image/*,image/gif,video/*"
                   disabled={busy} onChange={handleAddMedia}/>
            <div style={{ fontSize: 28 }}>{busy ? "⏳" : "➕"}</div>
            <div style={{ fontSize: 10, color: C.blue, fontWeight: 800 }}>
              {busy ? tt(lang, "جاري الرفع", "מעלה") : tt(lang, "أضف", "הוסף")}
            </div>
          </label>
        </div>
      </div>

      {/* ── تاريخ الزفاف ─────────────────────────────────────────── */}
      <div className="gold-card" style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.goldLight, marginBottom: 6 }}>
          📅 {tt(lang, "تاريخ ووقت الزفاف", "תאריך ושעת החתונה")}
        </div>
        <div style={{ fontSize: 11, color: C.dim, marginBottom: 10, lineHeight: 1.7 }}>
          {tt(lang,
            "سيتم استخدامه للعد التنازلي في صفحة الدعوة",
            "ישמש לעד-לאחור בעמוד ההזמנה")}
        </div>
        <input
          type="datetime-local"
          className="input-field"
          value={epochToInputValue(doc?.weddingDate)}
          onChange={handleDateChange}
          style={{ direction: "ltr", textAlign: "right" }}
        />
        {doc?.weddingDate && (
          <div style={{ fontSize: 11, color: C.gold, marginTop: 8 }}>
            {new Date(doc.weddingDate).toLocaleString(lang === "he" ? "he-IL" : "ar-SA", {
              weekday: "long", year: "numeric", month: "long", day: "numeric",
              hour: "2-digit", minute: "2-digit",
            })}
          </div>
        )}
      </div>

      {/* ── رتب المدعوين ─────────────────────────────────────────── */}
      <div className="gold-card" style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.goldLight, marginBottom: 6 }}>
          🏷 {tt(lang, "رتب المدعوين", "רמות מוזמנים")}
        </div>
        <div style={{ fontSize: 11, color: C.dim, marginBottom: 10, lineHeight: 1.7 }}>
          {tt(lang,
            "أضف رتباً مخصصة (مثل «العرس فقط»، «العرس والزيانة») لتختار منها عند إضافة مدعو",
            "הוסף רמות מותאמות אישית (כגון «רק החתונה», «החתונה והכרעה») לבחירה בעת הוספת מוזמן")}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            className="input-field"
            value={newRank}
            onChange={e => setNewRank(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleAddRank(); }}
            placeholder={tt(lang, "اسم الرتبة", "שם הרמה")}
            style={{ flex: 1 }}
          />
          <button onClick={handleAddRank} className="gold-btn"
                  style={{ padding: "8px 16px", fontSize: 12, whiteSpace: "nowrap" }}
                  disabled={!newRank.trim()}>
            ➕ {tt(lang, "إضافة", "הוסף")}
          </button>
        </div>
        {ranks.length === 0 ? (
          <div style={{ fontSize: 11, color: C.dim, fontStyle: "italic", textAlign: "center", padding: "8px 0" }}>
            {tt(lang, "لا توجد رتب بعد", "אין רמות עדיין")}
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ranks.map(r => (
              <div key={r} style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "6px 6px 6px 12px", borderRadius: 999,
                background: "rgba(201,168,76,.08)",
                border: "1px solid rgba(201,168,76,.3)",
                fontSize: 12, color: C.goldLight, fontWeight: 700,
              }}>
                <span>{r}</span>
                <button onClick={() => handleRemoveRank(r)}
                        title={tt(lang, "حذف", "מחק")}
                        style={{
                          background: "rgba(212,80,58,.15)",
                          border: "none",
                          color: C.red,
                          width: 20, height: 20, borderRadius: 999,
                          fontSize: 11, fontWeight: 900, cursor: "pointer",
                          fontFamily: "inherit", lineHeight: 1, padding: 0,
                        }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── الإحصائيات ─────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: tt(lang, "الإجمالي", "סה״כ מוזמנים"), val: stats.total,     color: C.goldLight, icon: "📋" },
          { label: tt(lang, "حضور",     "נוכחים"),        val: stats.attending, color: "#4cc97a",   icon: "✓" },
          { label: tt(lang, "غياب",     "נעדרים"),        val: stats.absent,    color: C.red,       icon: "✗" },
          { label: tt(lang, "لم يرد",   "טרם ענו"),       val: stats.pending,   color: C.gold,      icon: "⌛" },
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

      {stats.total > 0 && (
        <div className="gold-card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: C.goldDim, fontWeight: 700 }}>
              {tt(lang, "نسبة الحضور", "אחוז נוכחות")}
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

function MediaTile({ item, onRemove }) {
  const isVideo = item.kind === "video";
  return (
    <div style={{
      position: "relative", aspectRatio: "1", borderRadius: 12, overflow: "hidden",
      border: `1px solid ${item.pending ? "rgba(201,168,76,.3)" : "rgba(255,255,255,.08)"}`,
      background: "#0f0f15",
    }}>
      {isVideo ? (
        <video src={item.url} muted playsInline
               style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
      ) : (
        <img src={item.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
      )}
      {item.kind === "gif" && (
        <span style={{
          position: "absolute", top: 6, insetInlineStart: 6,
          background: "rgba(0,0,0,.65)", color: "#fff",
          fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 5,
        }}>GIF</span>
      )}
      {isVideo && (
        <span style={{
          position: "absolute", top: 6, insetInlineStart: 6,
          background: "rgba(0,0,0,.65)", color: "#fff",
          fontSize: 11, padding: "1px 6px", borderRadius: 5,
        }}>▶</span>
      )}
      {item.pending && (
        <div style={{
          position: "absolute", inset: 0, background: "rgba(0,0,0,.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontSize: 11, fontWeight: 800,
        }}>⏳</div>
      )}
      {onRemove && (
        <button onClick={onRemove} style={{
          position: "absolute", top: 4, insetInlineEnd: 4,
          width: 24, height: 24, padding: 0, borderRadius: 12,
          background: "rgba(0,0,0,.65)", border: "none", color: "#fff",
          fontSize: 12, fontWeight: 900, cursor: "pointer", fontFamily: "inherit",
        }}>✕</button>
      )}
    </div>
  );
}
