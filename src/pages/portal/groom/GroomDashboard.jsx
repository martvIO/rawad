// Groom → Dashboard: stats, distribution progress, live map, recent deliveries.
import { useNavigate } from "react-router-dom";
import { LiveMap } from "../../../components/LiveMap.jsx";
import { usePortal } from "../../../context/PortalContext.jsx";
import { C } from "../../../styles/theme.js";
import { Num } from "../../../components/Num.jsx";

export function GroomDashboard() {
  const navigate = useNavigate();
  const {
    t, lang, stats, myGuests, setViewingPhoto,
    groomCoords, groomMapMarkers, driversSharingWithMe,
  } = usePortal();
  return (
          <div style={{ animation: "fadeUp .3s ease" }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 21, fontWeight: 900, color: C.goldLight, marginBottom: 4 }}>{t("dash_welcome")}</div>
              <div style={{ fontSize: 13, color: C.dim }}>{t("dash_subtitle")}</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12, marginBottom: 20 }}>
              {[
                { label:t("stat_total"),     val:stats.total,     color:C.goldLight, icon:"📋" },
                { label:t("stat_delivered"), val:stats.delivered, color:"#4cc97a", icon:"✓" },
                { label:t("stat_enroute"),   val:stats.enroute,   color:C.blue, icon:"🚗" },
                { label:t("stat_pending"),   val:stats.pending,   color:C.gold, icon:"⌛" },
              ].map(s => (
                <div key={s.label} className="card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 26 }}>{s.icon}</div>
                  <div>
                    <div style={{ fontSize: 26, fontWeight: 900, color: s.color }}><Num>{s.val.toLocaleString("en")}</Num></div>
                    <div style={{ fontSize: 11, color: C.dim }}>{s.label}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="gold-card" style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 14, color: C.goldDim, fontWeight: 700 }}>{t("progress_label")}</span>
                <span style={{ fontSize: 20, fontWeight: 900, color: C.gold }}><Num>{stats.pct}%</Num></span>
              </div>
              <div style={{ height: 10, background: "rgba(255,255,255,.06)", borderRadius: 5, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${stats.pct}%`,
                  background: "linear-gradient(90deg,#c9a84c,#f0c84c)",
                  borderRadius: 5, transition: "width .6s ease",
                }}/>
              </div>
            </div>

            {stats.expectedAttendees > 0 && (
              <div className="gold-card" data-testid="groom-expected-attendees" style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 26 }}>👥</div>
                <div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: C.gold }}><Num>{stats.expectedAttendees.toLocaleString("en")}</Num></div>
                  <div style={{ fontSize: 11, color: C.dim }}>
                    {lang === "he" ? "צפי נוכחים (כולל מלווים)" : "العدد المتوقع للحضور (مع المرافقين)"}
                  </div>
                </div>
              </div>
            )}

            {/* ── Live map on the dashboard: groom's own location + every driver sharing ── */}
            <div style={{ marginBottom: 22 }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: 10, gap: 8, flexWrap: "wrap",
              }}>
                <div style={{ fontSize: 12, color: C.dim, fontWeight: 700 }}>
                  {t("map_legend")}
                  {driversSharingWithMe.length > 0 && (
                    <span style={{ color: "#4cc97a", marginInlineStart: 8 }}>
                      · <Num>{driversSharingWithMe.length.toLocaleString("en")}</Num> {t("map_drivers_count")}
                    </span>
                  )}
                </div>
                <button onClick={() => navigate("/portal/groom/handwritten/live")} style={{
                  background: "rgba(201,168,76,.12)", border: "1px solid rgba(201,168,76,.3)",
                  color: C.gold, padding: "5px 12px", borderRadius: 8,
                  fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}>{lang === "he" ? "מסך מלא ←" : "تكبير ←"}</button>
              </div>

              {/* The actual map. Shown whether or not anyone is sharing — when nobody's
                  sharing the groom still sees themselves on a map. */}
              <div style={{
                borderRadius: 14, overflow: "hidden",
                border: "1px solid rgba(201,168,76,.18)",
              }}>
                {(groomCoords || driversSharingWithMe.length > 0) ? (
                  <LiveMap markers={groomMapMarkers} t={t} lang={lang} height={360}/>
                ) : (
                  <div style={{
                    height: 220, display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(255,255,255,.02)", color: C.dim,
                    fontSize: 13, textAlign: "center", padding: 24,
                  }}>
                    {t("map_no_location_yet")}
                  </div>
                )}
              </div>
            </div>

            <div style={{ fontSize: 13, color: C.dim, fontWeight: 700, marginBottom: 12 }}>{t("last_deliveries")}</div>
            {myGuests.filter(g => g.status === "delivered").map(g => {
              const isImg = typeof g.proofImg === "string" && g.proofImg.startsWith("data:image");
              return (
                <div key={g.id} className="card" style={{ marginBottom: 10, display: "flex", gap: 12, alignItems: "center" }}>
                  <div
                    onClick={() => isImg && setViewingPhoto(g.proofImg)}
                    style={{
                      width: 48, height: 48, borderRadius: 10, flexShrink: 0, overflow: "hidden",
                      background: "rgba(255,255,255,.04)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: isImg ? "zoom-in" : "default",
                    }}>
                    {isImg
                      ? <img src={g.proofImg} alt="proof" style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
                      : <span style={{ fontSize: 24 }}>{g.proofImg || "📸"}</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, color: C.goldLight, fontSize: 14 }}>{g.name}</div>
                    {g.area && <div style={{ fontSize: 12, color: C.dim }}>{g.area}</div>}
                  </div>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ color: "#4cc97a", fontSize: 12, fontWeight: 700 }}>{t("arrived")}</div>
                    <div style={{ color: "#5a5040", fontSize: 11 }}>{g.deliveredAt}</div>
                  </div>
                </div>
              );
            })}
          </div>
  );
}
