// Driver → Shared-cities tab: distribute for several grooms in one city in a single round.
import { telLink } from "../../../utils/phone.js";
import { wazeLink, extractCity as extractCityRaw } from "../../../utils/geo.js";
import { usePortal } from "../../../context/PortalContext.jsx";

export function SharedCities() {
  const {
    t, lang, users, guests,
    sharedStep, setSharedStep, sharedSelectedGrooms, setSharedSelectedGrooms,
    sharedSelectedCity, setSharedSelectedCity,
  } = usePortal();
  // City extractor, bound to the current language (used by the slice below).
  const extractCity = (area) => extractCityRaw(area, lang);
          const groomUsers = users.filter(u => u.role === "groom");
          const toggleGroom = (uname) => setSharedSelectedGrooms(prev =>
            prev.includes(uname) ? prev.filter(x => x !== uname) : [...prev, uname]
          );
          // Aggregate pending guests from selected grooms
          const pool = guests.filter(g =>
            g.status !== "delivered" && sharedSelectedGrooms.includes(g.groomUsername)
          );
          // Cities → list of guests
          const cityMap = new Map();
          for (const g of pool) {
            const c = extractCity(g.area);
            if (!cityMap.has(c)) cityMap.set(c, []);
            cityMap.get(c).push(g);
          }
          const sharedCities = [];
          for (const [c, list] of cityMap.entries()) {
            // Only include city if it has guests from 2+ grooms (truly shared) OR if 1 groom but user wants it
            const groomsInCity = new Set(list.map(g => g.groomUsername));
            sharedCities.push({ city: c, list, groomCount: groomsInCity.size });
          }
          // Prioritize truly-shared cities (2+ grooms) first
          sharedCities.sort((a, b) => b.groomCount - a.groomCount || b.list.length - a.list.length);

          return (
            <div style={{ animation: "fadeUp .3s ease" }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#c9a84c", fontFamily: "'Amiri',serif", marginBottom: 4 }}>
                  🏘 {t("shared_title")}
                </div>
                <div style={{ fontSize: 12, color: "#7a6a4a", lineHeight: 1.7 }}>
                  {t("shared_subtitle")}
                </div>
              </div>

              {sharedStep === "pickGrooms" && (
                <>
                  <div style={{ fontSize: 13, color: "#a09070", fontWeight: 700, marginBottom: 10 }}>
                    {t("shared_pick_grooms_label")}
                  </div>
                  {groomUsers.length === 0 ? (
                    <div className="card" style={{ textAlign: "center", padding: 32, color: "#7a6a4a" }}>
                      {t("shared_grooms_empty")}
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 18 }}>
                        {groomUsers.map(u => {
                          const isSel = sharedSelectedGrooms.includes(u.username);
                          return (
                            <button key={u.id} onClick={() => toggleGroom(u.username)} style={{
                              padding: "12px 10px", borderRadius: 12, cursor: "pointer",
                              background: isSel ? "rgba(201,168,76,.18)" : "rgba(255,255,255,.03)",
                              border: `1.5px solid ${isSel ? "#c9a84c" : "rgba(255,255,255,.08)"}`,
                              color: isSel ? "#c9a84c" : "#a09070",
                              fontWeight: 800, fontSize: 13, fontFamily: "inherit", textAlign: "center",
                              display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                              transition: "all .2s",
                            }}>
                              <span style={{ fontSize: 22 }}>{isSel ? "✓" : "♥"}</span>
                              <span style={{ direction: "ltr" }}>{u.username}</span>
                            </button>
                          );
                        })}
                      </div>
                      <button
                        disabled={sharedSelectedGrooms.length === 0}
                        onClick={() => setSharedStep("pickCity")}
                        style={{
                          width: "100%", padding: 12, borderRadius: 12,
                          background: sharedSelectedGrooms.length > 0 ? "linear-gradient(135deg,#c9a84c,#f0c84c)" : "rgba(255,255,255,.05)",
                          color: sharedSelectedGrooms.length > 0 ? "#000" : "#5a5040",
                          border: "none", fontWeight: 900, fontSize: 14, fontFamily: "inherit",
                          cursor: sharedSelectedGrooms.length > 0 ? "pointer" : "not-allowed",
                        }}>
                        {t("shared_view_btn")}
                      </button>
                    </>
                  )}
                </>
              )}

              {sharedStep === "pickCity" && (
                <>
                  <button onClick={() => setSharedStep("pickGrooms")} style={{
                    background: "none", border: "none", color: "#c9a84c", cursor: "pointer",
                    fontSize: 12, fontWeight: 700, marginBottom: 14, fontFamily: "inherit",
                  }}>{t("shared_back_to_grooms")}</button>

                  <div style={{ fontSize: 13, color: "#a09070", fontWeight: 700, marginBottom: 12 }}>
                    {t("shared_pick_city")}
                  </div>

                  {sharedCities.length === 0 ? (
                    <div className="card" style={{ textAlign: "center", padding: 32, color: "#7a6a4a" }}>
                      {t("shared_no_pending")}
                    </div>
                  ) : (
                    sharedCities.map(({ city, list, groomCount }) => (
                      <div key={city} onClick={() => { setSharedSelectedCity(city); setSharedStep("viewRoute"); }}
                        style={{
                          cursor: "pointer", marginBottom: 10, padding: "14px 16px",
                          borderRadius: 14,
                          background: groomCount > 1 ? "rgba(75,159,212,.07)" : "rgba(255,255,255,.03)",
                          border: `1px solid ${groomCount > 1 ? "rgba(75,159,212,.3)" : "rgba(255,255,255,.08)"}`,
                          display: "flex", alignItems: "center", gap: 12,
                        }}>
                        <span style={{ fontSize: 22 }}>🏘</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800, color: "#f5e6b8", fontSize: 14 }}>{city}</div>
                          <div style={{ fontSize: 11, color: "#7a6a4a", marginTop: 2 }}>
                            {list.length.toLocaleString("en")} {t("shared_city_count")} · {groomCount.toLocaleString("en")} {groomCount === 1 ? (lang === "he" ? "חתן" : "عريس") : (lang === "he" ? "חתנים" : "عرسان")}
                          </div>
                        </div>
                        <span style={{ color: "#c9a84c", fontSize: 18 }}>←</span>
                      </div>
                    ))
                  )}
                </>
              )}

              {sharedStep === "viewRoute" && sharedSelectedCity && (() => {
                // Get pending guests in the selected city across selected grooms, ordered
                const cityGuests = guests
                  .filter(g => g.status !== "delivered"
                    && sharedSelectedGrooms.includes(g.groomUsername)
                    && extractCity(g.area) === sharedSelectedCity)
                  .sort((a, b) => (a.area || "").localeCompare(b.area || ""));
                return (
                  <>
                    <button onClick={() => { setSharedStep("pickCity"); setSharedSelectedCity(null); }} style={{
                      background: "none", border: "none", color: "#c9a84c", cursor: "pointer",
                      fontSize: 12, fontWeight: 700, marginBottom: 14, fontFamily: "inherit",
                    }}>{t("shared_back_to_cities")}</button>

                    <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 12,
                      background: "rgba(201,168,76,.08)", border: "1px solid rgba(201,168,76,.22)" }}>
                      <div style={{ fontSize: 12, color: "#7a6a4a" }}>{t("shared_route_in")}</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: "#c9a84c", fontFamily: "'Amiri',serif" }}>
                        🏘 {sharedSelectedCity}
                      </div>
                    </div>

                    {cityGuests.map((g, idx) => (
                      <div key={g.id} style={{
                        background: idx === 0 ? "rgba(75,159,212,.07)" : "rgba(255,255,255,.03)",
                        border: `1.5px solid ${idx === 0 ? "rgba(75,159,212,.28)" : "rgba(255,255,255,.08)"}`,
                        borderRadius: 16, padding: "14px 16px", marginBottom: 10,
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                          <div style={{ flex: 1, display: "flex", gap: 10, alignItems: "flex-start" }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                              background: idx === 0 ? "rgba(75,159,212,.2)" : "rgba(255,255,255,.05)",
                              color: idx === 0 ? "#4b9fd4" : "#7a6a4a",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontWeight: 900, fontSize: 13,
                            }}>{idx + 1}</div>
                            <div>
                              <div style={{ fontWeight: 800, color: "#f5e6b8", fontSize: 15 }}>{g.name}</div>
                              <div style={{ fontSize: 10, color: "#c9a84c", marginTop: 3 }}>
                                {t("for_groom")} <span style={{ direction: "ltr" }}>{g.groomUsername}</span>
                              </div>
                              {g.area && <div style={{ fontSize: 12, color: "#7a6a4a", marginTop: 3 }}>📍 {g.area}</div>}
                            </div>
                          </div>
                          {idx === 0 && (
                            <span style={{
                              fontSize: 10, padding: "3px 10px", borderRadius: 20,
                              background: "rgba(75,159,212,.15)", color: "#4b9fd4", fontWeight: 700,
                            }}>{t("driver_next")}</span>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <a href={telLink(g.phone)} style={{
                            flex: 1, padding: "9px 0", borderRadius: 10, textAlign: "center",
                            background: "rgba(76,201,122,.12)", border: "1px solid rgba(76,201,122,.35)",
                            color: "#4cc97a", fontSize: 13, fontWeight: 700, display: "flex",
                            alignItems: "center", justifyContent: "center", gap: 6,
                          }}>📞 <span style={{ direction: "ltr" }}>{g.phone}</span></a>
                          {g.area && (
                            <a href={wazeLink(g.area)} target="_blank" rel="noreferrer" style={{
                              flex: 1, padding: "9px 0", borderRadius: 10, textAlign: "center",
                              background: "rgba(0,160,220,.12)", border: "1px solid rgba(0,160,220,.35)",
                              color: "#00b4dc", fontSize: 13, fontWeight: 700, display: "flex",
                              alignItems: "center", justifyContent: "center", gap: 6,
                            }}>{t("driver_open_waze")}</a>
                          )}
                        </div>
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>
          );
}
