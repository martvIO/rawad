// Admin → Send tab: pick a groom and send WhatsApp confirmation invites to their guests.
// Confirmed guests (those who already replied) are filtered out — they live on
// the Confirmations tab now. Remaining guests render in two reply states:
//   not sent  → neutral card, no reply pill
//   pending   → soft amber card + "⌛ waiting" pill
import { usePortal } from "../../../context/PortalContext.jsx";
import { C } from "../../../styles/theme.js";
import { REPLY_STATUS, replyStateOf } from "../../../data/status.js";

export function AdminSendTab() {
  const {
    users, guests, adminSelectedGroom, setAdminSelectedGroom,
    t, lang, sendInviteLink, sendDigitalInviteLink, digitalGuestsForSelectedGroom,
    guestConfirmationStatus, showToast, adminMode,
  } = usePortal();
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
            // Confirmed guests move to the Confirmations tab; hide them here so
            // the Send list is a true "outstanding invites" view.
            const selectedGroomGuests = adminSelectedGroom
              ? guests.filter(g => g.groomUsername === adminSelectedGroom && !g.confirmedAt) : [];
            // Manual mode splits the list by address; Digital mode shows a single
            // unified list (address is irrelevant for a digital invite link).
            const isDigital = adminMode === "digital";
            const withoutAddr = selectedGroomGuests.filter(g => !g.area || !g.area.trim());
            const withAddr    = selectedGroomGuests.filter(g =>  g.area &&  g.area.trim());
            // Digital guests for the selected groom (Firestore-backed, subscribed
            // in usePortalState). Hide confirmed ones — same convention as above.
            const selectedGroomUser = adminSelectedGroom
              ? users.find(u => u.username === adminSelectedGroom) : null;
            const selectedGroomUid  = selectedGroomUser?.uid || selectedGroomUser?.id || null;
            const digitalGuests = (digitalGuestsForSelectedGroom || [])
              .filter(g => !g.confirmedAt);
            const sections = isDigital
              ? [{ title: (lang === "he" ? "כל המוזמנים" : "كل المدعوين"),
                   list: selectedGroomGuests, color: C.gold, bg: "rgba(201,168,76,.06)" }]
              : [
                  { title: t("guests_without_address"), list: withoutAddr, color: C.red, bg: "rgba(212,122,75,.06)" },
                  { title: t("guests_with_address"),    list: withAddr,    color: "#4cc97a", bg: "rgba(76,201,122,.06)" },
                ];

            return (
              <div>
                <div style={{ fontSize: 19, fontWeight: 900, color: C.gold, fontFamily: "'Amiri',serif", marginBottom: 4 }}>
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
                            {t("admin_groom_guests_count")} {count.toLocaleString("en")}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Guests of selected groom + send buttons */}
                {adminSelectedGroom && (
                  <>
                    {selectedGroomGuests.length > 0 && (
                      <button onClick={() => sendAll(selectedGroomGuests)}
                              style={{
                                width: "100%", padding: "13px 0", borderRadius: 12, cursor: "pointer",
                                background: "linear-gradient(135deg,#25d366,#1ea84d)",
                                color: "#fff",
                                border: "none", fontWeight: 900, fontSize: 14, fontFamily: "inherit", marginBottom: 18,
                              }}>
                        {t("admin_send_to_all")} ({selectedGroomGuests.length.toLocaleString("en")})
                      </button>
                    )}

                    {selectedGroomGuests.length === 0 && (
                      <div className="card" style={{ textAlign: "center", padding: 24, color: C.dim }}>
                        {t("guests_empty")}
                      </div>
                    )}

                    {[
                      { title: t("guests_without_address"), list: withoutAddr, color: C.red, bg: "rgba(212,122,75,.06)" },
                      { title: t("guests_with_address"),    list: withAddr,    color: "#4cc97a", bg: "rgba(76,201,122,.06)" },
                    ].filter(s => s.list.length > 0).concat(
                      digitalGuests.length > 0 ? [{
                        title: "📱 " + t("admin_digital_guests"),
                        list: digitalGuests,
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
                          <span style={{ fontSize: 11, color: sec.color, fontWeight: 700 }}>{sec.list.length.toLocaleString("en")}</span>
                        </div>
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
                              {g.area && <div style={{ fontSize: 11, color: C.dim }}>📍 {g.area}</div>}
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
                                      ? sendDigitalInviteLink(g, selectedGroomUid)
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
