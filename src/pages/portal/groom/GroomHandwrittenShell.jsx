// Handwritten groom shell — the existing portal tabs, now under /portal/groom/handwritten/*.
// Extracted from GroomPortalView so it can live alongside the new digital portal.
import { NavLink, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { LangSwitcher } from "../../../components/LangSwitcher.jsx";
import { LogoutConfirm } from "../../../components/LogoutConfirm.jsx";
import { Toast } from "../../../components/Toast.jsx";
import { PhotoViewer } from "../../../components/PhotoViewer.jsx";
import { EditGuestModal } from "../../../components/EditGuestModal.jsx";
import { TermsNotice } from "../../../components/TermsNotice.jsx";
import { usePortal } from "../../../context/PortalContext.jsx";
import { GroomDashboard } from "./GroomDashboard.jsx";
import { GroomGuests } from "./GroomGuests.jsx";
import { GroomAddGuest } from "./GroomAddGuest.jsx";
import { GroomProofs } from "./GroomProofs.jsx";
import { GroomLiveMap } from "./GroomLiveMap.jsx";
import { GroomGuestsMap } from "./GroomGuestsMap.jsx";
import { C } from "../../../styles/theme.js";
import { STORAGE_KEYS } from "../../../constants/storageKeys.js";

const navClass = ({ isActive }) => `nav-tab${isActive ? " active" : ""}`;
const navStyle = { fontSize: 12, padding: "6px 10px", textDecoration: "none", display: "inline-block" };

export function GroomHandwrittenShell() {
  const {
    onBack, t, lang, setLang,
    logoutAsking, setLogoutAsking, doLogout,
    toast, viewingPhoto, setViewingPhoto,
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
        backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(201,168,76,.1)", padding: "0 16px",
      }}>
        <div style={{ maxWidth: 900, margin: "0 auto", height: 54, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={onBack} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 16 }}>←</button>
            <span style={{ fontFamily: "'Amiri',serif", color: C.gold, fontWeight: 900, fontSize: 18 }}>
              {lang === "he" ? "דעוה" : "دعوة"}
            </span>
            <span style={{
              fontSize: 9, padding: "2px 6px", borderRadius: 8,
              background: "rgba(201,168,76,.1)", color: C.goldDim, fontWeight: 700,
            }}>
              {lang === "he" ? "כתב יד" : "يدوي"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
            <NavLink to="/portal/groom/handwritten/dashboard" className={navClass} style={navStyle}>{t("tab_dashboard")}</NavLink>
            <NavLink to="/portal/groom/handwritten/guests"    className={navClass} style={navStyle}>{t("tab_guests")}</NavLink>
            <NavLink to="/portal/groom/handwritten/add"       className={navClass} style={navStyle}>{t("tab_add")}</NavLink>
            <NavLink to="/portal/groom/handwritten/proofs"    className={navClass} style={navStyle}>{t("tab_proofs")}</NavLink>
            <NavLink to="/portal/groom/handwritten/map"       className={navClass} style={navStyle}>{t("tab_guest_map")}</NavLink>
            <button
              onClick={changeType}
              title={lang === "he" ? "החלף סוג הזמנה" : "تغيير نوع المكتوب"}
              style={{
                background: "rgba(75,159,212,.08)", border: "1px solid rgba(75,159,212,.22)",
                color: C.blue, padding: "4px 8px", borderRadius: 7,
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

      <TermsNotice t={t} />

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px 80px" }}>
        <Routes>
          <Route index            element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<GroomDashboard />} />
          <Route path="guests"    element={<GroomGuests />} />
          <Route path="add"       element={<GroomAddGuest />} />
          <Route path="proofs"    element={<GroomProofs />} />
          <Route path="map"       element={<GroomGuestsMap />} />
          <Route path="live"      element={<GroomLiveMap />} />
          <Route path="*"         element={<Navigate to="dashboard" replace />} />
        </Routes>
      </div>

      <PhotoViewer src={viewingPhoto} onClose={() => setViewingPhoto(null)} t={t} />
      <EditGuestModal />
    </div>
  );
}
