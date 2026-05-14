// Groom portal shell — sticky header with the five groom tabs, plus the
// proof-photo viewer and edit-guest modal that overlay every groom tab.
import { LangSwitcher } from "../../../components/LangSwitcher.jsx";
import { LogoutConfirm } from "../../../components/LogoutConfirm.jsx";
import { Toast } from "../../../components/Toast.jsx";
import { PhotoViewer } from "../../../components/PhotoViewer.jsx";
import { EditGuestModal } from "../../../components/EditGuestModal.jsx";
import { usePortal } from "../../../context/PortalContext.jsx";
import { GroomDashboard } from "./GroomDashboard.jsx";
import { GroomGuests } from "./GroomGuests.jsx";
import { GroomAddGuest } from "./GroomAddGuest.jsx";
import { GroomProofs } from "./GroomProofs.jsx";
import { GroomLiveMap } from "./GroomLiveMap.jsx";

export function GroomPortalView() {
  const {
    onBack, t, lang, setLang, tab, setTab,
    logoutAsking, setLogoutAsking, doLogout,
    toast, viewingPhoto, setViewingPhoto,
  } = usePortal();

  return (
    <div style={{ minHeight: "100vh", background: "#07070a" }}>
      <Toast message={toast} variant="gold" />

      <div style={{
        position: "sticky", top: 0, zIndex: 50, background: "rgba(7,7,10,.95)",
        backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(201,168,76,.1)", padding: "0 16px",
      }}>
        <div style={{ maxWidth: 900, margin: "0 auto", height: 54, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={onBack} style={{ background: "none", border: "none", color: "#7a6a4a", cursor: "pointer", fontSize: 16 }}>←</button>
            <span style={{ fontFamily: "'Amiri',serif", color: "#c9a84c", fontWeight: 900, fontSize: 18 }}>{lang === "he" ? "דעוה" : "دعوة"}</span>
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
            {[
              ["dashboard", t("tab_dashboard")],
              ["guests",    t("tab_guests")],
              ["add",       t("tab_add")],
              ["proofs",    t("tab_proofs")],
              ["live",      t("tab_live")],
            ].map(([id,lbl]) => (
              <button key={id} className={`nav-tab${tab===id?" active":""}`} onClick={() => setTab(id)}
                      style={{ fontSize: 12, padding: "6px 10px" }}>{lbl}</button>
            ))}
            <LangSwitcher lang={lang} setLang={setLang} />
            <button onClick={() => setLogoutAsking(true)} title={t("logout")} style={{
              background: "rgba(212,80,58,.08)", border: "1px solid rgba(212,80,58,.3)",
              color: "#d47a4b", padding: "5px 10px", borderRadius: 8,
              fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginInlineStart: 4,
            }}>↩ {t("logout")}</button>
          </div>
        </div>
      </div>

      {logoutAsking && <LogoutConfirm t={t} onConfirm={doLogout} onCancel={() => setLogoutAsking(false)}/>}

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px 80px" }}>
        {tab === "dashboard" && <GroomDashboard />}
        {tab === "guests" && <GroomGuests />}
        {tab === "add" && <GroomAddGuest />}
        {tab === "proofs" && <GroomProofs />}
        {tab === "live" && <GroomLiveMap />}
      </div>

      {/* Overlays — render nothing unless their state is set */}
      <PhotoViewer src={viewingPhoto} onClose={() => setViewingPhoto(null)} t={t} />
      <EditGuestModal />
    </div>
  );
}
