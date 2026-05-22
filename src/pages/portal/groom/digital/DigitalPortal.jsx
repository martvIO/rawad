// Digital invitation portal shell — header with 4 tabs + nested routes.
import { NavLink, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { LangSwitcher } from "../../../../components/LangSwitcher.jsx";
import { LogoutConfirm } from "../../../../components/LogoutConfirm.jsx";
import { Toast } from "../../../../components/Toast.jsx";
import { usePortal } from "../../../../context/PortalContext.jsx";
import { DigitalDashboard } from "./DigitalDashboard.jsx";
import { DigitalGuests } from "./DigitalGuests.jsx";
import { DigitalAddGuest } from "./DigitalAddGuest.jsx";
import { DigitalPhotographer } from "./DigitalPhotographer.jsx";
import { DigitalDesignRequest } from "./DigitalDesignRequest.jsx";
import { C } from "../../../../styles/theme.js";
import { STORAGE_KEYS } from "../../../../constants/storageKeys.js";

const navClass = ({ isActive }) => `nav-tab${isActive ? " active" : ""}`;
const navStyle = { fontSize: 12, padding: "6px 10px", textDecoration: "none", display: "inline-block" };

export function DigitalPortal() {
  const {
    onBack, t, lang, setLang,
    logoutAsking, setLogoutAsking, doLogout,
    toast,
  } = usePortal();
  const navigate = useNavigate();

  const changeType = () => {
    localStorage.removeItem(STORAGE_KEYS.GROOM_TYPE);
    navigate("/portal/groom/type-select", { replace: true });
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <Toast message={toast} variant="gold" />

      <div style={{
        position: "sticky", top: 0, zIndex: 50, background: "rgba(7,7,10,.95)",
        backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(75,159,212,.15)", padding: "0 16px",
      }}>
        <div style={{ maxWidth: 900, margin: "0 auto", height: 54, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={onBack} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 16 }}>←</button>
            <span style={{ fontFamily: "'Amiri',serif", color: C.blue, fontWeight: 900, fontSize: 18 }}>
              {lang === "he" ? "דעוה" : "دعوة"}
            </span>
            <span style={{
              fontSize: 9, padding: "2px 6px", borderRadius: 8,
              background: "rgba(75,159,212,.12)", color: C.blue, fontWeight: 700,
            }}>
              {lang === "he" ? "דיגיטלי" : "رقمي"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
            <NavLink to="/portal/groom/digital/dashboard"    className={navClass} style={navStyle}>
              {lang === "he" ? "ראשי" : "الرئيسية"}
            </NavLink>
            <NavLink to="/portal/groom/digital/guests"       className={navClass} style={navStyle}>
              {lang === "he" ? "מוזמנים" : "المدعوون"}
            </NavLink>
            <NavLink to="/portal/groom/digital/add"          className={navClass} style={navStyle}>
              {lang === "he" ? "➕ הוסף" : "➕ إضافة"}
            </NavLink>
            <NavLink to="/portal/groom/digital/photographer" className={navClass} style={navStyle}>
              {lang === "he" ? "📸 צלם" : "📸 المصور"}
            </NavLink>
            <NavLink to="/portal/groom/digital/design"       className={navClass} style={navStyle}>
              {lang === "he" ? "🎨 עיצוב" : "🎨 التصميم"}
            </NavLink>
            <button
              onClick={changeType}
              title={lang === "he" ? "החלף סוג הזמנה" : "تغيير نوع المكتوب"}
              style={{
                background: "rgba(201,168,76,.08)", border: "1px solid rgba(201,168,76,.22)",
                color: C.gold, padding: "4px 8px", borderRadius: 7,
                fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}
            >⇄</button>
            <LangSwitcher lang={lang} setLang={setLang} />
            <button onClick={() => setLogoutAsking(true)} title={t("logout")} style={{
              background: "rgba(212,80,58,.08)", border: "1px solid rgba(212,80,58,.3)",
              color: C.red, padding: "5px 10px", borderRadius: 8,
              fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginInlineStart: 4,
            }}>↩ {t("logout")}</button>
          </div>
        </div>
      </div>

      {logoutAsking && <LogoutConfirm t={t} onConfirm={doLogout} onCancel={() => setLogoutAsking(false)}/>}

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px 80px" }}>
        <Routes>
          <Route index               element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard"    element={<DigitalDashboard />} />
          <Route path="guests"       element={<DigitalGuests />} />
          <Route path="add"          element={<DigitalAddGuest />} />
          <Route path="photographer" element={<DigitalPhotographer />} />
          <Route path="design"       element={<DigitalDesignRequest />} />
          <Route path="*"            element={<Navigate to="dashboard" replace />} />
        </Routes>
      </div>
    </div>
  );
}
