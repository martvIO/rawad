// Driver portal shell — gates on picking a groom, then shows the sticky header
// with the two driver tabs (delivery route / shared cities). Tabs are
// URL-driven via NavLink + nested Routes.
import { NavLink, Routes, Route, Navigate } from "react-router-dom";
import { LangSwitcher } from "../../../components/LangSwitcher.jsx";
import { LogoutConfirm } from "../../../components/LogoutConfirm.jsx";
import { Toast } from "../../../components/Toast.jsx";
import { usePortal } from "../../../context/PortalContext.jsx";
import { DriverPickGroom } from "./DriverPickGroom.jsx";
import { DriverDeliveryList } from "./DriverDeliveryList.jsx";
import { DriverMap } from "./DriverMap.jsx";
import { DriverShareLocation } from "./DriverShareLocation.jsx";
import { SharedCities } from "./SharedCities.jsx";
import { C } from "../../../styles/theme.js";

const tabStyle = ({ isActive }) => ({
  flex: 1, padding: "8px 0", borderRadius: 10, cursor: "pointer",
  background: isActive ? "rgba(75,159,212,.18)" : "rgba(255,255,255,.04)",
  border: `1px solid ${isActive ? "rgba(75,159,212,.4)" : "rgba(255,255,255,.08)"}`,
  color: isActive ? C.blue : C.dim,
  fontSize: 12, fontWeight: 800, fontFamily: "inherit", transition: "all .2s",
  textAlign: "center", textDecoration: "none", display: "block",
});

export function DriverPortal() {
  const {
    onBack, t, lang, setLang, toast,
    logoutAsking, setLogoutAsking, doLogout,
    myGuests,
    driverServingGroom, setDriverServingGroom,
  } = usePortal();

  // Pick-groom screen is required before showing the dashboard.
  if (!driverServingGroom) return <DriverPickGroom />;

  const done = myGuests.filter(g => g.status === "delivered");

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <Toast message={toast} variant="green" />

      {/* Header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50, background: "rgba(7,7,10,.95)",
        backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(75,159,212,.15)",
        padding: "12px 16px",
      }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <button onClick={onBack} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 16 }}>←</button>
            <div style={{ fontSize: 22 }}>🚗</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 900, color: C.blue, fontSize: 15 }}>{t("driver_title")}</div>
              <div style={{ fontSize: 10, color: "#5a5040", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {t("driver_serving_for")} <span style={{ color: C.gold, fontWeight: 700 }}>{driverServingGroom}</span>
              </div>
            </div>
            <LangSwitcher lang={lang} setLang={setLang} />
            <button onClick={() => setLogoutAsking(true)} title={t("logout")} style={{
              background: "rgba(212,80,58,.08)", border: "1px solid rgba(212,80,58,.3)",
              color: C.red, padding: "5px 10px", borderRadius: 8,
              fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>↩</button>
          </div>
          {/* Driver tabs */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <NavLink to="/portal/driver/pending"  style={tabStyle}>📋 {t("driver_subtitle")}</NavLink>
            <NavLink to="/portal/driver/map"      style={tabStyle}>🗺 {t("tab_map")}</NavLink>
            <NavLink to="/portal/driver/location" style={tabStyle}>📍 {lang === "he" ? "שיתוף מיקום" : "شارك موقعي"}</NavLink>
            <NavLink to="/portal/driver/shared"   style={tabStyle}>🏘 {t("tab_shared")}</NavLink>
            <button onClick={() => setDriverServingGroom(null)} title={t("driver_pick_groom_change")} style={{
              padding: "8px 12px", borderRadius: 10, cursor: "pointer",
              background: "rgba(201,168,76,.08)", border: "1px solid rgba(201,168,76,.25)",
              color: C.gold, fontSize: 14, fontWeight: 800, fontFamily: "inherit",
            }}>⇄</button>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "#4cc97a", textAlign: "left" }}>
            {done.length.toLocaleString("en")}/{myGuests.length.toLocaleString("en")} {t("driver_completed")}
          </div>
        </div>
      </div>

      {logoutAsking && <LogoutConfirm t={t} onConfirm={doLogout} onCancel={() => setLogoutAsking(false)}/>}

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "16px 16px 80px" }}>
        <Routes>
          <Route index              element={<Navigate to="pending" replace />} />
          <Route path="pending"     element={<DriverDeliveryList />} />
          <Route path="map"         element={<DriverMap />} />
          <Route path="location"    element={<DriverShareLocation />} />
          <Route path="shared"      element={<SharedCities />} />
          <Route path="*"           element={<Navigate to="pending" replace />} />
        </Routes>
      </div>
    </div>
  );
}
