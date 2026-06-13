// Admin → Confirmations tab. Submissions are classified by classifyAll() in
// usePortalState — green / red / unknown. Each card shows a side-by-side
// comparison (when a guest match exists), reason badges for red, and an
// Edit button that opens EditConfirmationModal.
import { usePortal } from "../../../context/PortalContext.jsx";
import { C } from "../../../styles/theme.js";
import { Num } from "../../../components/Num.jsx";
import { formatAddress, googleMapsLinkCoords } from "../../../utils/geo.js";
import { MATCH_STATUS } from "../../../constants/matchStatuses.js";
import { useListFilter } from "../../../utils/searchFilter.js";
import { SearchBar } from "../../../components/SearchBar.jsx";
import { FilterChips } from "../../../components/FilterChips.jsx";

// Search field specs + chip status mapping — MODULE LEVEL for stable identity so
// useListFilter's memos hold. statusOf reads a `_matchKey` we stamp onto each
// scoped confirmation (matchColor lives in render scope, so we can't call it here).
const CONF_FIELDS = ["submittedName", "submittedCity"];
const CONF_PHONE = ["submittedPhone"];
const confStatusOf = (c) => c?._matchKey ?? null;

export function AdminConfirmationsTab() {
  const {
    confirmations, matchColor, matchedGuestFor,
    confirmationReasons, useConfirmationData, setEditingConf,
    users, adminSelectedGroom, setAdminSelectedGroom, digitalGuestsForSelectedGroom,
    t, lang,
  } = usePortal();

  const groomList = users.filter(u => u.role === "groom");
  const selectedGroomUser = adminSelectedGroom
    ? users.find(u => u.username === adminSelectedGroom) : null;
  const selectedGroomUid = selectedGroomUser?.uid || selectedGroomUser?.id || null;
  const forGroom = (c) => !selectedGroomUid || c.groomUid === selectedGroomUid;

  // Every confirmation — matched, mismatch, AND unknown — is scoped to the groom
  // whose confirmation form was used (each record carries groomUid). So an
  // unknown reply submitted to one groom never shows under another groom.
  // Stamp each scoped record with its match key so the module-level confStatusOf
  // (and the chip filter) can read it without calling the render-scoped matchColor.
  const MATCH_KEY = {
    [MATCH_STATUS.GREEN]: "matched",
    [MATCH_STATUS.RED]: "mismatch",
    [MATCH_STATUS.UNKNOWN]: "unknown",
  };
  const groomConfirmations = confirmations
    .filter(forGroom)
    .map(c => ({ ...c, _matchKey: MATCH_KEY[matchColor(c)] ?? null }));

  // Search + match-status chips run on the groom-scoped array (composes with the
  // groom selector). `filtered` then feeds the three section splits below.
  const confStatuses = [
    { key: "matched",  label: t("chip_matched") },
    { key: "mismatch", label: t("chip_mismatch") },
    { key: "unknown",  label: t("chip_unknown") },
  ];
  const { query, setQuery, activeStatus, setActiveStatus, filtered, chips } =
    useListFilter(groomConfirmations, {
      fields: CONF_FIELDS, phoneFields: CONF_PHONE, lang,
      statusOf: confStatusOf, statuses: confStatuses, allLabel: t("filter_all"),
    });

  const matched  = filtered.filter(c => c._matchKey === "matched");
  const mismatch = filtered.filter(c => c._matchKey === "mismatch");
  const unknown  = filtered.filter(c => c._matchKey === "unknown");
  // Declined / "can't come" — digital guests of the selected groom marked absent.
  const declined = adminSelectedGroom
    ? (digitalGuestsForSelectedGroom || []).filter(g => g.status === "absent")
    : [];

  const renderConf = (conf) => {
    const guest = matchedGuestFor(conf);
    const color = matchColor(conf);
    const isUnknown = color === MATCH_STATUS.UNKNOWN;
    const borderColor = color === MATCH_STATUS.GREEN ? "rgba(76,201,122,.5)" : "rgba(212,122,75,.45)";
    const bgColor     = color === MATCH_STATUS.GREEN ? "rgba(76,201,122,.05)" : "rgba(212,122,75,.06)";
    const reasons = guest ? confirmationReasons(conf) : [];
    const fullAddress = formatAddress(conf.submittedCity, conf.submittedStreet, conf.submittedHouse);

    return (
      <div key={conf.id} style={{
        marginBottom: 12, padding: 14, borderRadius: 14,
        background: bgColor, border: `1.5px solid ${borderColor}`,
        boxShadow: color !== MATCH_STATUS.GREEN ? "0 0 0 1px rgba(212,122,75,.08) inset" : "none",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 11, color: C.dim }}>
            {isUnknown ? (
              <span style={{
                color: C.red, fontWeight: 800,
                padding: "2px 8px", borderRadius: 12,
                background: "rgba(212,122,75,.14)", border: "1px solid rgba(212,122,75,.3)",
              }}>{t("admin_conf_unknown_label")}</span>
            ) : (
              <>
                {t("admin_conf_for_groom")}{" "}
                <span style={{ color: C.gold, fontWeight: 700, direction: "ltr" }}>{conf.groomUsername}</span>
                {conf.source === "digital" && (
                  <span style={{
                    marginInlineStart: 8, fontSize: 10, fontWeight: 800, color: "#4cc97a",
                    padding: "2px 7px", borderRadius: 10,
                    background: "rgba(76,201,122,.12)", border: "1px solid rgba(76,201,122,.3)",
                  }}>
                    📱 {lang === "he" ? "דיגיטלי" : "رقمي"}
                  </span>
                )}
              </>
            )}
          </div>
          <div style={{ fontSize: 10, color: "#5a5040" }}>
            <Num dir="auto">{new Date(conf.confirmedAt).toLocaleString(lang === "he" ? "he-IL" : "ar", { numberingSystem: "latn" })}</Num>
          </div>
        </div>

        {isUnknown && (
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 8 }}>
            {t("admin_conf_for_groom")}{" "}
            <span style={{ color: C.gold, fontWeight: 700, direction: "ltr" }}>{conf.groomUsername}</span>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: guest ? "1fr 1fr" : "1fr", gap: 10 }}>
          {guest && (
            <div style={{ padding: 10, background: "rgba(255,255,255,.03)", borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: C.dim, fontWeight: 700, marginBottom: 4 }}>
                {t("admin_conf_from_groom")}
              </div>
              <div style={{ fontSize: 13, color: C.goldLight, fontWeight: 800 }}>{guest.name}</div>
              <div style={{ fontSize: 11, color: C.goldDim, direction: "ltr", textAlign: "right" }}>{guest.phone}</div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>
                📍 {guest.area || t("admin_conf_no_address")}
              </div>
            </div>
          )}
          <div style={{ padding: 10, background: "rgba(255,255,255,.03)", borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: C.dim, fontWeight: 700, marginBottom: 4 }}>
              {t("admin_conf_from_guest")}
            </div>
            <div style={{ fontSize: 13, color: C.goldLight, fontWeight: 800 }}>{conf.submittedName}</div>
            <div style={{ fontSize: 11, color: C.goldDim, direction: "ltr", textAlign: "right" }}>{conf.submittedPhone}</div>
            {conf.source !== "digital" && (
              <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>
                📍 {fullAddress || t("admin_conf_no_address")}
              </div>
            )}
            <div style={{ fontSize: 11, color: C.gold, fontWeight: 800, marginTop: 4 }}>
              👥 {lang === "he" ? "סה״כ" : "العدد"}: <Num>{(Number(conf.companions) || 0) + 1}</Num> {lang === "he" ? "אנשים" : "أشخاص"}
            </div>
            {typeof conf.lat === "number" && typeof conf.lng === "number" && (
              <a href={googleMapsLinkCoords(conf.lat, conf.lng)} target="_blank" rel="noreferrer"
                 style={{
                   display: "inline-flex", alignItems: "center", gap: 4, marginTop: 6,
                   fontSize: 11, fontWeight: 800, color: "#4cc97a", textDecoration: "none",
                 }}>
                📍 {lang === "he" ? "המיקום שהמוזמן סימן" : "الموقع الذي حدّده المعزوم"} ↗
              </a>
            )}
            {conf.deliveryNote && (
              <div style={{
                marginTop: 6, padding: "6px 10px", borderRadius: 8,
                background: "rgba(201,168,76,.08)", border: "1px solid rgba(201,168,76,.22)",
                fontSize: 11, color: C.goldLight, lineHeight: 1.6,
              }}>
                📝 <span style={{ fontWeight: 800, color: C.goldDim }}>{lang === "he" ? "הערה לשליח" : "ملاحظة للمرسل"}:</span> {conf.deliveryNote}
              </div>
            )}
          </div>
        </div>

        {reasons.length > 0 && (
          <div style={{
            marginTop: 10, padding: "8px 12px", borderRadius: 8,
            background: "rgba(212,122,75,.07)", border: "1px solid rgba(212,122,75,.22)",
            fontSize: 11, color: C.red, lineHeight: 1.7, display: "flex",
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

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button onClick={() => setEditingConf(conf)} style={{
            flex: 1, padding: 9, borderRadius: 8,
            background: "rgba(201,168,76,.10)", border: "1px solid rgba(201,168,76,.30)",
            color: C.gold, fontSize: 12, fontWeight: 800,
            cursor: "pointer", fontFamily: "inherit",
          }}>
            {t("admin_conf_edit")}
          </button>
          {guest && (
            <button onClick={() => useConfirmationData(conf)} style={{
              flex: 1, padding: 9, borderRadius: 8,
              background: "rgba(201,168,76,.15)", border: "1px solid rgba(201,168,76,.35)",
              color: C.gold, fontSize: 12, fontWeight: 800,
              cursor: "pointer", fontFamily: "inherit",
            }}>
              💾 {t("admin_conf_use_guest_data")}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ fontSize: 19, fontWeight: 900, color: C.gold, fontFamily: "'Amiri','Frank Ruhl Libre',serif", marginBottom: 4 }}>
        ✓ {t("admin_conf_title")}
      </div>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 16 }}>
        {t("admin_conf_subtitle")}
      </div>

      {/* Groom selector — click a groom to see only his replies (+ all unknowns + his declined) */}
      <div style={{ fontSize: 12, color: C.goldDim, fontWeight: 700, marginBottom: 8 }}>
        {lang === "he" ? "בחר חתן" : "اختر العريس"}
      </div>
      {groomList.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 24, color: C.dim }}>
          {lang === "he" ? "אין חתנים" : "لا يوجد عرسان"}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 18 }}>
          {groomList.map(u => {
            const uid = u.uid || u.id;
            const cnt = confirmations.filter(c => c.groomUid === uid).length;
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
                  {lang === "he" ? "אישורים" : "تأكيدات"} <Num>{cnt.toLocaleString("en")}</Num>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!adminSelectedGroom ? (
        <div className="card" style={{ textAlign: "center", padding: 32, color: C.dim }}>
          {lang === "he" ? "בחר חתן כדי להציג את אישוריו" : "اختر عريساً لعرض تأكيداته"}
        </div>
      ) : (groomConfirmations.length + declined.length === 0) ? (
        <div className="card" style={{ textAlign: "center", padding: 32, color: C.dim }}>
          {t("admin_conf_empty")}
        </div>
      ) : (
        <>
          {/* Search + match-status chips run on this groom's confirmations only. */}
          {groomConfirmations.length > 0 && (
            <>
              <SearchBar
                value={query} onChange={setQuery} lang={lang}
                placeholder={t("search_confirmations_placeholder")}
                resultCount={filtered.length} totalCount={groomConfirmations.length}
              />
              {chips.length > 0 && (
                <FilterChips options={chips} value={activeStatus} onChange={setActiveStatus} lang={lang} />
              )}
            </>
          )}
          {query.trim() && filtered.length === 0 && (
            <div className="card" style={{ textAlign: "center", padding: 24, color: C.dim }}>
              {t("search_no_results")}
            </div>
          )}
          {matched.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, color: "#4cc97a", fontWeight: 700, marginBottom: 10 }}>
                {t("admin_conf_matched")} (<Num>{matched.length.toLocaleString("en")}</Num>)
              </div>
              {matched.map(renderConf)}
            </div>
          )}
          {mismatch.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, color: C.red, fontWeight: 700, marginBottom: 10 }}>
                {t("admin_conf_mismatch_header")} (<Num>{mismatch.length.toLocaleString("en")}</Num>)
              </div>
              {mismatch.map(renderConf)}
            </div>
          )}
          {unknown.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, color: C.red, fontWeight: 700, marginBottom: 10 }}>
                {t("admin_conf_unknown")} (<Num>{unknown.length.toLocaleString("en")}</Num>)
              </div>
              {unknown.map(renderConf)}
            </div>
          )}
          {declined.length > 0 && (
            <div>
              <div style={{ fontSize: 13, color: C.red, fontWeight: 700, marginBottom: 10 }}>
                {lang === "he" ? "לא יגיעו (התנצלו)" : "لن يحضروا (اعتذروا)"} (<Num>{declined.length.toLocaleString("en")}</Num>)
              </div>
              {declined.map(g => (
                <div key={g.id} style={{
                  marginBottom: 8, padding: 14, borderRadius: 14,
                  background: "rgba(212,122,75,.05)", border: "1px solid rgba(212,122,75,.3)",
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: C.goldLight, fontWeight: 800 }}>{g.name}</div>
                    <div style={{ fontSize: 11, color: C.goldDim, direction: "ltr", textAlign: "right" }}>{g.phone}</div>
                  </div>
                  <span style={{
                    fontSize: 10, padding: "3px 10px", borderRadius: 20, fontWeight: 800,
                    background: "rgba(212,122,75,.15)", color: C.red,
                  }}>✗ {lang === "he" ? "לא יגיע" : "لن يحضر"}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
