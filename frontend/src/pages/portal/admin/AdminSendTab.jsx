// Admin → Send tab: pick a groom and send WhatsApp confirmation invites to their guests.
// Confirmed guests (those who already replied) are filtered out — they live on
// the Confirmations tab now. Remaining guests render in two reply states:
//   not sent  → neutral card, no reply pill
//   pending   → soft amber card + "⌛ waiting" pill
import { useState, useEffect } from "react";
import { usePortal } from "../../../context/PortalContext.jsx";
import { C } from "../../../styles/theme.js";
import { Num } from "../../../components/Num.jsx";
import { REPLY_STATUS, replyStateOf } from "../../../data/status.js";
import { subscribeDesigns, assignGuestDesign } from "../../../services/digitalInvitation.js";
import { localize } from "../../../utils/localize.js";
import { logErr } from "../../../utils/logger.js";
import { useListFilter, filterList } from "../../../utils/searchFilter.js";
import { SearchBar } from "../../../components/SearchBar.jsx";
import { FilterChips } from "../../../components/FilterChips.jsx";

// Guest ranks may be the new `ranks: string[]` or a legacy single `rank: string`.
function guestRanks(g) {
  if (Array.isArray(g?.ranks)) return g.ranks;
  if (g?.rank) return [g.rank];
  return [];
}

// Search field specs (module-level → stable identity for useListFilter memos).
// name + area as plain keys; ranks/rank via accessors (string[] handled by the hook).
const GUEST_FIELDS = ["name", "area", (g) => g.ranks, (g) => g.rank];
const GUEST_PHONE = ["phone"];
// Digital guests carry a clean RSVP status — drives the FilterChips.
const digitalStatusOf = (g) => g.status || "pending";

// Sentinel for the "بدون تصميم" (no design) picker option — send the message
// with NO invitation link. Client-side only; never persisted onto a guest.
const NODESIGN = "__nodesign__";
// Replace {الاسم}/{name}/{שם} placeholders with the guest's name.
const personalize = (msg, name) =>
  (msg || "").replace(/\{\s*(?:الاسم|name|שם)\s*\}/g, (name || "").trim());

export function AdminSendTab() {
  const {
    users, guests, adminSelectedGroom, setAdminSelectedGroom,
    t, lang, sendInviteLink, sendDigitalInviteLink, digitalGuestsForSelectedGroom,
    guestConfirmationStatus, showToast, adminMode,
  } = usePortal();

  // The selected groom's designs — drives the per-guest design picker so the
  // admin can choose which (approved) design each guest receives.
  const [designs, setDesigns] = useState([]);
  // Optimistic per-guest design selection { [guestId]: designId } for instant
  // dropdown feedback before the guest subscription echoes the persisted value.
  const [designOverrides, setDesignOverrides] = useState({});
  // Per-groom WhatsApp message for DIGITAL guests, typed on this page. Keyed by
  // groom username so each groom keeps its own draft while switching around.
  const [digitalMsgByGroom, setDigitalMsgByGroom] = useState({});

  useEffect(() => {
    const groomUser = adminSelectedGroom ? users.find((u) => u.username === adminSelectedGroom) : null;
    const uid = groomUser?.uid || groomUser?.id || null;
    if (!uid) { setDesigns([]); return undefined; }
    setDesignOverrides({});
    return subscribeDesigns(uid, (list) => setDesigns(Array.isArray(list) ? list : []));
  }, [adminSelectedGroom, users]);

  const approvedDesigns = designs.filter((d) => d.designStatus === "approved");

  const pickDesign = async (groomUid, guestId, designId) => {
    setDesignOverrides((prev) => ({ ...prev, [guestId]: designId }));
    if (designId === NODESIGN) return; // ephemeral — never persist the sentinel
    try {
      await assignGuestDesign(groomUid, guestId, designId);
    } catch (err) {
      logErr("assignGuestDesign", err);
      showToast(lang === "he" ? "שמירת העיצוב נכשלה" : "فشل حفظ التصميم");
    }
  };
  // Per-guest invite tokens are minted on demand (createGuestInvite Cloud
  // Function); each guest gets a unique 90-day link, so there's no global
  // adminFormLink to gate the buttons on anymore.
  const sendAll = async (guestList) => {
    if (guestList.length === 0) return;
    showToast(t("admin_bulk_warn"));
    for (let i = 0; i < guestList.length; i++) {
      // Sequential awaits avoid hammering the rate limiter and let the
      // browser keep popup permission alive between window.opens.
      await sendInviteLink(guestList[i]);
      if (i < guestList.length - 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    }
  };
            const groomList = users.filter(u => u.role === "groom");
            // Show ALL of the groom's guests (confirmed + not). Each card labels
            // its confirmation status; "send to all" still targets only the
            // not-yet-confirmed so confirmed guests aren't re-messaged.
            const selectedGroomGuests = adminSelectedGroom
              ? guests.filter(g => g.groomUsername === adminSelectedGroom) : [];
            // Manual mode splits the list by address; Digital mode shows a single
            // unified list (address is irrelevant for a digital invite link).
            const isDigital = adminMode === "digital";
            // Digital guests for the selected groom (Firestore-backed, subscribed
            // in usePortalState). Show ALL — confirmed + not — like the physical list.
            const selectedGroomUser = adminSelectedGroom
              ? users.find(u => u.username === adminSelectedGroom) : null;
            const selectedGroomUid  = selectedGroomUser?.uid || selectedGroomUser?.id || null;
            const digitalGuests = digitalGuestsForSelectedGroom || [];
            const digitalMsg = digitalMsgByGroom[adminSelectedGroom] || "";

            // ── Search + RSVP filter ──────────────────────────────────────────
            // Digital guests have a clean RSVP status → SearchBar + FilterChips.
            // Physical guests have no clean status → search-only (filterList),
            // sharing the SAME query so one box drives both lists.
            const digitalStatuses = [
              { key: "pending",   label: t("chip_pending") },
              { key: "attending", label: t("chip_attending") },
              { key: "absent",    label: t("chip_absent") },
            ];
            const {
              query, setQuery, activeStatus, setActiveStatus,
              filtered: filteredDigital, chips,
            } = useListFilter(digitalGuests, {
              fields: GUEST_FIELDS, phoneFields: GUEST_PHONE, lang,
              statusOf: digitalStatusOf, statuses: digitalStatuses, allLabel: t("filter_all"),
            });
            // Physical list: same query, search-only (no chips).
            const filteredPhysical = filterList(selectedGroomGuests, query, {
              fields: GUEST_FIELDS, phoneFields: GUEST_PHONE, lang,
            });
            // Filter BEFORE splitting/grouping so section headers + counts recompute.
            const withoutAddr = filteredPhysical.filter(g => !g.area || !g.area.trim());
            const withAddr    = filteredPhysical.filter(g =>  g.area &&  g.area.trim());
            // True when a search/chip filter is active but nothing in either list matched.
            const hasFilter   = !!query.trim() || activeStatus !== "all";
            const noMatches   = hasFilter && filteredPhysical.length === 0 && filteredDigital.length === 0;
            // "Send to all" only messages physical guests who haven't confirmed yet.
            // Target what's currently shown (the filtered set) so the count + action agree.
            const unconfirmedGuests = filteredPhysical.filter(g => !g.confirmedAt);

            return (
              <div>
                <div style={{ fontSize: 19, fontWeight: 900, color: C.gold, fontFamily: "'Amiri','Frank Ruhl Libre',serif", marginBottom: 4 }}>
                  📨 {t("admin_tab_send")}
                </div>
                <div style={{ fontSize: 12, color: C.dim, marginBottom: 10 }}>
                  {t("admin_send_hint")}
                </div>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "6px 12px", borderRadius: 20, marginBottom: 18,
                  background: isDigital ? "rgba(75,159,212,.1)" : "rgba(201,168,76,.1)",
                  border: `1px solid ${isDigital ? "rgba(75,159,212,.3)" : "rgba(201,168,76,.3)"}`,
                  fontSize: 11, fontWeight: 800,
                  color: isDigital ? C.blue : C.gold,
                }}>
                  <span>{isDigital ? "🌐" : "📝"}</span>
                  <span>
                    {isDigital
                      ? (lang === "he" ? "מצב: הזמנה דיגיטלית" : "الوضع: دعوة رقمية")
                      : (lang === "he" ? "מצב: ידני" : "الوضع: يدوي")}
                  </span>
                </div>

                {/* Groom selector */}
                <div style={{ fontSize: 12, color: C.goldDim, fontWeight: 700, marginBottom: 8 }}>
                  {t("admin_select_groom")}
                </div>
                {groomList.length === 0 ? (
                  <div className="card" style={{ textAlign: "center", padding: 24, color: C.dim }}>
                    {t("admin_no_grooms")}
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 18 }}>
                    {groomList.map(u => {
                      const count = guests.filter(g => g.groomUsername === u.username).length;
                      const isSel = adminSelectedGroom === u.username;
                      return (
                        <button key={u.id} onClick={() => setAdminSelectedGroom(isSel ? null : u.username)} style={{
                          padding: "12px 10px", borderRadius: 12, cursor: "pointer",
                          background: isSel ? "rgba(201,168,76,.22)" : "rgba(255,255,255,.03)",
                          border: `1.5px solid ${isSel ? C.gold : "rgba(255,255,255,.08)"}`,
                          color: isSel ? C.gold : C.goldDim,
                          fontWeight: 800, fontSize: 13, fontFamily: "inherit",
                          display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                        }}>
                          <span style={{ fontSize: 22 }}>{isSel ? "✓" : "♥"}</span>
                          <span style={{ direction: "ltr" }}>{u.username}</span>
                          <span style={{ fontSize: 10, color: C.dim }}>
                            {t("admin_groom_guests_count")} <Num>{count.toLocaleString("en")}</Num>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Guests of selected groom + send buttons */}
                {adminSelectedGroom && (
                  <>
                    {/* Search box (drives both physical + digital lists) + RSVP chips (digital). */}
                    <SearchBar
                      value={query}
                      onChange={setQuery}
                      lang={lang}
                      placeholder={t("search_guests_placeholder")}
                      resultCount={filteredPhysical.length + filteredDigital.length}
                      totalCount={selectedGroomGuests.length + digitalGuests.length}
                    />
                    {/* RSVP chips only make sense for digital guests — hide them in
                        manual mode (no digital list) so they don't show 0/0/0 above
                        physical guests. */}
                    {digitalGuests.length > 0 && chips.length > 0 && (
                      <FilterChips options={chips} value={activeStatus} onChange={setActiveStatus} lang={lang} />
                    )}

                    {unconfirmedGuests.length > 0 && (
                      <button onClick={() => sendAll(unconfirmedGuests)}
                              style={{
                                width: "100%", padding: "13px 0", borderRadius: 12, cursor: "pointer",
                                background: "linear-gradient(135deg,#25d366,#1ea84d)",
                                color: "#fff",
                                border: "none", fontWeight: 900, fontSize: 14, fontFamily: "inherit", marginBottom: 18,
                              }}>
                        {t("admin_send_to_all")} (<Num>{unconfirmedGuests.length.toLocaleString("en")}</Num>)
                      </button>
                    )}

                    {selectedGroomGuests.length === 0 && digitalGuests.length === 0 && (
                      <div className="card" style={{ textAlign: "center", padding: 24, color: C.dim }}>
                        {t("guests_empty")}
                      </div>
                    )}

                    {/* Filter active but nothing matched — distinct from an empty groom. */}
                    {noMatches && (
                      <div className="card" style={{ textAlign: "center", padding: 24, color: C.dim }}>
                        {t("search_no_results")}
                      </div>
                    )}

                    {[
                      { title: t("guests_without_address"), list: withoutAddr, color: C.red, bg: "rgba(212,122,75,.06)" },
                      { title: t("guests_with_address"),    list: withAddr,    color: "#4cc97a", bg: "rgba(76,201,122,.06)" },
                    ].filter(s => s.list.length > 0).concat(
                      filteredDigital.length > 0 ? [{
                        title: "📱 " + t("admin_digital_guests"),
                        list: filteredDigital,
                        color: "#4b9fd4",
                        bg: "rgba(75,159,212,.06)",
                        digital: true,
                      }] : []
                    ).map(sec => (
                      <div key={sec.title}>
                        <div style={{
                          display: "flex", alignItems: "center", gap: 10,
                          marginTop: 10, marginBottom: 8, padding: "8px 12px", borderRadius: 10,
                          background: sec.bg, border: `1px solid ${sec.color}33`,
                        }}>
                          <div style={{ flex: 1, fontWeight: 800, color: sec.color, fontSize: 13 }}>{sec.title}</div>
                          <span style={{ fontSize: 11, color: sec.color, fontWeight: 700 }}><Num>{sec.list.length.toLocaleString("en")}</Num></span>
                        </div>
                        {sec.digital && (
                          <div style={{
                            marginBottom: 10, padding: 12, borderRadius: 12,
                            background: "rgba(75,159,212,.06)", border: "1px solid rgba(75,159,212,.25)",
                          }}>
                            <div style={{ fontSize: 12, fontWeight: 800, color: "#4b9fd4", marginBottom: 6 }}>
                              ✍️ {lang === "he" ? "הודעת וואטסאפ למוזמנים הדיגיטליים" : "رسالة واتساب للمدعوين الرقميين"}
                            </div>
                            <textarea
                              className="input-field"
                              value={digitalMsg}
                              onChange={(e) => {
                                const v = e.target.value.slice(0, 4000);
                                setDigitalMsgByGroom((prev) => ({ ...prev, [adminSelectedGroom]: v }));
                              }}
                              rows={4}
                              placeholder={lang === "he"
                                ? "כתוב את ההודעה שתישלח לכל מוזמן… השתמש ב-{שם} עבור שם המוזמן"
                                : "اكتب الرسالة التي ستُرسل لكل معزوم… استخدم {الاسم} ليوضع اسمه"}
                              style={{ resize: "vertical", fontSize: 13, fontFamily: "inherit" }}
                            />
                            <div style={{ marginTop: 6, fontSize: 10, color: C.dim, lineHeight: 1.6 }}>
                              {lang === "he"
                                ? "{שם} יוחלף בשם המוזמן · נשלח עם קישור ההזמנה (או בלי קישור עם ״ללא עיצוב״)"
                                : "{الاسم} بتنحطّ مكانها اسم المعزوم · بتنبعث مع رابط الدعوة (أو بدون رابط مع «بدون تصميم»)"}
                            </div>
                          </div>
                        )}
                        {sec.list.map(g => {
                          // Confirmation matching only runs for physical guests
                          // (which live in /guestsByGroom). Digital guests get
                          // a simpler card with the pending/sent pill only.
                          const confStatus = sec.digital ? null : guestConfirmationStatus(g);
                          const isMatched   = confStatus?.status === "matched";
                          const isMismatch  = confStatus?.status === "mismatch";
                          // Reply lifecycle: confirmed guests are already filtered out,
                          // so we only see notSent or pending here.
                          const replyState = replyStateOf(g); // "notSent" | "pending"
                          const isPending  = replyState === "pending";
                          // Soft tints — mismatch (red) beats matched (green) beats
                          // pending (amber), and neutral when nothing applies.
                          const cardBg     = isMismatch ? "rgba(212,122,75,.07)"
                                            : isMatched ? "rgba(76,201,122,.05)"
                                            : isPending ? "rgba(212,161,75,.06)"
                                            : "rgba(255,255,255,.03)";
                          const cardBorder = isMismatch ? "rgba(212,122,75,.4)"
                                            : isMatched ? "rgba(76,201,122,.3)"
                                            : isPending ? "rgba(212,161,75,.25)"
                                            : "rgba(255,255,255,.07)";
                          // Effective design for a digital guest: explicit pick →
                          // stored → groom default → first approved → else no-design.
                          const effDesignId = sec.digital
                            ? (designOverrides[g.id]
                                ?? approvedDesigns.find((d) => d.id === g.designId)?.id
                                ?? approvedDesigns.find((d) => d.isDefault)?.id
                                ?? approvedDesigns[0]?.id
                                ?? NODESIGN)
                            : null;
                          const noDesign = effDesignId === NODESIGN;
                          // Confirmation status, shown under every guest (digital + physical).
                          const isConfirmed = sec.digital ? g.status === "attending" : !!g.confirmedAt;
                          const isDeclined  = sec.digital && g.status === "absent";
                          return (
                          <div key={g.id} style={{
                            background: cardBg,
                            border: `1px solid ${cardBorder}`,
                            borderRadius: 14, padding: 14,
                            marginBottom: 8, display: "flex", alignItems: "center", gap: 10,
                            transition: "background .2s, border-color .2s",
                            position: "relative",
                          }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                <span style={{ fontWeight: 800, color: C.goldLight, fontSize: 14 }}>{g.name}</span>
                                {/* Tiny status pill — matched (green) or mismatch (soft red) */}
                                {isMatched && (
                                  <span style={{
                                    fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 700,
                                    background: "rgba(76,201,122,.15)", color: "#4cc97a",
                                  }}>{t("conf_status_matched")}</span>
                                )}
                                {isMismatch && (
                                  <span style={{
                                    fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 700,
                                    background: "rgba(212,122,75,.18)", color: C.red,
                                  }}>{t("conf_status_mismatch")}</span>
                                )}
                                {/* Reply state — pending only (notSent is silent, confirmed never renders here) */}
                                {isPending && (
                                  <span style={{
                                    fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 700,
                                    background: REPLY_STATUS.pending.bg, color: REPLY_STATUS.pending.color,
                                  }}>{t("reply_pending")}</span>
                                )}
                              </div>
                              <div style={{ fontSize: 11, color: "#5a5040", direction: "ltr", textAlign: "right" }}>{g.phone}</div>
                              <div style={{
                                fontSize: 10.5, fontWeight: 800, marginTop: 4,
                                color: isConfirmed ? "#4cc97a" : isDeclined ? C.red : "#7a6a4a",
                              }}>
                                {isConfirmed
                                  ? "✓ " + (lang === "he" ? "אישר הגעה" : "تم التأكيد")
                                  : isDeclined
                                    ? "✗ " + (lang === "he" ? "התנצל — לא יגיע" : "اعتذر — لن يحضر")
                                    : "○ " + (lang === "he" ? "טרם אישר" : "لم يؤكد بعد")}
                              </div>
                              {g.area && <div style={{ fontSize: 11, color: C.dim }}>📍 {g.area}</div>}
                              {/* Guest role / ranks */}
                              {guestRanks(g).length > 0 && (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                                  {guestRanks(g).map((r) => (
                                    <span key={r} style={{
                                      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
                                      background: "rgba(201,168,76,.12)", border: "1px solid rgba(201,168,76,.3)", color: C.gold,
                                    }}>{r}</span>
                                  ))}
                                </div>
                              )}
                              {/* Per-guest design picker — digital guests only. Includes a
                                  "بدون تصميم" option that sends the message with no link. */}
                              {sec.digital && (
                                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: 10, color: C.goldDim, whiteSpace: "nowrap" }}>🎨 {lang === "he" ? "עיצוב:" : "التصميم:"}</span>
                                  <select
                                    value={effDesignId}
                                    onChange={(e) => pickDesign(selectedGroomUid, g.id, e.target.value)}
                                    style={{
                                      flex: 1, minWidth: 0, fontSize: 11, fontFamily: "inherit",
                                      padding: "5px 8px", borderRadius: 8,
                                      background: "rgba(255,255,255,.04)", color: C.goldLight,
                                      border: "1px solid rgba(201,168,76,.3)", cursor: "pointer",
                                    }}
                                  >
                                    <option value={NODESIGN} style={{ background: "#0f0f15" }}>
                                      🚫 {lang === "he" ? "ללא עיצוב (הודעה בלבד)" : "بدون تصميم (رسالة فقط)"}
                                    </option>
                                    {approvedDesigns.map((d) => (
                                      <option key={d.id} value={d.id} style={{ background: "#0f0f15" }}>
                                        {localize(d.title, lang) || (lang === "he" ? "עיצוב" : "تصميم")}{d.isDefault ? " ★" : ""}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              {/* Explain what's mismatched — without shouting */}
                              {isMismatch && (
                                <div style={{
                                  marginTop: 6, padding: "6px 10px", borderRadius: 8,
                                  background: "rgba(212,122,75,.07)",
                                  border: "1px solid rgba(212,122,75,.18)",
                                  fontSize: 10, color: C.red, lineHeight: 1.6,
                                }}>
                                  {confStatus.reasons.join(" · ")}
                                </div>
                              )}
                            </div>
                            <button onClick={() => sec.digital
                                      ? sendDigitalInviteLink(g, selectedGroomUid, personalize(digitalMsg, g.name), { noDesign })
                                      : sendInviteLink(g)}
                                    title={g.inviteLinkSentAt ? t("guests_invite_sent") : t("admin_send_to_one")}
                                    style={{
                                      padding: "8px 14px", borderRadius: 10, border: "none",
                                      background: g.inviteLinkSentAt
                                        ? "linear-gradient(135deg,#3a7fb0,#4b9fd4)"
                                        : "linear-gradient(135deg,#25d366,#1ea84d)",
                                      color: "#fff",
                                      fontSize: 12, fontWeight: 800, fontFamily: "inherit",
                                      cursor: "pointer",
                                      alignSelf: "center",
                                    }}>
                              {g.inviteLinkSentAt ? "↻ " + t("admin_send_to_one") : t("admin_send_to_one")}
                            </button>
                          </div>
                          );
                        })}
                      </div>
                    ))}
                  </>
                )}
              </div>
            );
}
