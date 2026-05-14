// Admin → Confirmations tab: guest-submitted confirmations, matched against the guest list.
import { usePortal } from "../../../context/PortalContext.jsx";

export function AdminConfirmationsTab() {
  const {
    confirmations, matchColor, matchedGuestFor,
    guestConfirmationStatus, useConfirmationData, t, lang,
  } = usePortal();
            const matched   = confirmations.filter(c => matchColor(c) === "green");
            const mismatch  = confirmations.filter(c => matchColor(c) === "red" && matchedGuestFor(c));
            const unknown   = confirmations.filter(c => !matchedGuestFor(c));

            const renderConf = (conf) => {
              const guest = matchedGuestFor(conf);
              const color = matchColor(conf);
              const borderColor = color === "green" ? "rgba(76,201,122,.5)" : "rgba(212,122,75,.45)";
              const bgColor     = color === "green" ? "rgba(76,201,122,.05)" : "rgba(212,122,75,.06)";
              // Compute the human-readable mismatch reasons (used when guest is matched
              // by phone but other fields disagree). For unknown-phone confirmations,
              // there's no guest, so no reasons list to show.
              const status = guest ? guestConfirmationStatus(guest) : null;
              const reasons = (status && status.status === "mismatch") ? status.reasons : [];
              return (
                <div key={conf.id} style={{
                  marginBottom: 12, padding: 14, borderRadius: 14,
                  background: bgColor, border: `1.5px solid ${borderColor}`,
                  boxShadow: color === "red" ? "0 0 0 1px rgba(212,122,75,.08) inset" : "none",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: "#7a6a4a" }}>
                      {t("admin_conf_for_groom")} <span style={{ color: "#c9a84c", fontWeight: 700, direction: "ltr" }}>{conf.groomUsername}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "#5a5040" }}>
                      {new Date(conf.confirmedAt).toLocaleString(lang === "he" ? "he-IL" : "ar")}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: guest ? "1fr 1fr" : "1fr", gap: 10 }}>
                    {guest && (
                      <div style={{ padding: 10, background: "rgba(255,255,255,.03)", borderRadius: 8 }}>
                        <div style={{ fontSize: 10, color: "#7a6a4a", fontWeight: 700, marginBottom: 4 }}>
                          {t("admin_conf_from_groom")}
                        </div>
                        <div style={{ fontSize: 13, color: "#f5e6b8", fontWeight: 800 }}>{guest.name}</div>
                        <div style={{ fontSize: 11, color: "#a09070", direction: "ltr", textAlign: "right" }}>{guest.phone}</div>
                        <div style={{ fontSize: 11, color: "#7a6a4a", marginTop: 4 }}>
                          📍 {guest.area || t("admin_conf_no_address")}
                        </div>
                      </div>
                    )}
                    <div style={{ padding: 10, background: "rgba(255,255,255,.03)", borderRadius: 8 }}>
                      <div style={{ fontSize: 10, color: "#7a6a4a", fontWeight: 700, marginBottom: 4 }}>
                        {t("admin_conf_from_guest")}
                      </div>
                      <div style={{ fontSize: 13, color: "#f5e6b8", fontWeight: 800 }}>{conf.submittedName}</div>
                      <div style={{ fontSize: 11, color: "#a09070", direction: "ltr", textAlign: "right" }}>{conf.submittedPhone}</div>
                      <div style={{ fontSize: 11, color: "#7a6a4a", marginTop: 4 }}>
                        📍 {[conf.submittedCity, conf.submittedStreet, conf.submittedHouse].filter(Boolean).join("، ") || t("admin_conf_no_address")}
                      </div>
                    </div>
                  </div>

                  {/* Show *which* fields disagree, so the admin can fix the guest list (or trust the guest) at a glance */}
                  {reasons.length > 0 && (
                    <div style={{
                      marginTop: 10, padding: "8px 12px", borderRadius: 8,
                      background: "rgba(212,122,75,.07)", border: "1px solid rgba(212,122,75,.22)",
                      fontSize: 11, color: "#d47a4b", lineHeight: 1.7, display: "flex",
                      flexWrap: "wrap", gap: 8, alignItems: "center",
                    }}>
                      <span style={{ fontWeight: 800 }}>⚠</span>
                      {reasons.map((r, i) => (
                        <span key={i} style={{
                          padding: "2px 8px", borderRadius: 12,
                          background: "rgba(212,122,75,.14)", border: "1px solid rgba(212,122,75,.3)",
                          fontWeight: 700,
                        }}>{r}</span>
                      ))}
                    </div>
                  )}

                  {guest && (
                    <button onClick={() => useConfirmationData(conf)} style={{
                      marginTop: 10, width: "100%", padding: 9, borderRadius: 8,
                      background: "rgba(201,168,76,.15)", border: "1px solid rgba(201,168,76,.35)",
                      color: "#c9a84c", fontSize: 12, fontWeight: 800,
                      cursor: "pointer", fontFamily: "inherit",
                    }}>
                      💾 {t("admin_conf_use_guest_data")}
                    </button>
                  )}
                </div>
              );
            };

            return (
              <div>
                <div style={{ fontSize: 19, fontWeight: 900, color: "#c9a84c", fontFamily: "'Amiri',serif", marginBottom: 4 }}>
                  ✓ {t("admin_conf_title")}
                </div>
                <div style={{ fontSize: 12, color: "#7a6a4a", marginBottom: 16 }}>
                  {t("admin_conf_subtitle")}
                </div>

                {confirmations.length === 0 ? (
                  <div className="card" style={{ textAlign: "center", padding: 32, color: "#7a6a4a" }}>
                    {t("admin_conf_empty")}
                  </div>
                ) : (
                  <>
                    {matched.length > 0 && (
                      <div style={{ marginBottom: 18 }}>
                        <div style={{ fontSize: 13, color: "#4cc97a", fontWeight: 700, marginBottom: 10 }}>
                          {t("admin_conf_matched")} ({matched.length.toLocaleString("en")})
                        </div>
                        {matched.map(renderConf)}
                      </div>
                    )}
                    {mismatch.length > 0 && (
                      <div style={{ marginBottom: 18 }}>
                        <div style={{ fontSize: 13, color: "#d47a4b", fontWeight: 700, marginBottom: 10 }}>
                          ⚠ {lang === "he" ? "פרטים שונים" : "بيانات مختلفة"} ({mismatch.length.toLocaleString("en")})
                        </div>
                        {mismatch.map(renderConf)}
                      </div>
                    )}
                    {unknown.length > 0 && (
                      <div>
                        <div style={{ fontSize: 13, color: "#d47a4b", fontWeight: 700, marginBottom: 10 }}>
                          {t("admin_conf_unknown")} ({unknown.length.toLocaleString("en")})
                        </div>
                        {unknown.map(renderConf)}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
}
