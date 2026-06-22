// Digital invitation — Dashboard: stats + multi-media gallery + wedding date.
//
// ── Optimistic-mutation convention ───────────────────────────────────────────
// `doc` state is fed by subscribeDigitalMedia(), which polls every 15s
// (POLL_MS.DIGITAL). Any handler that mutates the doc on the server MUST
// also reflect the change in local `doc` state immediately after the server
// confirms the write, otherwise the UI appears broken for up to 15 seconds.
//
// Pattern:
//   try {
//     await someService(currentUid, nextValue);
//     setDoc(prev => ({ ...(prev || {}), field: nextValue }));
//   } catch (err) {
//     logErr("someService", err);
//     showToast(err?.message || tt(lang, "خطأ", "שגיאה"));
//     // DO NOT update local state on failure — the input should snap back.
//   }
//
// ── Poll-vs-optimistic race ──────────────────────────────────────────────────
// BUG-O002 — the poller's GET races against in-flight uploads. If a poll
// starts before an upload but resolves after the optimistic merge, it
// overwrites local state with the pre-upload snapshot and the just-uploaded
// file appears to vanish until the next poll. We defend against this by
// tracking storagePaths/ids of recently-confirmed uploads in pendingPathsRef
// and splicing them back into poll results that don't include them yet.
//
// Edge cases this prevents (see known_bugs.md BUG-001/002/003/004):
//   • New photos vanishing for 15s after upload before the poller refreshes.
//   • New photos vanishing because a mid-flight poll stomped optimistic state.
//   • Wedding date input appearing to "reject" the user's selection.
//   • Newly-added guest ranks not showing up in the badge list.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useMemo, useRef } from "react";
import { usePortal } from "../../../../context/PortalContext.jsx";
import {
  subscribeDigitalGuests, subscribeDigitalMedia,
  addInvitationMedia, removeInvitationMedia, setWeddingDate,
  setGuestRanks,
} from "../../../../services/digitalInvitation.js";
import { logErr } from "../../../../utils/logger.js";
import { localizeApiError } from "../../../../utils/apiError.js";
import { C } from "../../../../styles/theme.js";
import { Icon } from "../../../../components/icons/Icon.jsx";
import { Num } from "../../../../components/Num.jsx";
import { getStoredUid } from "../../../../utils/tokenManager.js";
import { useListFilter } from "../../../../utils/searchFilter.js";
import { SearchBar } from "../../../../components/SearchBar.jsx";
import { FilterChips } from "../../../../components/FilterChips.jsx";
import { OnboardingChecklist } from "../../../../components/OnboardingChecklist.jsx";

const tt = (lang, ar, he) => (lang === "he" ? he : ar);

// Search/filter wiring for the guest-messages list (module-level for stable
// identity, so useListFilter's memoization holds across renders).
const MSG_FIELDS = ["name", (g) => g.note];
const MSG_PHONE = [];
const msgStatusOf = (g) => g.status;

// Mirror of MAX_INVITE_MEDIA_BYTES on the server (functions/src/constants/limits.ts).
// Kept in sync manually — keeping a single number out of @dawa/shared isn't worth
// the build wiring.
const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
const ALLOWED_MEDIA_PREFIX = /^(image|video)\//;

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
  const { lang, currentUid, showToast, canSeeAttendance } = usePortal();
  const [guests, setGuests] = useState([]);
  const [doc,    setDoc]    = useState(null);     // full invitation doc
  const [busy,   setBusy]   = useState(false);
  const [progress, setProgress] = useState(0);    // 0..1 aggregate upload progress
  // Pending uploads — shown in the gallery while uploading completes.
  const [pendingMedia, setPendingMedia] = useState([]); // [{ id, url, kind, pending: true }]
  const [newRank, setNewRank] = useState("");
  const inputRef = useRef(null);
  // Abort controller for in-flight uploads. Aborted on unmount so a pending
  // upload can't leave the spinner stranded if the user navigates away.
  const uploadAbortRef = useRef(null);
  // BUG-O002 — storagePaths of media items we've optimistically merged but
  // the poller hasn't echoed yet. Anything still in this set is spliced
  // back into a poll result that omits it (i.e. the poll started before
  // our upload committed). Cleared once the server echoes the path, or
  // when an explicit delete removes the entry.
  const pendingPathsRef = useRef(new Map()); // storagePath -> item

  useEffect(() => {
    if (!currentUid) return;
    const onErr = (err) => showToast(`✗ ${err?.code || err?.message || "read failed"}`);
    const u1 = subscribeDigitalGuests(currentUid, setGuests, onErr);
    const u2 = subscribeDigitalMedia(currentUid, setDoc, onErr, mergePendingMedia);
    return () => { u1(); u2(); };
  }, [currentUid]);

  // Splice any optimistic items the poll result doesn't yet contain.
  // Items confirmed by the server (path appears in serverDoc.media) are
  // dropped from the pending map — we no longer need to inject them.
  function mergePendingMedia(serverDoc) {
    const pending = pendingPathsRef.current;
    if (pending.size === 0) return serverDoc;
    const serverMedia = Array.isArray(serverDoc?.media) ? serverDoc.media : [];
    const serverPaths = new Set(serverMedia.map(m => m?.storagePath).filter(Boolean));
    const missing = [];
    for (const [path, item] of pending) {
      if (serverPaths.has(path)) pending.delete(path);
      else missing.push(item);
    }
    if (missing.length === 0) return serverDoc;
    return { ...(serverDoc || {}), media: [...serverMedia, ...missing] };
  }

  // Abort any uploads in flight when the component unmounts so revoked blob
  // URLs are reclaimed and pending state isn't applied to a dead component.
  useEffect(() => () => {
    if (uploadAbortRef.current) uploadAbortRef.current.abort();
  }, []);

  const stats = useMemo(() => {
    const total     = guests.length;
    const attendingGuests = guests.filter(g => g.status === "attending");
    const attending = attendingGuests.length;
    const absent    = guests.filter(g => g.status === "absent").length;
    const pending   = guests.filter(g => g.status === "pending").length;
    // Expected attendees = each attending invitee + however many companions
    // they said are coming with them.
    const expectedAttendees = attendingGuests.reduce(
      (sum, g) => sum + 1 + (Number(g.companions) > 0 ? Number(g.companions) : 0),
      0,
    );
    return { total, attending, absent, pending, expectedAttendees };
  }, [guests]);

  const media = doc?.media || [];

  // ── Media upload ─────────────────────────────────────────────────────────────
  const handleAddMedia = async (e) => {
    let files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (inputRef.current) inputRef.current.value = "";

    // Client-side validation — reject before allocating blob URLs / hitting
    // the network. The server enforces the same limits, but rejecting locally
    // saves the user a 50 MB POST that ends in 413.
    const rejected = files.filter(
      f => f.size > MAX_MEDIA_BYTES || !ALLOWED_MEDIA_PREFIX.test(f.type),
    );
    if (rejected.length) {
      const names = rejected.map(f => f.name).join("، ");
      showToast(tt(
        lang,
        `ملفات غير مقبولة (الحجم أو النوع): ${names}`,
        `קבצים לא תקינים (גודל/סוג): ${names}`,
      ));
      files = files.filter(
        f => f.size <= MAX_MEDIA_BYTES && ALLOWED_MEDIA_PREFIX.test(f.type),
      );
      if (!files.length) return;
    }

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
    setProgress(0);
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    // Aggregate per-file fractions into one 0..1 progress value.
    const fracs = new Array(files.length).fill(0);
    const onFileProgress = (i) => (frac) => {
      fracs[i] = frac;
      setProgress(fracs.reduce((a, b) => a + b, 0) / fracs.length);
    };
    const results = await Promise.allSettled(
      files.map((f, i) => addInvitationMedia(uid, f, { signal: controller.signal, onProgress: onFileProgress(i) })),
    );
    uploadAbortRef.current = null;
    setBusy(false);
    setProgress(0);

    // BUG-001 fix — optimistic merge.
    // The dashboard refreshes via a 15s poller, so without this step the
    // freshly-uploaded items would visibly disappear (the pending tile is
    // removed below) and only re-appear on the next poll tick. We splice the
    // server's response into doc.media right away so the gallery stays in
    // sync the moment the request resolves.
    //
    // Defensive checks here matter because:
    //   • A malformed/empty response would crash the MediaTile render.
    //   • If the poller fired mid-upload, the item may already be in media[]
    //     under the same storagePath — we must dedupe.
    const uploaded = results
      .filter(r => r.status === "fulfilled")
      .map(r => r.value)
      .filter(item =>
        item && typeof item.url === "string" && typeof item.storagePath === "string",
      );

    if (uploaded.length) {
      // Register every fresh path as pending. Any poll that ran during the
      // upload window and resolves AFTER this merge would otherwise wipe
      // these items out — pendingPathsRef.current keeps them visible until
      // the server actually echoes them back. (BUG-O002)
      for (const item of uploaded) {
        pendingPathsRef.current.set(item.storagePath, item);
      }
      setDoc(prev => {
        const existing = Array.isArray(prev?.media) ? prev.media : [];
        const knownPaths = new Set(existing.map(m => m?.storagePath).filter(Boolean));
        const fresh = uploaded.filter(item => !knownPaths.has(item.storagePath));
        if (fresh.length === 0) return prev;          // poller already had them
        return { ...(prev || {}), media: [...existing, ...fresh] };
      });
    }

    // Always clear pending previews so the spinner can't strand if a request
    // hangs and is later resolved by the abort path. Revoke every blob URL
    // because none of them are still in use — the doc.media merge above (or
    // the next poll tick on failure) is now the source of truth.
    previews.forEach(p => URL.revokeObjectURL(p.url));
    setPendingMedia(prev => prev.filter(p => !previews.some(pp => pp.id === p.id)));

    const failedResults = results.filter(r => r.status === "rejected");
    if (failedResults.length) {
      const reason = failedResults[0].reason;
      logErr("addInvitationMedia", reason);
      const isTimeout = reason?.message === "request_timeout";
      const isAbort = reason?.name === "AbortError";
      if (!isAbort) {
        // Surface a partial-success message when some files made it through
        // so users aren't misled into thinking the whole batch failed.
        const partial = uploaded.length > 0;
        const msg = isTimeout
          ? tt(lang, "انتهت مهلة الرفع — حاول مرة أخرى", "פג זמן ההעלאה — נסה שוב")
          : reason?.message || tt(lang, "فشل الرفع", "ההעלאה נכשלה");
        showToast(partial
          ? `${msg} (${uploaded.length}/${files.length})`
          : msg);
      }
    } else if (uploaded.length) {
      showToast(tt(lang, "✓ تم الرفع", "✓ הועלה"));
    }
  };

  const handleRemoveMedia = async (item) => {
    // Same optimistic-mutation pattern as upload: prune from local state once
    // the server confirms the delete so the tile vanishes immediately instead
    // of lingering for up to 15s until the poller refreshes.
    if (!item?.storagePath) return;
    try {
      await removeInvitationMedia(currentUid, item);
      // Drop from pending-paths so a poll mid-delete doesn't resurrect it
      // by spliceing the optimistic entry back in. (BUG-O002)
      pendingPathsRef.current.delete(item.storagePath);
      setDoc(prev => {
        const existing = Array.isArray(prev?.media) ? prev.media : [];
        return {
          ...(prev || {}),
          media: existing.filter(m => m?.storagePath !== item.storagePath),
        };
      });
    } catch (err) {
      logErr("removeInvitationMedia", err);
      showToast(localizeApiError(err, lang, tt(lang, "خطأ", "שגיאה")));
    }
  };

  // ── Guest ranks ──────────────────────────────────────────────────────────────
  // BUG-004 fix — optimistic write.
  // setGuestRanks PATCHes the server doc, but the displayed list reads from
  // doc.guestRanks which is only refreshed by the 15s poller. We mirror the
  // write into local state immediately so newly-added/removed ranks appear
  // without delay. The server clamps to MAX_RANK_ITEMS and dedupes, so we
  // replicate the same client-side trimming to avoid drift between optimistic
  // state and what actually persists.
  const ranks = doc?.guestRanks || [];

  // Mirror the server-side limits from functions/src/api/routes/digital.ts
  // (MAX_RANK_ITEMS) and functions/src/constants/limits.ts (GUEST_RANK) so
  // local state can't diverge from what would actually persist.
  const MAX_RANK_ITEMS = 32;
  const MAX_RANK_LEN = 60;

  const handleAddRank = async () => {
    const v = newRank.trim();
    if (!v) return;
    if (v.length > MAX_RANK_LEN) {
      showToast(tt(lang, "الاسم طويل جداً", "השם ארוך מדי"));
      return;
    }
    if (ranks.includes(v)) {
      showToast(tt(lang, "موجود مسبقاً", "כבר קיים"));
      setNewRank("");
      return;
    }
    if (ranks.length >= MAX_RANK_ITEMS) {
      showToast(tt(lang, "وصلت الحد الأقصى", "הגעת למקסימום"));
      return;
    }

    const next = [...ranks, v];
    try {
      await setGuestRanks(currentUid, next);
      // Only update local state after the PATCH succeeds — otherwise a failed
      // network call would leave the UI showing a rank that doesn't exist.
      setDoc(prev => ({ ...(prev || {}), guestRanks: next }));
      setNewRank("");
    } catch (err) {
      logErr("setGuestRanks", err);
      showToast(localizeApiError(err, lang, tt(lang, "خطأ", "שגיאה")));
    }
  };

  const handleRemoveRank = async (r) => {
    // Guard against double-clicks or stale closure: only proceed if r is
    // actually in the current list.
    if (!ranks.includes(r)) return;
    const next = ranks.filter(x => x !== r);
    try {
      await setGuestRanks(currentUid, next);
      setDoc(prev => ({ ...(prev || {}), guestRanks: next }));
    } catch (err) {
      logErr("setGuestRanks", err);
      showToast(localizeApiError(err, lang, tt(lang, "خطأ", "שגיאה")));
    }
  };

  // ── Wedding date ─────────────────────────────────────────────────────────────
  // BUG-003 fix — optimistic write.
  // The <input type="datetime-local"> is a controlled input bound to
  // `doc?.weddingDate`. Without the local setDoc() below, the displayed
  // value would snap back to the old date until the next 15s poll tick,
  // making the picker feel broken. We update local state immediately AFTER
  // the server confirms the write so a rejected/network-failed save never
  // leaves the UI lying about persisted state.
  const handleDateChange = async (e) => {
    const raw = e.target.value;
    const epoch = inputValueToEpoch(raw);

    // If the user clears the field we save `null` to clear the server value
    // too. If the user types something the browser can't parse (rare with
    // datetime-local but possible via paste), bail without hitting the API.
    if (raw && epoch === null) {
      showToast(tt(lang, "تاريخ غير صالح", "תאריך לא תקין"));
      return;
    }

    try {
      await setWeddingDate(currentUid, epoch);
      setDoc(prev => ({ ...(prev || {}), weddingDate: epoch ?? null }));
      showToast(tt(lang, "✓ تم حفظ التاريخ", "✓ התאריך נשמר"));
    } catch (err) {
      logErr("setWeddingDate", err);
      showToast(localizeApiError(err, lang, tt(lang, "خطأ", "שגיאה")));
      // Intentionally do NOT update setDoc on failure — the input will fall
      // back to the prior server value, which is the correct UX.
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  const galleryItems = [...media, ...pendingMedia];

  // ── Guest-messages search + RSVP filter ───────────────────────────────────────
  // Only guests who actually left a note are in the messages list; run the
  // shared list-filter over that subset so the SearchBar/FilterChips counts and
  // the rendered messages stay in sync. (The stats cards above keep using the
  // full `guests`/`stats` — only this list is filtered.)
  const messageGuests = guests.filter(g => g.note && g.note.trim());
  const msgStatuses = [
    { key: "attending", label: tt(lang, "سيحضر", "מגיע") },
    { key: "absent",    label: tt(lang, "اعتذر", "התנצל") },
    { key: "pending",   label: tt(lang, "لم يرد", "טרם ענה") },
  ];
  const {
    query: msgQuery, setQuery: setMsgQuery,
    activeStatus: msgStatus, setActiveStatus: setMsgStatus,
    filtered: filteredMessages, chips: msgChips,
  } = useListFilter(messageGuests, {
    fields: MSG_FIELDS, phoneFields: MSG_PHONE, lang,
    statusOf: msgStatusOf, statuses: msgStatuses,
    allLabel: tt(lang, "الكل", "הכל"),
  });

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>

      {/* ── First-run onboarding — shown until the basics are in place ─── */}
      {(guests.length === 0 || media.length === 0) && (
        <OnboardingChecklist
          title={tt(lang, "ابدأ بثلاث خطوات", "מתחילים ב-3 צעדים")}
          steps={[
            { label: tt(lang, "أضف قائمة المدعوين", "הוסיפו את רשימת המוזמנים"), done: guests.length > 0 },
            { label: tt(lang, "أضف صور وفيديو لدعوتك", "הוסיפו תמונות ווידאו להזמנה"), done: media.length > 0 },
            { label: tt(lang, "صمّم دعوتك من تبويب «التصميم» وأرسلها للاعتماد", "עצבו את ההזמנה בלשונית העיצוב ושלחו לאישור"), done: false },
          ]}
          note={tt(lang,
            "بعد اعتماد التصميم، يتولّى فريق دعوة إرسال الدعوات للمدعوين عبر واتساب — لا حاجة لإرسالها بنفسك.",
            "לאחר אישור העיצוב, צוות דעוה שולח את ההזמנות למוזמנים בוואטסאפ — אין צורך לשלוח בעצמכם.")}
        />
      )}

      {/* ── معرض الوسائط ─────────────────────────────────────────── */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.goldLight, marginBottom: 10 }}>
          🎬 {tt(lang, "وسائط الدعوة", "מדיית ההזמנה")}
          <span style={{ fontSize: 11, color: C.dim, fontWeight: 600, marginInlineStart: 8 }}>
            (<Num>{media.length.toLocaleString("en")}</Num>)
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
              {busy ? `${Math.round(progress * 100)}%` : tt(lang, "أضف", "הוסף")}
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
            <Num dir="auto">{new Date(doc.weddingDate).toLocaleString(lang === "he" ? "he-IL" : "ar-SA", {
              weekday: "long", year: "numeric", month: "long", day: "numeric",
              hour: "2-digit", minute: "2-digit",
              numberingSystem: "latn",
            })}</Num>
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

      {/* ── الإحصائيات (تُعرض فقط إذا فعّل الأدمن ميزة الحضور لهذا العريس) ── */}
      {canSeeAttendance ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12, marginBottom: 20 }}>
            {[
              { label: tt(lang, "الإجمالي", "סה״כ מוזמנים"), val: stats.total,     color: C.goldLight, iconName: "list" },
              { label: tt(lang, "حضور",     "נוכחים"),        val: stats.attending, color: "#4cc97a",   iconName: "check" },
              { label: tt(lang, "غياب",     "נעדרים"),        val: stats.absent,    color: C.red,       iconName: "x" },
              { label: tt(lang, "لم يرد",   "טרם ענו"),       val: stats.pending,   color: C.gold,      iconName: "hourglass" },
            ].map(s => (
              <div key={s.label} className="card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ display: "flex", color: s.color }}><Icon name={s.iconName} size={26} /></div>
                <div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: s.color }}><Num>{s.val.toLocaleString("en")}</Num></div>
                  <div style={{ fontSize: 11, color: C.dim }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {stats.expectedAttendees > 0 && (
            <div className="gold-card" data-testid="digital-expected-attendees" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <div style={{ fontSize: 26 }}>👥</div>
              <div>
                <div style={{ fontSize: 26, fontWeight: 900, color: C.gold }}><Num>{stats.expectedAttendees.toLocaleString("en")}</Num></div>
                <div style={{ fontSize: 11, color: C.dim }}>{tt(lang, "العدد المتوقع للحضور (مع المرافقين)", "צפי נוכחים (כולל מלווים)")}</div>
              </div>
            </div>
          )}

          {stats.total > 0 && (
            <div className="gold-card" style={{ marginBottom: 20 }}>
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
        </>
      ) : (
        <div className="gold-card" style={{ textAlign: "center", padding: 24, color: C.dim, lineHeight: 1.8, marginBottom: 20 }}>
          🔒 {tt(lang, "عرض الحضور غير مُفعّل لحسابك — تواصل مع الإدارة لتفعيله.", "תצוגת הנוכחות אינה מופעלת בחשבונך — פנה לניהול להפעלה.")}
        </div>
      )}

      {/* RSVP messages to the couple — visible ONLY to the groom here (الرئيسية). */}
      {guests.some(g => g.note && g.note.trim()) && (
        <div className="gold-card" style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, color: C.goldDim, fontWeight: 700, marginBottom: 12 }}>
            💌 {tt(lang, "رسائل المعزومين للعروسين", "ברכות המוזמנים לזוג")}
          </div>

          <SearchBar value={msgQuery} onChange={setMsgQuery} lang={lang}
                     placeholder={tt(lang, "ابحث في الرسائل…", "חיפוש בברכות…")}
                     resultCount={filteredMessages.length} totalCount={messageGuests.length} />
          {msgChips.length > 0 && (
            <FilterChips options={msgChips} value={msgStatus} onChange={setMsgStatus} lang={lang} />
          )}

          {msgQuery.trim() && filteredMessages.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: 24, color: C.dim }}>
              {tt(lang, "لا توجد نتائج", "אין תוצאות")}
            </div>
          ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {filteredMessages.map(g => (
              <div key={g.id} style={{
                padding: "10px 12px", borderRadius: 10,
                background: "rgba(255,255,255,.03)", border: "1px solid rgba(201,168,76,.18)",
              }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: C.goldLight, marginBottom: 4 }}>
                  {g.name}
                  {g.status === "attending" && <span style={{ marginInlineStart: 8, fontSize: 10, color: "#4cc97a" }}>✓ {tt(lang, "سيحضر", "מגיע")}</span>}
                  {g.status === "absent" && <span style={{ marginInlineStart: 8, fontSize: 10, color: C.red }}>✗ {tt(lang, "اعتذر", "התנצל")}</span>}
                </div>
                <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{g.note}</div>
              </div>
            ))}
          </div>
          )}
          <div style={{ fontSize: 10, color: C.dim, marginTop: 8 }}>
            {tt(lang, "تظهر لك فقط — لا تظهر للمدعوين", "מוצג רק לך — לא למוזמנים")}
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
        <button onClick={onRemove} aria-label="حذف" title="حذف" style={{
          position: "absolute", top: 4, insetInlineEnd: 4,
          width: 24, height: 24, padding: 0, borderRadius: 12,
          background: "rgba(0,0,0,.65)", border: "none", color: "#fff",
          fontSize: 12, fontWeight: 900, cursor: "pointer", fontFamily: "inherit",
        }}>✕</button>
      )}
    </div>
  );
}
