// Groom → Live: full-size live map of the groom + every driver sharing with them.
import { LiveMap } from "../../../components/LiveMap.jsx";
import { usePortal } from "../../../context/PortalContext.jsx";
import { C } from "../../../styles/theme.js";
import { Num } from "../../../components/Num.jsx";

export function GroomLiveMap() {
  const {
    t, lang, groomGeoPermission, groomGeoError, requestGroomLocation,
    groomCoords, groomMapMarkers, driversSharingWithMe,
  } = usePortal();
  return (
          <div style={{ animation: "fadeUp .3s ease" }}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 19, fontWeight: 900, color: C.gold, fontFamily: "'Amiri','Frank Ruhl Libre',serif", marginBottom: 4 }}>
                {t("live_title")}
              </div>
              <div style={{ fontSize: 12, color: C.dim }}>
                {t("live_subtitle")}
              </div>
            </div>

            {/* Groom location permission */}
            {groomGeoPermission !== "granted" && (
              <div style={{
                padding: "12px 14px", borderRadius: 12, marginBottom: 12,
                background: groomGeoPermission === "denied" ? "rgba(212,122,75,.08)" : "rgba(75,159,212,.06)",
                border: `1px solid ${groomGeoPermission === "denied" ? "rgba(212,122,75,.28)" : "rgba(75,159,212,.22)"}`,
                display: "flex", flexDirection: "column", gap: 8,
              }}>
                {groomGeoPermission === "denied" && groomGeoError && (
                  <div style={{ fontSize: 12, color: C.red, lineHeight: 1.6 }}>⚠ {groomGeoError}</div>
                )}
              </div>
            )}

            {/* Active drivers banner */}
            {driversSharingWithMe.length > 0 && (
              <div style={{
                marginBottom: 12, padding: "10px 14px", borderRadius: 10,
                background: "rgba(76,201,122,.06)", border: "1px solid rgba(76,201,122,.22)",
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap",
              }}>
                <div style={{ fontSize: 12, color: "#4cc97a", fontWeight: 700 }}>
                  🚗 <Num>{driversSharingWithMe.length.toLocaleString("en")}</Num> {t("map_drivers_count")}{" "}
                  · <span style={{ direction: "ltr", color: C.gold }}>
                    {driversSharingWithMe.map(d => d.driver).join(", ")}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: "#4cc97a", fontWeight: 700 }}>
                  {t("geo_updating")}
                </div>
              </div>
            )}

            {/* The map. Always shown — even if no driver is sharing, the groom sees themselves. */}
            <div style={{
              borderRadius: 14, overflow: "hidden",
              border: "1px solid rgba(201,168,76,.18)",
              background: "#fff",
            }}>
              {(groomCoords || driversSharingWithMe.length > 0) ? (
                <LiveMap markers={groomMapMarkers} t={t} lang={lang} height={520}/>
              ) : (
                <div style={{
                  height: 380, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  background: "rgba(255,255,255,.02)", color: C.dim,
                  fontSize: 14, textAlign: "center", padding: 24, gap: 14,
                }}>
                  <div style={{ fontSize: 48 }}>📡</div>
                  <div style={{ fontWeight: 800, color: C.gold }}>
                    {driversSharingWithMe.length === 0 ? t("no_driver_sharing") : t("map_no_location_yet")}
                  </div>
                  <div style={{ fontSize: 12, color: C.dim, maxWidth: 420, lineHeight: 1.8 }}>
                    {t("live_empty_body")}
                  </div>
                </div>
              )}
            </div>

            {/* Per-driver detail rows under the map (last fix time + accuracy) */}
            {driversSharingWithMe.length > 0 && (
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                {driversSharingWithMe.map(d => (
                  <div key={d.driver} className="card" style={{
                    padding: "10px 14px", display: "flex", alignItems: "center", gap: 12,
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%",
                      background: "linear-gradient(135deg,#4b9fd4,#3a7fb0)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 18, flexShrink: 0,
                    }}>🚗</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, color: C.goldLight, fontSize: 13, direction: "ltr", textAlign: "right" }}>
                        {d.driver}
                      </div>
                      <div style={{ fontSize: 10, color: C.dim, direction: "ltr", textAlign: "right" }}>
                        {d.lat.toFixed(5)}, {d.lng.toFixed(5)} · ±{d.accuracy || 0}{t("geo_meters")}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: "#4cc97a", fontWeight: 700, whiteSpace: "nowrap" }}>
                      {d.time ? d.time.toLocaleTimeString(lang === "he" ? "he-IL" : "ar", { hour: "2-digit", minute: "2-digit", second: "2-digit", numberingSystem: "latn" }) : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
  );
}
