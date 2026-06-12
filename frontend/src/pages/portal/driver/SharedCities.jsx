// Driver → Shared-cities tab
//
// المنطق الجديد:
//   1. اختيار متعدد حرّ لأي عرسان من groomProfiles.
//   2. للمرسل صلاحية قراءة معازيم العرسان المُسنَدين إليه فقط (RTDB rules).
//      — sharedGuests يحتوي بالفعل على هذه المعازيم عبر الاشتراكات المتوازية.
//   3. عند الاختيار: نُقسِّم المعازيم بحسب كل عريس مختار ثم نُجمِّع بحسب البلدة.
//   4. نُظهر "البلدات المشتركة" = البلدات التي تظهر عند أكثر من عريس مختار.
//   5. المرسل يختار بلدة → يرى كل معازيمها من العرسان المختارين.
//   6. عند كل معزوم: خانة "تسليم المكتوب" كاملة (صورة + ملاحظات + تأكيد).
import { useMemo, useState } from "react";
import { telLink } from "../../../utils/phone.js";
import { wazeLink, extractCity as extractCityRaw } from "../../../utils/geo.js";
import { usePortal } from "../../../context/PortalContext.jsx";
import { GroomMultiSelect } from "../../../components/GroomMultiSelect.jsx";
import { Num } from "../../../components/Num.jsx";
import { SearchBar } from "../../../components/SearchBar.jsx";
import { FilterChips } from "../../../components/FilterChips.jsx";
import { useListFilter } from "../../../utils/searchFilter.js";
import { C } from "../../../styles/theme.js";

// Search field specs + delivery-status chip mapping for the in-route guest list.
// Module-level so useListFilter's memoization holds (stable identity across renders).
const SHARED_FIELDS = ["name", "area"];
const SHARED_PHONE = ["phone"];
const sharedStatusOf = (g) => g.status;

export function SharedCities() {
  const {
    t, lang,
    groomProfiles,
    driverAssignedGroomUids,
    sharedGuests,
    sharedStep, setSharedStep,
    sharedSelectedGrooms, setSharedSelectedGrooms,
    sharedSelectedCity, setSharedSelectedCity,
    // delivery
    activeId, setActiveId,
    photoTaken, setPhotoTaken,
    photoData, setPhotoData,
    deliveryNote, setDeliveryNote,
    markDelivered,
  } = usePortal();

  const [viewingGroom, setViewingGroom] = useState(null); // uid العريس المفتوح في المرحلة الثالثة

  const extractCity = (area) => extractCityRaw(area, lang);

  // ── حساب خريطة البلدات ────────────────────────────────────────────────
  // لكل بلدة: { city, guests[], groomsInCity: Set<uid>, isShared: bool }
  const cityData = useMemo(() => {
    if (sharedSelectedGrooms.length === 0) return [];
    const pool = sharedGuests.filter(g =>
      g.status !== "delivered" && sharedSelectedGrooms.includes(g.groomUid),
    );
    const map = new Map(); // city → { guests[], groomsInCity }
    for (const g of pool) {
      const city = extractCity(g.area) || (lang === "he" ? "ללא עיר" : "بدون بلدة");
      if (!map.has(city)) map.set(city, { city, guests: [], groomsInCity: new Set() });
      map.get(city).guests.push(g);
      map.get(city).groomsInCity.add(g.groomUid);
    }
    return [...map.values()]
      .map(d => ({ ...d, groomCount: d.groomsInCity.size, isShared: d.groomsInCity.size > 1 }))
      .sort((a, b) => b.isShared - a.isShared || b.guests.length - a.guests.length);
  }, [sharedGuests, sharedSelectedGrooms, lang]);

  // ── معلومة: العرسان المُسنَدون فعلاً للمرسل (قد يختلف عن المختارين) ─────
  const assignedAndSelected = sharedSelectedGrooms.filter(uid =>
    driverAssignedGroomUids.includes(uid),
  );
  const hasUnassigned = assignedAndSelected.length < sharedSelectedGrooms.length;

  // ── المعازيم في البلدة المختارة ──────────────────────────────────────────
  const cityGuests = useMemo(() => {
    if (!sharedSelectedCity) return [];
    return sharedGuests
      .filter(g =>
        g.status !== "delivered" &&
        sharedSelectedGrooms.includes(g.groomUid) &&
        (extractCity(g.area) || (lang === "he" ? "ללא עיר" : "بدون بلدة")) === sharedSelectedCity,
      )
      .sort((a, b) => (a.area || "").localeCompare(b.area || ""));
  }, [sharedGuests, sharedSelectedGrooms, sharedSelectedCity, lang]);

  // ── بحث + فلترة بحسب حالة التسليم على معازيم البلدة ──────────────────────
  const sharedStatuses = [
    { key: "pending", label: t("chip_pending") },
    { key: "enroute", label: t("chip_enroute") },
    { key: "delivered", label: t("chip_delivered") },
  ];
  const { query, setQuery, activeStatus, setActiveStatus, filtered, chips } =
    useListFilter(cityGuests, {
      fields: SHARED_FIELDS,
      phoneFields: SHARED_PHONE,
      lang,
      statusOf: sharedStatusOf,
      statuses: sharedStatuses,
      allLabel: t("filter_all"),
    });

  // ── label العريس من groomProfiles ────────────────────────────────────────
  const groomLabel = (uid) => {
    const g = groomProfiles.find(x => x.uid === uid);
    return g ? `@${g.username}` : uid;
  };

  // ── فتح/إغلاق خانة التسليم لمعزوم واحد ──────────────────────────────────
  const toggleDelivery = (guestId) => {
    if (activeId === guestId) {
      setActiveId(null);
      setPhotoTaken(false);
      setPhotoData(null);
      setDeliveryNote("");
    } else {
      setActiveId(guestId);
      setPhotoTaken(false);
      setPhotoData(null);
      setDeliveryNote("");
    }
  };

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>

      {/* ── عنوان ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: C.gold, fontFamily: "'Amiri',serif", marginBottom: 4 }}>
          🏘 {t("shared_title")}
        </div>
        <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.7 }}>
          {lang === "he"
            ? "בחר חתנים → ראה ערים משותפות → בחר עיר → ראה את כל האורחים"
            : "اختر عرسان ← شاهد البلدات المشتركة ← اختر بلدة ← شاهد كل المدعوين"}
        </div>
      </div>

      {/* ══════════════════════ المرحلة 1: اختيار العرسان ══════════════════ */}
      {sharedStep === "pickGrooms" && (
        <>
          <div style={{
            background: "rgba(255,255,255,.02)", borderRadius: 14,
            border: "1px solid rgba(255,255,255,.07)", padding: "16px 14px", marginBottom: 14,
          }}>
            <GroomMultiSelect
              grooms={groomProfiles}
              selected={sharedSelectedGrooms}
              onChange={setSharedSelectedGrooms}
              label={t("shared_pick_grooms_label")}
              emptyText={t("shared_grooms_empty")}
              t={t}
              lang={lang}
            />
          </div>

          {/* تنبيه: إذا اختار عرسان غير مُسنَدين إليه */}
          {hasUnassigned && sharedSelectedGrooms.length > 0 && (
            <div style={{
              marginBottom: 10, padding: "8px 12px", borderRadius: 10,
              background: "rgba(201,168,76,.07)", border: "1px solid rgba(201,168,76,.2)",
              fontSize: 11, color: C.goldDim, lineHeight: 1.6,
            }}>
              ⓘ {lang === "he"
                ? "חתנים שלא שויכו אליך לא יופיעו בחישוב הערים."
                : "العرسان غير المُسنَدين إليك لن تظهر معازيمهم في الحساب."}
            </div>
          )}

          <button
            disabled={sharedSelectedGrooms.length === 0}
            onClick={() => setSharedStep("pickCity")}
            style={{
              width: "100%", padding: 12, borderRadius: 12,
              background: sharedSelectedGrooms.length > 0
                ? "linear-gradient(135deg,#c9a84c,#f0c84c)"
                : "rgba(255,255,255,.05)",
              color: sharedSelectedGrooms.length > 0 ? "#000" : "#5a5040",
              border: "none", fontWeight: 900, fontSize: 14, fontFamily: "inherit",
              cursor: sharedSelectedGrooms.length > 0 ? "pointer" : "not-allowed",
            }}
          >
            {sharedSelectedGrooms.length === 0
              ? (lang === "he" ? "בחר חתן אחד לפחות" : "اختر عريساً واحداً على الأقل")
              : t("shared_view_btn")}
          </button>
        </>
      )}

      {/* ══════════════════════ المرحلة 2: قائمة البلدات ══════════════════ */}
      {sharedStep === "pickCity" && (
        <>
          {/* شريط العودة + ملخّص المختارين */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <button onClick={() => setSharedStep("pickGrooms")} style={{
              background: "none", border: "none", color: C.gold, cursor: "pointer",
              fontSize: 12, fontWeight: 700, fontFamily: "inherit",
            }}>← {t("shared_back_to_grooms")}</button>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, flex: 1 }}>
              {sharedSelectedGrooms.map(uid => (
                <span key={uid} style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 20,
                  background: "rgba(201,168,76,.12)", color: C.gold, fontWeight: 700,
                  direction: "ltr",
                }}>{groomLabel(uid)}</span>
              ))}
            </div>
          </div>

          {cityData.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: 32, color: C.dim }}>
              {t("shared_no_pending")}
            </div>
          ) : (
            cityData.map(({ city, guests: cGuests, groomCount, isShared }) => (
              <div
                key={city}
                onClick={() => { setSharedSelectedCity(city); setSharedStep("viewRoute"); }}
                style={{
                  cursor: "pointer", marginBottom: 10, padding: "14px 16px",
                  borderRadius: 14,
                  background: isShared ? "rgba(75,159,212,.07)" : "rgba(255,255,255,.03)",
                  border: `1px solid ${isShared ? "rgba(75,159,212,.3)" : "rgba(255,255,255,.08)"}`,
                  display: "flex", alignItems: "center", gap: 12,
                }}
              >
                <span style={{ fontSize: 22 }}>🏘</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, color: C.goldLight, fontSize: 14 }}>{city}</div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <span><Num>{cGuests.length.toLocaleString("en")}</Num> {t("shared_city_count")}</span>
                    <span>·</span>
                    <span style={{ color: isShared ? C.blue : C.dim }}>
                      <Num>{groomCount.toLocaleString("en")}</Num> {groomCount === 1
                        ? (lang === "he" ? "חתן" : "عريس")
                        : (lang === "he" ? "חתנים" : "عرسان")}
                    </span>
                    {isShared && (
                      <span style={{
                        padding: "1px 8px", borderRadius: 20, fontSize: 10,
                        background: "rgba(75,159,212,.15)", color: C.blue, fontWeight: 700,
                      }}>
                        {lang === "he" ? "✓ משותפת" : "✓ مشتركة"}
                      </span>
                    )}
                  </div>
                </div>
                <span style={{ color: C.gold, fontSize: 18 }}>←</span>
              </div>
            ))
          )}
        </>
      )}

      {/* ══════════════════════ المرحلة 3: مدعووا البلدة ══════════════════ */}
      {sharedStep === "viewRoute" && sharedSelectedCity && (
        <>
          {/* شريط العودة */}
          <button onClick={() => { setSharedStep("pickCity"); setSharedSelectedCity(null); setActiveId(null); }} style={{
            background: "none", border: "none", color: C.gold, cursor: "pointer",
            fontSize: 12, fontWeight: 700, marginBottom: 14, fontFamily: "inherit",
          }}>{t("shared_back_to_cities")}</button>

          {/* عنوان البلدة */}
          <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 12,
            background: "rgba(201,168,76,.08)", border: "1px solid rgba(201,168,76,.22)" }}>
            <div style={{ fontSize: 12, color: C.dim }}>{t("shared_route_in")}</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: C.gold, fontFamily: "'Amiri',serif" }}>
              🏘 {sharedSelectedCity}
            </div>
          </div>

          {/* بحث + فلترة بحسب الحالة */}
          <SearchBar
            value={query}
            onChange={setQuery}
            lang={lang}
            placeholder={t("search_guests_placeholder")}
            resultCount={filtered.length}
            totalCount={cityGuests.length}
          />
          {chips.length > 0 && (
            <FilterChips options={chips} value={activeStatus} onChange={setActiveStatus} lang={lang} />
          )}

          {/* لا نتائج */}
          {filtered.length === 0 && (query.trim() || activeStatus !== "all") && (
            <div className="card" style={{ textAlign: "center", padding: 24, color: C.dim }}>
              {t("search_no_results")}
            </div>
          )}

          {/* بطاقات المدعوّين مُجمَّعة بالعريس */}
          {(() => {
            const byGroom = {};
            for (const g of filtered) {
              if (!byGroom[g.groomUid]) byGroom[g.groomUid] = [];
              byGroom[g.groomUid].push(g);
            }

            return Object.entries(byGroom).map(([groomUid, groomGuests]) => (
              <div key={groomUid} style={{ marginBottom: 18 }}>
                {/* رأس العريس */}
                <div style={{
                  padding: "6px 12px", borderRadius: 10, marginBottom: 8,
                  background: "rgba(201,168,76,.10)", border: "1px solid rgba(201,168,76,.22)",
                  fontSize: 12, fontWeight: 800, color: C.gold, direction: "ltr",
                }}>
                  {groomLabel(groomUid)}
                  <span style={{ color: C.dim, fontWeight: 400, marginInlineStart: 8 }}>
                    ({groomGuests.length.toLocaleString("en")})
                  </span>
                </div>

                {/* بطاقات المدعوّين */}
                {groomGuests.map((g, idx) => (
                  <div key={g.id} style={{
                    background: idx === 0 ? "rgba(75,159,212,.07)" : "rgba(255,255,255,.03)",
                    border: `1.5px solid ${idx === 0 ? "rgba(75,159,212,.28)" : "rgba(255,255,255,.08)"}`,
                    borderRadius: 14, padding: "12px 14px", marginBottom: 8,
                  }}>
                    {/* رأس البطاقة: اسم + شارة "التالي" */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flex: 1 }}>
                        <div style={{
                          width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                          background: idx === 0 ? "rgba(75,159,212,.2)" : "rgba(255,255,255,.06)",
                          color: idx === 0 ? C.blue : C.dim,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontWeight: 900, fontSize: 12,
                        }}>{idx + 1}</div>
                        <div>
                          <div style={{ fontWeight: 800, color: C.goldLight, fontSize: 14 }}>{g.name}</div>
                          {g.area && <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>📍 {g.area}</div>}
                        </div>
                      </div>
                      {idx === 0 && (
                        <span style={{
                          fontSize: 10, padding: "3px 8px", borderRadius: 20,
                          background: "rgba(75,159,212,.15)", color: C.blue, fontWeight: 700,
                        }}>{t("driver_next")}</span>
                      )}
                    </div>

                    {/* هاتف + وايز */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <a href={telLink(g.phone)} style={{
                        flex: 1, padding: "8px 0", borderRadius: 10, textAlign: "center",
                        background: "rgba(76,201,122,.12)", border: "1px solid rgba(76,201,122,.35)",
                        color: "#4cc97a", fontSize: 12, fontWeight: 700, display: "flex",
                        alignItems: "center", justifyContent: "center", gap: 6,
                      }}>📞 <span style={{ direction: "ltr" }}>{g.phone}</span></a>
                      {g.area && (
                        <a href={wazeLink(g.area)} target="_blank" rel="noreferrer" style={{
                          flex: 1, padding: "8px 0", borderRadius: 10, textAlign: "center",
                          background: "rgba(0,160,220,.12)", border: "1px solid rgba(0,160,220,.35)",
                          color: "#00b4dc", fontSize: 12, fontWeight: 700, display: "flex",
                          alignItems: "center", justifyContent: "center", gap: 6,
                        }}>{t("driver_open_waze")}</a>
                      )}
                    </div>

                    {/* ── زر تسليم المكتوب ── */}
                    <button
                      onClick={() => toggleDelivery(g.id)}
                      style={{
                        width: "100%", padding: "10px 0", borderRadius: 10, cursor: "pointer",
                        background: activeId === g.id ? "rgba(201,168,76,.15)" : "rgba(201,168,76,.08)",
                        border: "1px solid rgba(201,168,76,.35)",
                        color: C.gold, fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                      }}
                    >
                      {activeId === g.id ? t("driver_cancel") : t("driver_deliver_btn")}
                    </button>

                    {/* ── خانة التسليم الكاملة ── */}
                    {activeId === g.id && (
                      <div style={{
                        marginTop: 12, padding: 14,
                        background: "rgba(76,201,122,.04)", border: "1px solid rgba(76,201,122,.18)",
                        borderRadius: 12, animation: "slideUp .3s ease",
                      }}>
                        <div style={{ fontSize: 12, color: "#4cc97a", fontWeight: 700, marginBottom: 12 }}>
                          {t("driver_complete_form")}
                        </div>

                        {/* صورة / تصوير */}
                        <div style={{ marginBottom: 6, fontSize: 12, color: C.dim }}>
                          {t("driver_photo_label")}{" "}
                          <span style={{ color: "#5a5040", fontWeight: 400 }}>{t("driver_photo_optional")}</span>
                        </div>
                        <label style={{
                          display: "block",
                          border: `2px dashed ${photoTaken ? "rgba(76,201,122,.5)" : "rgba(76,201,122,.25)"}`,
                          borderRadius: 10, padding: "16px 0", textAlign: "center",
                          marginBottom: 12, cursor: "pointer",
                          background: photoTaken ? "rgba(76,201,122,.08)" : "rgba(76,201,122,.02)",
                          transition: "all .2s",
                        }}>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
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
                            }}
                          />
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

                        {/* ملاحظات */}
                        <div style={{ marginBottom: 6, fontSize: 12, color: C.dim }}>{t("driver_note_label")}</div>
                        <input
                          className="input-field"
                          type="text"
                          placeholder={t("driver_note_placeholder")}
                          value={deliveryNote}
                          onChange={e => setDeliveryNote(e.target.value)}
                          style={{ marginBottom: 12, fontSize: 13 }}
                        />

                        {/* تأكيد التسليم */}
                        <button
                          onClick={() => markDelivered(g.id)}
                          style={{
                            width: "100%", padding: 12, borderRadius: 10, border: "none",
                            background: "linear-gradient(135deg,#4cc97a,#2da85a)",
                            color: "#000", fontWeight: 900, fontSize: 14, fontFamily: "inherit",
                            cursor: "pointer", transition: "all .2s",
                          }}
                        >{t("driver_confirm")}</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ));
          })()}
        </>
      )}
    </div>
  );
}
