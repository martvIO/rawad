// Admin portal shell — sticky header, warning banner, sub-tab navigation,
// and the four admin tabs (users / send / confirmations / settings).
// Tabs are URL-driven: NavLink updates the path, nested Routes pick the
// component to render. NavLink's `isActive` callback drives the active
// styling so we don't need a parallel `adminTab` state variable.
import { lazy, Suspense } from "react";
import { NavLink, Routes, Route, Navigate } from "react-router-dom";
import { LangSwitcher } from "../../../components/LangSwitcher.jsx";
import { LogoutConfirm } from "../../../components/LogoutConfirm.jsx";
import { Toast } from "../../../components/Toast.jsx";
import { EditConfirmationModal } from "../../../components/EditConfirmationModal.jsx";
import { usePortal } from "../../../context/PortalContext.jsx";
import { AdminUserManager } from "./AdminUserManager.jsx";
import { AdminPaymentLinks } from "./AdminPaymentLinks.jsx";
import { AdminSendTab } from "./AdminSendTab.jsx";
import { AdminSettingsTab } from "./AdminSettingsTab.jsx";
import { AdminWhatsAppSetupTab } from "./AdminWhatsAppSetupTab.jsx";
import { AdminMessageTemplatesTab } from "./AdminMessageTemplatesTab.jsx";
import { AdminConfirmationsTab } from "./AdminConfirmationsTab.jsx";
import { AdminDesigns } from "./AdminDesigns.jsx";
import { AdminDemoTab } from "./AdminDemoTab.jsx";
import { AdminGallery } from "./AdminGallery.jsx";
import { AdminAuditTab } from "./AdminAuditTab.jsx";
import { AdminLifecycleTab } from "./AdminLifecycleTab.jsx";
import { Num } from "../../../components/Num.jsx";
import { C } from "../../../styles/theme.js";

// Lazy-loaded so recharts (~90KB gz) stays out of the main bundle — it only
// downloads when the admin opens the Analytics tab.
const AdminAnalytics = lazy(() =>
  import("./AdminAnalytics.jsx").then((m) => ({ default: m.AdminAnalytics })),
);

const tabStyle = ({ isActive }) => ({
  flex: "1 1 140px", padding: "10px 0", borderRadius: 10, cursor: "pointer",
  background: isActive ? "rgba(201,168,76,.18)" : "rgba(255,255,255,.04)",
  border: `1px solid ${isActive ? "rgba(201,168,76,.4)" : "rgba(255,255,255,.08)"}`,
  color: isActive ? C.gold : C.dim,
  fontSize: 12, fontWeight: 800, fontFamily: "inherit", transition: "all .2s",
  textAlign: "center", textDecoration: "none", display: "block",
});

export function AdminPortal() {
  const {
    onBack, t, lang, setLang, toast,
    logoutAsking, setLogoutAsking, doLogout,
    confirmations,
  } = usePortal();

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <Toast message={toast} variant="gold" />

      <div style={{
        position: "sticky", top: 0, zIndex: 50, background: "rgba(7,7,10,.95)",
        backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(201,168,76,.18)", padding: "0 16px",
      }}>
        <div style={{ maxWidth: 720, margin: "0 auto", height: 54, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={onBack} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 16 }}>←</button>
            <span style={{ fontSize: 20 }}>🔒</span>
            <span style={{ fontFamily: "'Amiri','Frank Ruhl Libre',serif", color: C.gold, fontWeight: 900, fontSize: 17 }}>{t("admin_title")}</span>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <LangSwitcher lang={lang} setLang={setLang} />
            <button data-testid="btn-logout" onClick={() => setLogoutAsking(true)} title={t("logout")} style={{
              background: "rgba(212,80,58,.08)", border: "1px solid rgba(212,80,58,.3)",
              color: C.red, padding: "5px 10px", borderRadius: 8,
              fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>↩ {t("logout")}</button>
          </div>
        </div>
      </div>
      {logoutAsking && <LogoutConfirm t={t} onConfirm={doLogout} onCancel={() => setLogoutAsking(false)}/>}

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px 80px" }}>
        <div data-testid="alert-admin-warning" className="gold-card" style={{ marginBottom: 18, padding: "14px 18px",
          background: "rgba(255,180,80,.06)", border: "1px solid rgba(255,180,80,.2)" }}>
          <div style={{ fontSize: 12, color: "#f0c84c", fontWeight: 700 }}>⚠ {t("admin_warning")}</div>
        </div>

        {/* Admin sub-tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
          <NavLink data-testid="nav-admin-analytics"     to="/portal/admin/analytics"     style={tabStyle}>📊 {lang === "he" ? "אנליטיקה" : "التحليلات"}</NavLink>
          <NavLink data-testid="nav-admin-users"         to="/portal/admin/users"         style={tabStyle}>👥 {t("admin_tab_users")}</NavLink>
          <NavLink data-testid="nav-admin-paylinks"      to="/portal/admin/payment-links" style={tabStyle}>💳 {t("admin_paylinks_tab")}</NavLink>
          <NavLink data-testid="nav-admin-send"          to="/portal/admin/send"          style={tabStyle}>📨 {t("admin_tab_send")}</NavLink>
          <NavLink data-testid="nav-admin-confirmations" to="/portal/admin/confirmations" style={tabStyle}>✓ {t("admin_tab_confirmations")}{confirmations.length ? <> (<Num>{confirmations.length}</Num>)</> : ""}</NavLink>
          <NavLink data-testid="nav-admin-designs"       to="/portal/admin/designs"       style={tabStyle}>🎨 {lang === "he" ? "עיצובים" : "التصاميم"}</NavLink>
          <NavLink data-testid="nav-admin-demo"          to="/portal/admin/demo"          style={tabStyle}>🖼 {lang === "he" ? "דף הדגמה" : "صفحة العرض"}</NavLink>
          <NavLink data-testid="nav-admin-gallery"       to="/portal/admin/gallery"       style={tabStyle}>📸 {lang === "he" ? "גלריה" : "المعرض"}</NavLink>
          <NavLink data-testid="nav-admin-settings"      to="/portal/admin/settings"      style={tabStyle}>⚙ {t("admin_tab_settings")}</NavLink>
          <NavLink data-testid="nav-admin-whatsapp"      to="/portal/admin/whatsapp"      style={tabStyle}>📱 {t("admin_tab_whatsapp")}</NavLink>
          <NavLink data-testid="nav-admin-templates"     to="/portal/admin/templates"     style={tabStyle}>📝 {t("admin_tab_templates")}</NavLink>
          <NavLink data-testid="nav-admin-lifecycle"     to="/portal/admin/lifecycle"     style={tabStyle}>🚫 {t("adm_lc_tab")}</NavLink>
          <NavLink data-testid="nav-admin-audit"         to="/portal/admin/audit"         style={tabStyle}>📜 {lang === "he" ? "יומן" : "السجل"}</NavLink>
        </div>

        <Suspense fallback={<div className="card" style={{ textAlign: "center", padding: 24, color: C.dim }}>…</div>}>
          <Routes>
            <Route index                  element={<Navigate to="users" replace />} />
            <Route path="analytics"       element={<AdminAnalytics />} />
            <Route path="users"           element={<AdminUserManager />} />
            <Route path="payment-links"   element={<AdminPaymentLinks />} />
            <Route path="send"            element={<AdminSendTab />} />
            <Route path="confirmations"   element={<AdminConfirmationsTab />} />
            <Route path="designs"         element={<AdminDesigns />} />
            <Route path="demo"            element={<AdminDemoTab />} />
            <Route path="gallery"         element={<AdminGallery lang={lang} />} />
            <Route path="settings"        element={<AdminSettingsTab />} />
            <Route path="whatsapp"        element={<AdminWhatsAppSetupTab />} />
            <Route path="templates"       element={<AdminMessageTemplatesTab />} />
            <Route path="lifecycle"       element={<AdminLifecycleTab />} />
            <Route path="audit"           element={<AdminAuditTab />} />
            <Route path="*"               element={<Navigate to="users" replace />} />
          </Routes>
        </Suspense>
      </div>

      <EditConfirmationModal />
    </div>
  );
}
