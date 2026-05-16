// Admin → Send tab: pick a groom and send WhatsApp confirmation invites to their guests.
import { usePortal } from "../../../context/PortalContext.jsx";
import { C } from "../../../styles/theme.js";

export function AdminSendTab() {
  const {
    users, guests, adminSelectedGroom, setAdminSelectedGroom,
    adminFormLink, lang, t, sendWaToAll, sendWaToOne, guestConfirmationStatus,
  } = usePortal();
            const groomList = users.filter(u => u.role === "groom");
            const selectedGroomGuests = adminSelectedGroom
              ? guests.filter(g => g.groomUsername === adminSelectedGroom) : [];
            const withoutAddr = selectedGroomGuests.filter(g => !g.area || !g.area.trim());
            const withAddr    = selectedGroomGuests.filter(g =>  g.area &&  g.area.trim());

            return (
              <div>
                <div style={{ fontSize: 19, fontWeight: 900, color: C.gold, fontFamily: "'Amiri',serif", marginBottom: 4 }}>
                  📨 {t("admin_tab_send")}
                </div>
                <div style={{ fontSize: 12, color: C.dim, marginBottom: 16 }}>
                  {t("admin_send_hint")}
                </div>

                {!adminFormLink.trim() && (
                  <div style={{
                    marginBottom: 16, padding: "12px 14px", borderRadius: 10,
                    background: "rgba(212,122,75,.08)", border: "1px solid rgba(212,122,75,.3)",
                    fontSize: 12, color: C.red, lineHeight: 1.7,
                  }}>
                    ⚠ {lang === "he" ? "אנא הגדר את קישור טופס האישור בלשונית הגדרות תחילה" : "يرجى ضبط رابط نموذج التأكيد من تبويب الإعدادات أولاً"}
                  </div>
                )}

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
                      <button onClick={() => sendWaToAll(adminSelectedGroom)}
                              disabled={!adminFormLink.trim()}
                              style={{
                                width: "100%", padding: "13px 0", borderRadius: 12, cursor: adminFormLink.trim() ? "pointer" : "not-allowed",
                                background: adminFormLink.trim() ? "linear-gradient(135deg,#25d366,#1ea84d)" : "rgba(255,255,255,.05)",
                                color: adminFormLink.trim() ? "#fff" : "#5a5040",
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
                    ].filter(s => s.list.length > 0).map(sec => (
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
                          // Phone-match-based confirmation status. Softly tinted card +
                          // small badge when there's a mismatch or a clean match.
                          const confStatus = guestConfirmationStatus(g);
                          const isMatched   = confStatus?.status === "matched";
                          const isMismatch  = confStatus?.status === "mismatch";
                          // Soft tints — gentle red for mismatch, soft green for matched,
                          // neutral when no confirmation yet.
                          const cardBg     = isMismatch ? "rgba(212,122,75,.07)"
                                            : isMatched ? "rgba(76,201,122,.05)"
                                            : "rgba(255,255,255,.03)";
                          const cardBorder = isMismatch ? "rgba(212,122,75,.4)"
                                            : isMatched ? "rgba(76,201,122,.3)"
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
                            <button onClick={() => sendWaToOne(g.phone)}
                                    disabled={!adminFormLink.trim()}
                                    style={{
                                      padding: "8px 14px", borderRadius: 10, border: "none",
                                      background: adminFormLink.trim() ? "linear-gradient(135deg,#25d366,#1ea84d)" : "rgba(255,255,255,.05)",
                                      color: adminFormLink.trim() ? "#fff" : "#5a5040",
                                      fontSize: 12, fontWeight: 800, fontFamily: "inherit",
                                      cursor: adminFormLink.trim() ? "pointer" : "not-allowed",
                                      alignSelf: "center",
                                    }}>
                              {t("admin_send_to_one")}
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
