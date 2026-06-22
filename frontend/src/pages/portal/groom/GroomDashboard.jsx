// Groom → Dashboard: stats, distribution progress, live map, recent deliveries.
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { LiveMap } from "../../../components/LiveMap.jsx";
import { replyStateOf } from "../../../data/status.js";
import { usePortal } from "../../../context/PortalContext.jsx";
import { C } from "../../../styles/theme.js";
import { Num } from "../../../components/Num.jsx";
import { useListFilter } from "../../../utils/searchFilter.js";
import { SearchBar } from "../../../components/SearchBar.jsx";
import { isProofImage } from "../../../utils/mediaUtils.js";
import { OnboardingChecklist } from "../../../components/OnboardingChecklist.jsx";
import { Icon } from "../../../components/icons/Icon.jsx";

// Stable module-level field spec for the recent-deliveries search (see useListFilter).
const DELIVERIES_FIELDS = ["name", "area"];

export function GroomDashboard() {
  const navigate = useNavigate();
  const {
    t, lang, stats, myGuests, guestsLoading, setViewingPhoto,
    groomCoords, groomMapMarkers, driversSharingWithMe,
  } = usePortal();

  // Recent-deliveries list = the already-delivered subset of myGuests. Stats
  // tiles + progress stay on the FULL myGuests; only this list is searchable.
  const deliveredGuests = myGuests.filter(g => g.status === "delivered");
  const { query, setQuery, filtered } = useListFilter(deliveredGuests, {
    fields: DELIVERIES_FIELDS, lang,
  });

  // Reply rollup — how many guests have confirmed their details vs are still
  // awaiting a reply vs were never sent an invite. (Delivery ≠ reply: the tiles
  // above track physical delivery; this tracks who responded.)
  const reply = useMemo(() => {
    let confirmed = 0, pending = 0, notSent = 0;
    for (const g of myGuests) {
      const s = replyStateOf(g);
      if (s === "confirmed") confirmed++;
      else if (s === "pending") pending++;
      else notSent++;
    }
    return { confirmed, pending, notSent };
  }, [myGuests]);

  return (
          <div style={{ animation: "fadeUp .3s ease" }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 21, fontWeight: 900, color: C.goldLight, marginBottom: 4 }}>{t("dash_welcome")}</div>
              <div style={{ fontSize: 13, color: C.dim }}>{t("dash_subtitle")}</div>
            </div>

            {/* Always-on progress guide — shown to every groom on every visit (not
                just first-run); completed steps render struck-through. Gated only on
                the guest load so the step checkmarks are correct on first paint. */}
            {!guestsLoading && (
              <OnboardingChecklist
                title={lang === "he" ? "מתחילים ב-3 צעדים" : "ابدأ بثلاث خطوات"}
                steps={[
                  { label: lang === "he" ? "הוסיפו את רשימת המוזמנים" : "أضف قائمة المدعوين", done: myGuests.length > 0 },
                  { label: lang === "he" ? "הצוות שלנו מחלק את ההזמנות ומתעד כל מסירה בתמונה" : "فريقنا يوزّع المكاتيب ويوثّق كل تسليم بصورة", done: stats.delivered > 0 },
                  { label: lang === "he" ? "עקבו אחר אישורי ההגעה" : "تابع تأكيدات التسليم", done: reply.confirmed > 0 },
                ]}
                note={lang === "he"
                  ? "אתם רק מכינים את הרשימה — צוות דעוה מחלק את ההזמנות, מתעד כל מסירה ומעדכן אתכם."
                  : "أنت فقط تجهّز القائمة — فريق دعوة يتكفّل بالتوزيع وتوثيق كل تسليم وإطلاعك أولاً بأول."}
              />
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12, marginBottom: 20 }}>
              {[
                { label:t("stat_total"),     val:stats.total,     color:C.goldLight, iconName:"list" },
                { label:t("stat_delivered"), val:stats.delivered, color:"#4cc97a", iconName:"check" },
                { label:t("stat_enroute"),   val:stats.enroute,   color:C.blue, iconName:"car" },
                { label:t("stat_pending"),   val:stats.pending,   color:C.gold, iconName:"hourglass" },
              ].map(s => (
                <div key={s.label} className="card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ display: "flex", color: s.color }}><Icon name={s.iconName} size={26} /></div>
                  <div>
                    <div style={{ fontSize: 26, fontWeight: 900, color: s.color }}><Num>{s.val.toLocaleString("en")}</Num></div>
                    <div style={{ fontSize: 11, color: C.dim }}>{s.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Reply rollup — who confirmed their details (separate from delivery). */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
              {[
                { label: t("reply_confirmed"), val: reply.confirmed, color: "#4cc97a" },
                { label: t("reply_pending"),   val: reply.pending,   color: C.gold },
                { label: t("reply_notSent"),   val: reply.notSent,   color: C.dim },
              ].map(s => (
                <div key={s.label} className="card" style={{ textAlign: "center", padding: "12px 6px" }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}><Num>{s.val.toLocaleString("en")}</Num></div>
                  <div style={{ fontSize: 10.5, color: C.dim, marginTop: 2 }}>{s.label}</div>
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
                <div style={{ display: "flex", color: C.gold }}><Icon name="users" size={26} /></div>
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
            {deliveredGuests.length > 0 && (
              <SearchBar
                value={query}
                onChange={setQuery}
                lang={lang}
                placeholder={t("search_guests_placeholder")}
                resultCount={filtered.length}
                totalCount={deliveredGuests.length}
              />
            )}
            {deliveredGuests.length === 0 && (
              <div className="card" style={{ marginBottom: 10, textAlign: "center", color: C.dim, fontSize: 12, padding: "16px 12px" }}>
                {lang === "he" ? "אין מסירות עדיין" : "لا توجد تسليمات بعد"}
              </div>
            )}
            {deliveredGuests.length > 0 && query.trim() && filtered.length === 0 && (
              <div className="card" style={{ textAlign: "center", padding: 24, color: C.dim }}>
                {t("search_no_results")}
              </div>
            )}
            {filtered.map(g => {
              const isImg = isProofImage(g.proofImg);
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
                      : <span style={{ display: "flex", color: C.dim }}>{g.proofImg || <Icon name="camera" size={24} />}</span>}
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
