// Driver → main route: pending guests grouped by city, the delivery form,
// the live-location share panel, and the completed list.
import { telLink } from "../../../utils/phone.js";
import { wazeLink, extractCity as extractCityRaw } from "../../../utils/geo.js";
import { usePortal } from "../../../context/PortalContext.jsx";

export function DriverDeliveryList() {
  const {
    t, lang, myGuests, users,
    liveShareWith, setLiveShareWith, driverIsSharing, driverGeoPermission,
    driverGeoError, driverCoords, myLiveLocation, saveLiveLocation, stopLiveLocation,
    activeId, setActiveId, photoTaken, setPhotoTaken, photoData, setPhotoData,
    deliveryNote, setDeliveryNote, markDelivered,
  } = usePortal();

  const pending = myGuests.filter(g => g.status !== "delivered");
  const done    = myGuests.filter(g => g.status === "delivered");
  const pct = myGuests.length ? Math.round(done.length / myGuests.length * 100) : 0;

  // Extract city/town from area string (text before first "-" or first comma)
  const extractCity = (area) => extractCityRaw(area, lang);

  // Group pending guests by city, then sort within each city by area string
  // for rough proximity ordering (houses with similar street names tend to be close).
  const groupedPending = (() => {
    const map = new Map();
    for (const g of pending) {
      const city = extractCity(g.area);
      if (!map.has(city)) map.set(city, []);
      map.get(city).push(g);
    }
    const groups = [];
    for (const [city, list] of map.entries()) {
      list.sort((a, b) => (a.area || "").localeCompare(b.area || ""));
      groups.push({ city, list });
    }
    // Cities with most guests first (better route efficiency)
    groups.sort((a, b) => b.list.length - a.list.length);
    return groups;
  })();

  // Flat sequence so we can show the overall ordinal number (1, 2, 3, ...)
  const orderedSequence = groupedPending.flatMap(grp => grp.list);

  return (
    <>
          {/* Progress bar */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ height: 8, background: "rgba(255,255,255,.05)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${pct}%`,
                background: "linear-gradient(90deg,#4b9fd4,#4cc97a)",
                borderRadius: 4, transition: "width .6s ease",
              }}/>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "#7a6a4a" }}>
              <span>{t("driver_remaining")} {pending.length.toLocaleString("en")}</span>
              <span style={{ color: "#c9a84c", fontWeight: 700 }}>{pct}%</span>
              <span>{t("driver_done")} {done.length.toLocaleString("en")}</span>
            </div>
          </div>

          {/* ── LIVE LOCATION SHARE (real-time GPS, per-driver, choose which grooms see it) ── */}
          {(() => {
            const groomUsers = users.filter(u => u.role === "groom");
            const toggleGroom = (uname) => setLiveShareWith(prev =>
              prev.includes(uname) ? prev.filter(x => x !== uname) : [...prev, uname]
            );
            const isActive = driverIsSharing && driverGeoPermission === "granted";
            const myStoredLoc = myLiveLocation; // freshness comes from the 1s push
            return (
              <div style={{
                marginBottom: 22, padding: 16, borderRadius: 14,
                background: isActive ? "rgba(76,201,122,.06)" : "rgba(75,159,212,.04)",
                border: `1px solid ${isActive ? "rgba(76,201,122,.25)" : "rgba(75,159,212,.18)"}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 18 }}>📡</span>
                  <div style={{ fontSize: 13, fontWeight: 800, color: isActive ? "#4cc97a" : "#4b9fd4" }}>
                    {t("share_section")}
                  </div>
                </div>

                {isActive ? (
                  /* ─── BROADCASTING ─── */
                  <>
                    <div style={{ fontSize: 12, color: "#4cc97a", fontWeight: 700, marginBottom: 4 }}>
                      {t("geo_share_active")}
                    </div>
                    <div style={{ fontSize: 11, color: "#7a6a4a", marginBottom: 8, lineHeight: 1.7 }}>
                      {t("share_active_with")}{" "}
                      <span style={{ color: "#c9a84c", fontWeight: 700, direction: "ltr" }}>
                        {liveShareWith
                          .map(uid => groomUsers.find(u => (u.uid || u.id) === uid)?.username || uid)
                          .join(", ")}
                      </span>
                    </div>

                    {/* Live coordinate + accuracy readout */}
                    {driverCoords && (
                      <div style={{
                        padding: "10px 12px", borderRadius: 10, marginBottom: 10,
                        background: "rgba(76,201,122,.05)", border: "1px solid rgba(76,201,122,.18)",
                        display: "flex", flexDirection: "column", gap: 4,
                      }}>
                        <div style={{ fontSize: 11, color: "#7a6a4a", direction: "ltr", textAlign: "right" }}>
                          📍 {driverCoords.lat.toFixed(5)}, {driverCoords.lng.toFixed(5)}
                        </div>
                        <div style={{ fontSize: 11, color: "#7a6a4a" }}>
                          {t("geo_accuracy")} ±{driverCoords.accuracy} {t("geo_meters")}
                        </div>
                        <div style={{ fontSize: 10, color: "#4cc97a", fontWeight: 700 }}>
                          {t("geo_updating")}
                        </div>
                      </div>
                    )}
                    <button onClick={stopLiveLocation} style={{
                      width: "100%", padding: "10px 0", borderRadius: 10, cursor: "pointer",
                      background: "rgba(212,122,75,.12)", border: "1px solid rgba(212,122,75,.3)",
                      color: "#d47a4b", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                    }}>{t("geo_share_stop")}</button>
                  </>
                ) : (
                  /* ─── NOT BROADCASTING — show permission flow + start button ─── */
                  <>
                    <div style={{
                      fontSize: 11, color: "#a09070", marginBottom: 12, lineHeight: 1.9,
                      padding: "10px 14px", borderRadius: 10,
                      background: "rgba(38,165,228,.06)", border: "1px solid rgba(38,165,228,.22)",
                      whiteSpace: "pre-line",
                    }}>
                      {t("geo_hint_new")}
                    </div>

                    {/* Permission denied message */}
                    {driverGeoPermission === "denied" && driverGeoError && (
                      <div style={{
                        padding: "10px 12px", borderRadius: 10, marginBottom: 12,
                        background: "rgba(212,122,75,.08)", border: "1px solid rgba(212,122,75,.3)",
                        fontSize: 12, color: "#d47a4b", lineHeight: 1.6,
                      }}>
                        ⚠ {driverGeoError}
                      </div>
                    )}

                    <div style={{ marginBottom: 6, fontSize: 11, color: "#7a6a4a", fontWeight: 700 }}>
                      {t("share_pick_grooms")}
                    </div>
                    {groomUsers.length === 0 ? (
                      <div style={{ padding: "10px 12px", borderRadius: 8, marginBottom: 12,
                        background: "rgba(255,255,255,.03)", color: "#5a5040", fontSize: 12, textAlign: "center" }}>
                        {t("share_no_grooms_yet")}
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                        {groomUsers.map(u => {
                          const uid = u.uid || u.id;
                          const isSel = liveShareWith.includes(uid);
                          return (
                            <button key={uid} onClick={() => toggleGroom(uid)} style={{
                              padding: "6px 12px", borderRadius: 20, cursor: "pointer",
                              background: isSel ? "rgba(201,168,76,.2)" : "rgba(255,255,255,.04)",
                              border: `1.5px solid ${isSel ? "#c9a84c" : "rgba(255,255,255,.1)"}`,
                              color: isSel ? "#c9a84c" : "#7a6a4a",
                              fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                              display: "flex", alignItems: "center", gap: 6,
                            }}>
                              <span>{isSel ? "✓" : "○"}</span>
                              <span style={{ direction: "ltr" }}>{u.username}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* The single primary button. Label depends on permission state.
                        Pressing it FIRST triggers the browser permission prompt; if
                        granted, it kicks off the watch + the 1s push loop.        */}
                    <button onClick={saveLiveLocation}
                            disabled={liveShareWith.length === 0}
                            style={{
                              width: "100%", padding: "11px 0", borderRadius: 10,
                              background: liveShareWith.length > 0
                                ? "linear-gradient(135deg,#4b9fd4,#3a7fb0)" : "rgba(255,255,255,.05)",
                              color: liveShareWith.length > 0 ? "#fff" : "#5a5040",
                              border: "none", fontSize: 13, fontWeight: 800, fontFamily: "inherit",
                              cursor: liveShareWith.length > 0 ? "pointer" : "not-allowed",
                            }}>
                      {driverGeoPermission === "denied"
                        ? `${t("geo_retry")} — ${t("geo_grant_btn_driver")}`
                        : driverGeoPermission === "granted"
                          ? t("geo_share_start")
                          : t("geo_grant_btn_driver")}
                    </button>
                  </>
                )}
              </div>
            );
          })()}

          {/* Pending — grouped by city */}
          {pending.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: "#7a6a4a", fontWeight: 700, marginBottom: 12 }}>
                {t("driver_list_title")}
              </div>

              {groupedPending.map((group, gIdx) => (
                <div key={group.city} style={{ marginBottom: 22 }}>
                  {/* City header */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
                    padding: "8px 12px", borderRadius: 10,
                    background: "rgba(201,168,76,.08)", border: "1px solid rgba(201,168,76,.2)",
                  }}>
                    <span style={{ fontSize: 16 }}>🏘</span>
                    <div style={{ flex: 1, fontWeight: 800, color: "#c9a84c", fontSize: 14 }}>
                      {group.city}
                    </div>
                    <span style={{ fontSize: 11, color: "#7a6a4a" }}>
                      {group.list.length.toLocaleString("en")}
                    </span>
                  </div>

                  {group.list.map((g) => {
                    const ordinal = orderedSequence.indexOf(g) + 1;
                    const isNext = ordinal === 1;
                    return (
                    <div key={g.id} style={{
                      background: isNext ? "rgba(75,159,212,.07)" : "rgba(255,255,255,.03)",
                      border: `1.5px solid ${isNext ? "rgba(75,159,212,.28)" : "rgba(255,255,255,.08)"}`,
                      borderRadius: 16, padding: "14px 16px", marginBottom: 10,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                        <div style={{ flex: 1, display: "flex", gap: 10, alignItems: "flex-start" }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                            background: isNext ? "rgba(75,159,212,.2)" : "rgba(255,255,255,.05)",
                            color: isNext ? "#4b9fd4" : "#7a6a4a",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontWeight: 900, fontSize: 13,
                          }}>{ordinal}</div>
                          <div>
                            <div style={{ fontWeight: 800, color: "#f5e6b8", fontSize: 15 }}>{g.name}</div>
                            {g.area && <div style={{ fontSize: 12, color: "#7a6a4a", marginTop: 4 }}>📍 {g.area}</div>}
                          </div>
                        </div>
                        {isNext && (
                          <span style={{
                            fontSize: 10, padding: "3px 10px", borderRadius: 20,
                            background: "rgba(75,159,212,.15)", color: "#4b9fd4", fontWeight: 700,
                          }}>{t("driver_next")}</span>
                        )}
                      </div>

                      {/* Phone + Waze (or no-address fallback) */}
                      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                        <a href={telLink(g.phone)} style={{
                          flex: 1, padding: "10px 0", borderRadius: 10, textAlign: "center",
                          background: "rgba(76,201,122,.12)", border: "1px solid rgba(76,201,122,.35)",
                          color: "#4cc97a", fontSize: 13, fontWeight: 700, display: "flex",
                          alignItems: "center", justifyContent: "center", gap: 6,
                        }}>
                          📞 <span style={{ direction: "ltr" }}>{g.phone}</span>
                        </a>
                        {g.area ? (
                          <a href={wazeLink(g.area)} target="_blank" rel="noreferrer" style={{
                            flex: 1, padding: "10px 0", borderRadius: 10, textAlign: "center",
                            background: "rgba(0,160,220,.12)", border: "1px solid rgba(0,160,220,.35)",
                            color: "#00b4dc", fontSize: 13, fontWeight: 700, display: "flex",
                            alignItems: "center", justifyContent: "center", gap: 6,
                          }}>{t("driver_open_waze")}</a>
                        ) : (
                          <div style={{
                            flex: 1, padding: "10px 0", borderRadius: 10, textAlign: "center",
                            background: "rgba(255,255,255,.03)", border: "1px dashed rgba(255,255,255,.1)",
                            color: "#5a5040", fontSize: 12, display: "flex",
                            alignItems: "center", justifyContent: "center",
                          }}>{t("driver_no_address")}</div>
                        )}
                      </div>

                      <button onClick={() => { setActiveId(activeId === g.id ? null : g.id); setPhotoTaken(false); setDeliveryNote(""); }}
                              style={{
                                width: "100%", padding: "10px 0", borderRadius: 10, cursor: "pointer",
                                background: activeId === g.id ? "rgba(201,168,76,.15)" : "rgba(201,168,76,.08)",
                                border: "1px solid rgba(201,168,76,.35)",
                                color: "#c9a84c", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                              }}>
                        {activeId === g.id ? t("driver_cancel") : t("driver_deliver_btn")}
                      </button>

                      {/* Delivery confirm panel */}
                      {activeId === g.id && (
                        <div style={{
                          marginTop: 14, padding: 14,
                          background: "rgba(76,201,122,.04)", border: "1px solid rgba(76,201,122,.18)",
                          borderRadius: 12, animation: "slideUp .3s ease",
                        }}>
                          <div style={{ fontSize: 12, color: "#4cc97a", fontWeight: 700, marginBottom: 12 }}>
                            {t("driver_complete_form")}
                          </div>

                          <div style={{ marginBottom: 6, fontSize: 12, color: "#7a6a4a" }}>
                            {t("driver_photo_label")} <span style={{ color: "#5a5040", fontWeight: 400 }}>{t("driver_photo_optional")}</span>
                          </div>
                          <label style={{
                            display: "block",
                            border: `2px dashed ${photoTaken ? "rgba(76,201,122,.5)" : "rgba(76,201,122,.25)"}`,
                            borderRadius: 10, padding: "16px 0", textAlign: "center",
                            marginBottom: 12, cursor: "pointer",
                            background: photoTaken ? "rgba(76,201,122,.08)" : "rgba(76,201,122,.02)",
                            transition: "all .2s",
                          }}>
                            <input type="file" accept="image/*" capture="environment"
                                   style={{ display: "none" }}
                                   onChange={e => {
                                     const file = e.target.files?.[0];
                                     if (!file) { setPhotoTaken(false); setPhotoData(null); return; }
                                     const reader = new FileReader();
                                     reader.onloadend = () => {
                                       setPhotoTaken(true);
                                       setPhotoData(typeof reader.result === "string" ? reader.result : null);
                                     };
                                     reader.readAsDataURL(file);
                                   }}/>
                            {photoTaken && photoData ? (
                              <>
                                <img src={photoData} alt="proof"
                                     style={{ maxWidth: 110, maxHeight: 110, borderRadius: 8, objectFit: "cover", marginBottom: 6 }}/>
                                <div style={{ fontSize: 12, color: "#4cc97a", fontWeight: 700 }}>{t("driver_photo_done")}</div>
                                <div style={{ fontSize: 10, color: "#5a7a5a", marginTop: 4 }}>{t("driver_photo_retake")}</div>
                              </>
                            ) : (
                              <>
                                <div style={{ fontSize: 32, marginBottom: 4 }}>📷</div>
                                <div style={{ fontSize: 12, color: "#5a7a5a" }}>{t("driver_photo_hint")}</div>
                              </>
                            )}
                          </label>

                          <div style={{ marginBottom: 6, fontSize: 12, color: "#7a6a4a" }}>{t("driver_note_label")}</div>
                          <input className="input-field" type="text"
                                 placeholder={t("driver_note_placeholder")}
                                 value={deliveryNote} onChange={e => setDeliveryNote(e.target.value)}
                                 style={{ marginBottom: 12, fontSize: 13 }}/>

                          <button onClick={() => markDelivered(g.id)} style={{
                            width: "100%", padding: 12, borderRadius: 10, border: "none",
                            background: "linear-gradient(135deg,#4cc97a,#2da85a)",
                            color: "#000", fontWeight: 900, fontSize: 14, fontFamily: "inherit",
                            cursor: "pointer", transition: "all .2s",
                          }}>{t("driver_confirm")}</button>
                        </div>
                      )}
                    </div>
                  );})}
                </div>
              ))}
            </>
          )}

          {/* Done list */}
          {done.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: "#7a6a4a", fontWeight: 700, margin: "20px 0 12px" }}>
                {t("driver_done_section")} ({done.length.toLocaleString("en")})
              </div>
              {done.map(g => (
                <div key={g.id} style={{
                  background: "rgba(76,201,122,.04)", border: "1px solid rgba(76,201,122,.14)",
                  borderRadius: 14, padding: "12px 16px", marginBottom: 8,
                  display: "flex", gap: 12, alignItems: "center",
                }}>
                  <div style={{ fontSize: 22 }}>✓</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, color: "rgba(245,230,184,.7)", fontSize: 14 }}>{g.name}</div>
                    <div style={{ fontSize: 11, color: "#4a7a4a" }}>
                      {g.area ? `📍 ${g.area} · ` : ""}{g.deliveredAt || ""}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "#4cc97a", fontWeight: 700 }}>{t("driver_delivered_badge")}</div>
                </div>
              ))}
            </>
          )}

          {pending.length === 0 && myGuests.length > 0 && (
            <div style={{ textAlign: "center", padding: "44px 0" }}>
              <div style={{ fontSize: 60, marginBottom: 12 }}>🎉</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#4cc97a" }}>{t("driver_all_done_title")}</div>
              <div style={{ fontSize: 13, color: "#7a6a4a", marginTop: 8 }}>{t("driver_all_done_subtitle")}</div>
            </div>
          )}
    </>
  );
}
