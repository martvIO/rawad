// Digital invitation — guest list.
// Style mirrors GroomGuests (handwritten section).
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { usePortal } from "../../../../context/PortalContext.jsx";
import {
  subscribeDigitalGuests, updateDigitalGuest, removeDigitalGuest,
  subscribeDigitalMedia, subscribeDesigns,
} from "../../../../services/digitalInvitation.js";
import { logErr } from "../../../../utils/logger.js";
import { localizeApiError } from "../../../../utils/apiError.js";
import { C } from "../../../../styles/theme.js";
import { Icon } from "../../../../components/icons/Icon.jsx";
import { Num } from "../../../../components/Num.jsx";
import { useListFilter } from "../../../../utils/searchFilter.js";
import { SearchBar } from "../../../../components/SearchBar.jsx";
import { toCsv, downloadCsv } from "../../../../utils/csv.js";
import { FilterChips } from "../../../../components/FilterChips.jsx";

// Groom-facing design label (localized { ar, he } or plain string).
function designTitle(d, lang) {
  const t = d?.title;
  const v = t && typeof t === "object" ? (t[lang === "he" ? "he" : "ar"] || t.ar || t.he) : t;
  return (v || "").trim() || (lang === "he" ? "עיצוב" : "تصميم");
}

/**
 * Normalize the rank shape: new guests carry `ranks: string[]`, legacy
 * guests carry `rank: string`. The list view treats both uniformly.
 */
function getGuestRanks(g) {
  if (Array.isArray(g?.ranks)) return g.ranks;
  if (g?.rank) return [g.rank];
  return [];
}

const STATUS_CFG = {
  pending:   { iconName: "hourglass", label_ar: "لم يرد",   label_he: "טרם ענה",   bg: "rgba(201,168,76,.15)", color: C.gold    },
  attending: { iconName: "check",     label_ar: "حضور",      label_he: "מגיע",      bg: "rgba(76,201,122,.15)", color: "#4cc97a" },
  absent:    { iconName: "x",         label_ar: "غياب",      label_he: "לא מגיע",   bg: "rgba(212,80,58,.15)",  color: "#d4533a" },
};
const CYCLE = ["pending", "attending", "absent"];

// ── Search/filter specs (module-level for stable identity — see useListFilter) ──
const GUEST_FIELDS = ["name", (g) => g.ranks, (g) => g.rank];
const GUEST_PHONE  = ["phone"];
const guestStatusOf = (g) => g.status;

export function DigitalGuests() {
  const { t, lang, currentUid, showToast, canSeeAttendance } = usePortal();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [guests,         setGuests]         = useState([]);
  const [editingId,      setEditingId]      = useState(null);
  const [editName,       setEditName]       = useState("");
  const [editPhone,      setEditPhone]      = useState("");
  const [editRanks,      setEditRanks]      = useState([]); // chip-picker state during inline edit
  const [editDesignId,   setEditDesignId]   = useState(""); // assigned design during inline edit
  const [revealedId,     setRevealedId]     = useState(null); // guest pending delete confirm
  const [availableRanks, setAvailableRanks] = useState([]);   // master list from parent invite doc
  const [designs,        setDesigns]        = useState([]);   // groom's designs (for per-guest assignment)

  // Master rank list — needed for the chip picker shown in edit mode and
  // for filtering out stale ranks before rendering chips on each guest.
  useEffect(() => {
    if (!currentUid) return;
    return subscribeDigitalMedia(currentUid, (d) => setAvailableRanks(d?.guestRanks || []));
  }, [currentUid]);

  // Designs list — drives the per-guest design picker (only approved designs
  // can be assigned, since only approved designs can be sent).
  useEffect(() => {
    if (!currentUid) return;
    return subscribeDesigns(currentUid, (list) => setDesigns(Array.isArray(list) ? list : []));
  }, [currentUid]);

  // ── Optimistic insert from navigation state ──────────────────────────────────
  useEffect(() => {
    const ng = location.state?.newGuest;
    if (!ng?.id) return;
    setGuests(prev => {
      if (prev.some(g => g.id === ng.id)) return prev;
      return [...prev, ng].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    });
  }, [location.state?.newGuest?.id]);

  // ── Firestore onSnapshot: server-confirmed reads, offline cache, auto-retry ───
  useEffect(() => {
    if (!currentUid) return;
    return subscribeDigitalGuests(
      currentUid,
      (list) => {
        setGuests(prev => {
          const serverIds = new Set(list.map(g => g.id));
          const pending   = prev.filter(g => !serverIds.has(g.id));
          return [...list, ...pending].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        });
      },
      // Surface read failures so the user knows their data is saved but
      // the listener was rejected (almost always a Firestore rule mismatch).
      (err) => showToast(`✗ ${err?.code || err?.message || "read failed"}`),
    );
  }, [currentUid]);

  // ── Edit ─────────────────────────────────────────────────────────────────────
  const startEdit = (g) => {
    setEditingId(g.id);
    setEditName(g.name);
    setEditPhone(g.phone);
    setEditRanks(getGuestRanks(g));
    setEditDesignId(g.designId || "");
    setRevealedId(null);
  };

  const toggleEditRank = (r) => {
    setEditRanks((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r],
    );
  };

  const saveEdit = async () => {
    const trimName  = editName.trim();
    const digits    = editPhone.replace(/\D/g, "");
    if (trimName.split(/\s+/).filter(Boolean).length < 2) {
      showToast(lang === "he" ? "שם חייב להכיל לפחות 2 מילים" : "الاسم يجب كلمتين على الأقل");
      return;
    }
    if (digits.length !== 10) {
      showToast(lang === "he" ? "10 ספרות בדיוק" : "رقم الهاتف 10 أرقام بالضبط");
      return;
    }
    // Drop ranks that no longer exist in the master list (guards a stale
    // chip from being persisted if the groom removed it in another tab).
    const cleanedRanks = editRanks.filter((r) => availableRanks.includes(r));
    try {
      await updateDigitalGuest(currentUid, editingId, {
        name: trimName, phone: digits, ranks: cleanedRanks, designId: editDesignId,
      });
      // Optimistic local update — no subscription needed
      setGuests(prev => prev.map(g => g.id === editingId
        ? { ...g, name: trimName, phone: digits, ranks: cleanedRanks, designId: editDesignId }
        : g));
      setEditingId(null);
    } catch (err) {
      logErr("saveDigitalEdit", err);
      showToast(localizeApiError(err, lang, "خطأ"));
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────────
  const doDelete = async (id) => {
    try {
      await removeDigitalGuest(currentUid, id);
      // Optimistic local removal — no subscription needed
      setGuests(prev => prev.filter(g => g.id !== id));
      setRevealedId(null);
    } catch (err) {
      logErr("deleteDigitalGuest", err);
      showToast(localizeApiError(err, lang, "خطأ"));
    }
  };

  // Sending digital invites is admin-only — see AdminSendTab. The groom only
  // manages the list here; once admin sends, the "✓ Sent" badge below appears
  // (driven by `inviteLinkSentAt` written by the createDigitalGuestInvite fn).

  // ── Cycle status ─────────────────────────────────────────────────────────────
  const cycleStatus = async (g) => {
    const next = CYCLE[(CYCLE.indexOf(g.status) + 1) % CYCLE.length];
    try {
      await updateDigitalGuest(currentUid, g.id, { status: next });
      setGuests(prev => prev.map(x => x.id === g.id ? { ...x, status: next } : x));
    } catch (err) {
      logErr("cycleStatus", err);
    }
  };

  // ── Search + RSVP-status filter ───────────────────────────────────────────────
  const guestStatuses = [
    { key: "pending",   label: t("chip_pending")   },
    { key: "attending", label: t("chip_attending") },
    { key: "absent",    label: t("chip_absent")    },
  ];
  const { query, setQuery, activeStatus, setActiveStatus, filtered, chips } =
    useListFilter(guests, {
      fields: GUEST_FIELDS, phoneFields: GUEST_PHONE, lang,
      statusOf: guestStatusOf, statuses: guestStatuses, allLabel: t("filter_all"),
    });

  // Export the guest list (name / phone / RSVP status / ranks) as a CSV the
  // groom can hand to a caterer or hall.
  const exportCsv = () => {
    const statusLabel = (s) =>
      s === "attending" ? (lang === "he" ? "מגיע" : "سيحضر")
        : s === "absent" ? (lang === "he" ? "לא מגיע" : "لن يحضر")
          : (lang === "he" ? "ממתין" : "بانتظار");
    const headers = lang === "he"
      ? ["שם", "טלפון", "סטטוס", "דירוגים"]
      : ["الاسم", "الهاتف", "الحالة", "الرتب"];
    const rows = guests.map((g) => [
      g.name || "", g.phone || "", statusLabel(g.status),
      Array.isArray(g.ranks) ? g.ranks.join(" | ") : "",
    ]);
    downloadCsv("dawa-guests.csv", toCsv(headers, rows));
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ animation: "fadeUp .3s ease" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.goldLight }}>
          {lang === "he" ? "רשימת מוזמנים" : "قائمة المدعوين"} (<Num>{guests.length.toLocaleString("en")}</Num>)
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {guests.length > 0 && (
            <button className="ghost-btn" style={{ padding: "8px 12px", fontSize: 12 }} onClick={exportCsv}>
              {lang === "he" ? "⬇ CSV" : "⬇ CSV"}
            </button>
          )}
          <button className="gold-btn" style={{ padding: "8px 16px", fontSize: 12 }}
                  onClick={() => navigate("/portal/groom/digital/add")}>
            {lang === "he" ? "➕ הוסף" : "➕ إضافة"}
          </button>
        </div>
      </div>

      {/* Hint */}
      <div style={{ fontSize: 11, color: "#5a5040", marginBottom: 10, fontStyle: "italic" }}>
        {lang === "he"
          ? "💡 לחץ על הסטטוס לשינוי · לחץ «←» למחיקה"
          : "💡 انقر على الحالة لتغييرها · اضغط «←» للحذف"}
      </div>

      {/* Who-sends note — grooms don't send invites themselves; the team does. */}
      <div style={{
        fontSize: 11.5, color: C.dim, marginBottom: 12, lineHeight: 1.7,
        padding: "8px 12px", borderRadius: 10,
        background: "rgba(201,168,76,.05)", border: "1px solid rgba(201,168,76,.15)",
      }}>
        {lang === "he"
          ? "📨 אין צורך לשלוח בעצמך — לאחר אישור העיצוב, צוות דעוה שולח את ההזמנות למוזמנים בוואטסאפ."
          : "📨 لا حاجة للإرسال بنفسك — بعد اعتماد التصميم، يتولّى فريق دعوة إرسال الدعوات للمدعوين عبر واتساب."}
      </div>

      {/* Search + RSVP-status filter — only meaningful once there are guests */}
      {guests.length > 0 && (
        <>
          <SearchBar value={query} onChange={setQuery} lang={lang}
                     placeholder={t("search_guests_placeholder")}
                     resultCount={filtered.length} totalCount={guests.length} />
          {chips.length > 0 && (
            <FilterChips options={chips} value={activeStatus} onChange={setActiveStatus} lang={lang} />
          )}
        </>
      )}

      {guests.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 32, color: C.dim }}>
          {lang === "he" ? "אין מוזמנים עדיין — הוסף מוזמן ראשון" : "لا يوجد مدعوون بعد — أضف أول مدعو"}
        </div>
      )}

      {/* No-results notice — guests exist but the search/filter excluded them all */}
      {guests.length > 0 && filtered.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 24, color: C.dim }}>
          {t("search_no_results")}
        </div>
      )}

      {filtered.map(g => {
        const sc        = STATUS_CFG[g.status] || STATUS_CFG.pending;
        const isEditing  = editingId  === g.id;
        const isRevealed = revealedId === g.id;

        return (
          <div key={g.id} style={{ position: "relative", overflow: "hidden", borderRadius: 14, marginBottom: 10 }}>

            {/* Delete reveal panel (behind card) */}
            <div style={{
              position: "absolute", insetBlock: 0, insetInlineEnd: 0, width: 110,
              background: "linear-gradient(90deg,#b03020,#d4533a)",
              display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 14, zIndex: 0,
            }}>
              <button onClick={() => doDelete(g.id)} style={{
                background: "transparent", border: "none", color: "#fff",
                fontWeight: 900, fontSize: 13, fontFamily: "inherit", cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              }}>
                <span style={{ fontSize: 22 }}>🗑</span>
                <span>{lang === "he" ? "מחק" : "حذف"}</span>
              </button>
            </div>

            {/* Main card */}
            <div style={{
              background: "#0f0f15",
              border: `1px solid rgba(255,255,255,.07)`,
              borderRadius: 14, padding: "14px 16px",
              display: "flex", alignItems: "center", gap: 12,
              transform: isRevealed ? "translateX(110px)" : "translateX(0)",
              transition: "transform .28s cubic-bezier(.22,1,.36,1)",
              position: "relative", zIndex: 1, touchAction: "pan-y",
            }}>
              {isEditing ? (
                /* ── Inline edit ── */
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <div style={{ flex: 2 }}>
                      <div style={{ fontSize: 10, color: C.goldDim, marginBottom: 3 }}>
                        {lang === "he" ? "שם מלא (2 מילים+)" : "الاسم الكامل (كلمتان+)"}
                      </div>
                      <input className="input-field" type="text"
                             value={editName} onChange={e => setEditName(e.target.value)}
                             style={{ fontSize: 12 }}/>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: C.goldDim, marginBottom: 3 }}>
                        {lang === "he" ? "טלפון (10)" : "هاتف (10)"}
                      </div>
                      <input className="input-field" type="tel"
                             value={editPhone} onChange={e => setEditPhone(e.target.value)}
                             style={{ fontSize: 12, direction: "ltr" }}/>
                    </div>
                  </div>

                  {/* Rank chip picker — tap any chip to toggle on/off */}
                  <div style={{
                    fontSize: 10, color: C.goldDim, marginBottom: 6,
                    display: "flex", justifyContent: "space-between", alignItems: "baseline",
                  }}>
                    <span>{lang === "he" ? "רמות (אפשר לבחור כמה)" : "الرتب (يمكن اختيار عدة)"}</span>
                    {editRanks.length > 0 && (
                      <span style={{ color: C.gold, fontWeight: 700 }}>
                        <Num>{editRanks.length}</Num> {lang === "he" ? "נבחרו" : "محددة"}
                      </span>
                    )}
                  </div>
                  {availableRanks.length === 0 ? (
                    <div style={{
                      marginBottom: 8, padding: "6px 8px", borderRadius: 8,
                      background: "rgba(255,255,255,.02)", border: "1px dashed rgba(255,255,255,.1)",
                      fontSize: 10, color: C.dim, textAlign: "center",
                    }}>
                      {lang === "he" ? "אין רמות — הוסף ברשימה הראשית" : "لا توجد رتب — أضفها في الرئيسية"}
                    </div>
                  ) : (
                    <div style={{
                      display: "flex", flexWrap: "wrap", gap: 5,
                      marginBottom: 8, padding: "6px",
                      borderRadius: 8, background: "rgba(255,255,255,.02)",
                      border: "1px solid rgba(255,255,255,.06)",
                    }}>
                      {availableRanks.map(r => {
                        const on = editRanks.includes(r);
                        return (
                          <button
                            key={r}
                            type="button"
                            onClick={() => toggleEditRank(r)}
                            style={{
                              padding: "4px 10px", borderRadius: 999,
                              border: on ? `1px solid ${C.gold}` : "1px solid rgba(255,255,255,.12)",
                              background: on ? "rgba(201,168,76,.18)" : "transparent",
                              color: on ? C.gold : C.goldDim,
                              fontWeight: on ? 800 : 600,
                              fontSize: 11, fontFamily: "inherit", cursor: "pointer",
                              transition: "all .15s",
                            }}
                          >
                            {on ? "✓ " : ""}{r}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Per-guest design picker — only approved designs are selectable. */}
                  {designs.length > 1 && (
                    <>
                      <div style={{ fontSize: 10, color: C.goldDim, marginBottom: 6 }}>
                        {lang === "he" ? "עיצוב למוזמן זה" : "تصميم هذا المدعو"}
                      </div>
                      <div style={{
                        display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8, padding: 6,
                        borderRadius: 8, background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)",
                      }}>
                        {designs.map((d) => {
                          const on = editDesignId ? editDesignId === d.id : d.isDefault;
                          const approved = d.designStatus === "approved";
                          return (
                            <button
                              key={d.id}
                              type="button"
                              disabled={!approved}
                              onClick={() => setEditDesignId(d.id)}
                              title={approved ? "" : (lang === "he" ? "ממתין לאישור" : "بانتظار الاعتماد")}
                              style={{
                                padding: "4px 10px", borderRadius: 999, fontSize: 11, fontFamily: "inherit",
                                border: on ? `1px solid ${C.gold}` : "1px solid rgba(255,255,255,.12)",
                                background: on ? "rgba(201,168,76,.18)" : "transparent",
                                color: !approved ? C.dim : (on ? C.gold : C.goldDim),
                                fontWeight: on ? 800 : 600,
                                cursor: approved ? "pointer" : "not-allowed", opacity: approved ? 1 : 0.55,
                              }}
                            >
                              {on ? "✓ " : ""}{designTitle(d, lang)}{approved ? "" : " ⏳"}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}

                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="gold-btn"  style={{ flex: 1, padding: "8px 0", fontSize: 12 }} onClick={saveEdit}>
                      {lang === "he" ? "💾 שמור" : "💾 حفظ"}
                    </button>
                    <button className="ghost-btn" style={{ flex: 1, padding: "8px 0", fontSize: 12 }} onClick={() => setEditingId(null)}>
                      {lang === "he" ? "ביטול" : "إلغاء"}
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Normal view ── */
                <>
                  {/* Status icon */}
                  <div style={{ display: "flex", color: sc.color }}><Icon name={sc.iconName} size={20} /></div>

                  {/* Name + phone + ranks */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, color: C.goldLight, fontSize: 14, marginBottom: 2 }}>{g.name}</div>
                    <div style={{ fontSize: 11, color: "#5a5040", direction: "ltr", textAlign: "right" }}>{g.phone}</div>
                    {(() => {
                      const gr = getGuestRanks(g);
                      if (gr.length === 0) return null;
                      return (
                        <div style={{
                          display: "flex", flexWrap: "wrap", gap: 4,
                          marginTop: 5,
                        }}>
                          {gr.map((r) => (
                            <span key={r} style={{
                              fontSize: 10, fontWeight: 700,
                              padding: "2px 7px", borderRadius: 999,
                              background: "rgba(201,168,76,.12)",
                              border: "1px solid rgba(201,168,76,.3)",
                              color: C.gold,
                            }}>{r}</span>
                          ))}
                        </div>
                      );
                    })()}
                    {canSeeAttendance && g.status === "attending" && g.companions != null && (
                      <div data-testid="guest-companions" style={{ marginTop: 5, fontSize: 11, fontWeight: 800, color: C.gold }}>
                        👥 <Num>{Number(g.companions) + 1}</Num> {lang === "he" ? "אנשים" : "أشخاص"}
                      </div>
                    )}
                    {designs.length > 1 && (() => {
                      const assigned = designs.find((d) => d.id === g.designId) || designs.find((d) => d.isDefault);
                      if (!assigned) return null;
                      return (
                        <div style={{ marginTop: 5, fontSize: 10, color: C.gold, fontWeight: 700 }}>
                          🎨 {designTitle(assigned, lang)}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Right side: status badge + edit + delete */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    {/* Status badge — tap to cycle (locked when attendance is gated off) */}
                    {canSeeAttendance ? (
                      <button onClick={() => cycleStatus(g)}
                              title={lang === "he" ? "לחץ לשינוי" : "انقر لتغيير الحالة"}
                              style={{
                                padding: "2px 10px", borderRadius: 20, border: "none", cursor: "pointer",
                                background: sc.bg, color: sc.color, fontWeight: 700, fontSize: 11,
                                fontFamily: "inherit",
                              }}>
                        {lang === "he" ? sc.label_he : sc.label_ar}
                      </button>
                    ) : (
                      <span title={lang === "he" ? "תצוגת נוכחות מושבתת" : "عرض الحضور غير مُفعّل"}
                            style={{ padding: "2px 10px", borderRadius: 20, background: "rgba(255,255,255,.05)", color: C.dim, fontWeight: 700, fontSize: 11 }}>🔒</span>
                    )}

                    {/* Read-only "Sent" badge — appears once the admin sends the invite */}
                    {g.inviteLinkSentAt && (
                      <span title={lang === "he" ? "האדמין שלח את ההזמנה" : "أرسل الأدمن الدعوة"}
                            style={{
                              background: "rgba(76,201,122,.12)",
                              border: "1px solid rgba(76,201,122,.35)",
                              color: "#4cc97a",
                              fontSize: 11, fontWeight: 800,
                              padding: "3px 8px", borderRadius: 8,
                              whiteSpace: "nowrap",
                            }}>
                        ✓ {lang === "he" ? "נשלח" : "تم الإرسال"}
                      </span>
                    )}

                    {/* Edit + delete buttons — same style as GroomGuests */}
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <button onClick={() => startEdit(g)} style={{
                        background: "rgba(201,168,76,.12)", border: "1px solid rgba(201,168,76,.3)",
                        color: C.gold, fontSize: 11, fontWeight: 700,
                        cursor: "pointer", padding: "3px 8px", borderRadius: 8, fontFamily: "inherit",
                      }}>
                        {lang === "he" ? "✎ ערוך" : "✎ تعديل"}
                      </button>
                      <button onClick={() => setRevealedId(isRevealed ? null : g.id)} style={{
                        background: isRevealed ? "rgba(212,80,58,.25)" : "rgba(212,80,58,.08)",
                        border: "1px solid rgba(212,80,58,.4)",
                        color: C.red, fontSize: 13, fontWeight: 900,
                        cursor: "pointer", padding: "3px 9px", borderRadius: 8,
                        fontFamily: "inherit", transition: "all .2s",
                      }}>
                        {isRevealed ? "✕" : "←"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
