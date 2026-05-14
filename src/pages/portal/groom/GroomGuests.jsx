// Groom → Guests: the guest list, split into with/without address, swipe-to-delete.
import { STATUS } from "../../../data/status.js";
import { usePortal } from "../../../context/PortalContext.jsx";

export function GroomGuests() {
  const {
    t, lang, myGuests, setTab,
    revealedId, setRevealedId, swipeStartRef, removeGuest, startEdit,
  } = usePortal();
  return (
          <div style={{ animation: "fadeUp .3s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#f5e6b8" }}>
                {t("guests_count")} ({myGuests.length.toLocaleString("en")})
              </div>
              <button className="gold-btn" style={{ padding: "8px 16px", fontSize: 12 }} onClick={() => setTab("add")}>
                {t("guests_add_btn")}
              </button>
            </div>
            {myGuests.length === 0 && (
              <div className="card" style={{ textAlign: "center", padding: 32, color: "#7a6a4a" }}>
                {t("guests_empty")}
              </div>
            )}
            <div style={{ fontSize: 11, color: "#5a5040", marginBottom: 10, fontStyle: "italic" }}>
              {lang === "he" ? "💡 החלק את הכרטיס ימינה או לחץ על «←» כדי להסיר מוזמן" : "💡 اسحب البطاقة لليمين أو اضغط «←» لإزالة المعزوم"}
            </div>

            {(() => {
              // Split myGuests into "without address" and "with address" groups
              const withoutAddr = myGuests.filter(g => !g.area || !g.area.trim());
              const withAddr    = myGuests.filter(g =>  g.area &&  g.area.trim());

              // Shared card renderer (DRY — same card used in both sections)
              const renderCard = (g) => {
                const st = STATUS[g.status];
                const isRevealed = revealedId === g.id;
                const canDelete = g.status === "pending";
                return (
                  <div key={g.id} style={{ position: "relative", overflow: "hidden", borderRadius: 14, marginBottom: 10 }}>
                    {canDelete && (
                      <div style={{
                        position: "absolute", insetBlock: 0, insetInlineEnd: 0,
                        width: 110,
                        background: "linear-gradient(90deg,#b03020,#d4533a)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        borderRadius: 14, zIndex: 0,
                      }}>
                        <button onClick={() => { removeGuest(g.id); setRevealedId(null); }} style={{
                          background: "transparent", border: "none", color: "#fff",
                          fontWeight: 900, fontSize: 13, fontFamily: "inherit", cursor: "pointer",
                          display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                        }}>
                          <span style={{ fontSize: 22 }}>🗑</span>
                          <span>{t("guests_delete")}</span>
                        </button>
                      </div>
                    )}
                    <div
                      onTouchStart={canDelete ? (e) => { swipeStartRef.current = { id: g.id, x: e.touches[0].clientX }; } : undefined}
                      onTouchEnd={canDelete ? (e) => {
                        if (swipeStartRef.current.id !== g.id) return;
                        const dx = e.changedTouches[0].clientX - swipeStartRef.current.x;
                        if (dx > 50)        setRevealedId(g.id);
                        else if (dx < -50)  setRevealedId(null);
                        swipeStartRef.current = { id: null, x: 0 };
                      } : undefined}
                      style={{
                        background: g.status==="delivered" ? "rgba(76,201,122,.04)" : "#0f0f15",
                        border: `1px solid ${g.status==="delivered" ? "rgba(76,201,122,.2)" : "rgba(255,255,255,.07)"}`,
                        borderRadius: 14, padding: "14px 16px",
                        display: "flex", alignItems: "center", gap: 12,
                        transform: isRevealed ? "translateX(110px)" : "translateX(0)",
                        transition: "transform .28s cubic-bezier(.22,1,.36,1)",
                        position: "relative", zIndex: 1, touchAction: "pan-y",
                      }}
                    >
                      <div style={{ fontSize: 20 }}>{st.icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, color: "#f5e6b8", fontSize: 14, marginBottom: 2 }}>{g.name}</div>
                        <div style={{ fontSize: 11, color: "#5a5040", direction: "ltr", textAlign: "right" }}>{g.phone}</div>
                        {g.area && <div style={{ fontSize: 12, color: "#7a6a4a" }}>📍 {g.area}</div>}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        <span className="status-badge" style={{ background: st.bg, color: st.color }}>{t("stat_" + g.status)}</span>
                        <span style={{
                          fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 700,
                          background: g.inviteType==="vip" ? "rgba(155,75,212,.15)" : "rgba(201,168,76,.12)",
                          color: g.inviteType==="vip" ? "#c084fc" : "#c9a84c",
                        }}>{g.inviteType==="vip" ? t("type_vip") : t("type_premium")}</span>
                        {canDelete && (
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <button onClick={() => startEdit(g)}
                                    style={{ background: "rgba(201,168,76,.12)", border: "1px solid rgba(201,168,76,.3)",
                                             color: "#c9a84c", fontSize: 11, fontWeight: 700,
                                             cursor: "pointer", padding: "3px 8px", borderRadius: 8, fontFamily: "inherit" }}>
                              {t("guests_edit")}
                            </button>
                            <button onClick={() => setRevealedId(isRevealed ? null : g.id)}
                                    title={t("guests_delete")}
                                    style={{
                                      background: isRevealed ? "rgba(212,80,58,.25)" : "rgba(212,80,58,.08)",
                                      border: "1px solid rgba(212,80,58,.4)",
                                      color: "#d47a4b", fontSize: 13, fontWeight: 900,
                                      cursor: "pointer", padding: "3px 9px",
                                      borderRadius: 8, fontFamily: "inherit",
                                      transition: "all .2s",
                                    }}>
                              {isRevealed ? "✕" : "←"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              };

              const sectionHeader = (title, count, color, bg) => (
                <div style={{
                  display: "flex", alignItems: "center", gap: 10, marginTop: 16, marginBottom: 10,
                  padding: "10px 14px", borderRadius: 10,
                  background: bg, border: `1px solid ${color}33`,
                }}>
                  <div style={{ flex: 1, fontWeight: 800, color, fontSize: 14 }}>{title}</div>
                  <span style={{ fontSize: 11, color, fontWeight: 700 }}>{count.toLocaleString("en")}</span>
                </div>
              );

              return (
                <>
                  {withoutAddr.length > 0 && (
                    <>
                      {sectionHeader(t("guests_without_address"), withoutAddr.length, "#d47a4b", "rgba(212,122,75,.06)")}
                      <div style={{ fontSize: 11, color: "#7a6a4a", marginBottom: 10, lineHeight: 1.7, padding: "0 6px" }}>
                        {t("guests_without_hint")}
                      </div>
                      {withoutAddr.map(renderCard)}
                    </>
                  )}
                  {withAddr.length > 0 && (
                    <>
                      {sectionHeader(t("guests_with_address"), withAddr.length, "#4cc97a", "rgba(76,201,122,.06)")}
                      {withAddr.map(renderCard)}
                    </>
                  )}
                </>
              );
            })()}
          </div>
  );
}
