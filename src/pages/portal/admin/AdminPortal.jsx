// Admin portal shell — sticky header, warning banner, sub-tab navigation,
// and the four admin tabs (users / send / settings / confirmations).
import { LangSwitcher } from "../../../components/LangSwitcher.jsx";
import { LogoutConfirm } from "../../../components/LogoutConfirm.jsx";
import { Toast } from "../../../components/Toast.jsx";
import { EditConfirmationModal } from "../../../components/EditConfirmationModal.jsx";
import { usePortal } from "../../../context/PortalContext.jsx";
import { AdminUsersTab } from "./AdminUsersTab.jsx";
import { AdminSendTab } from "./AdminSendTab.jsx";
import { AdminSettingsTab } from "./AdminSettingsTab.jsx";
import { AdminConfirmationsTab } from "./AdminConfirmationsTab.jsx";

export function AdminPortal() {
  const {
    onBack, t, lang, setLang, toast,
    logoutAsking, setLogoutAsking, doLogout,
    adminTab, setAdminTab, confirmations,
  } = usePortal();

  return (
    <div style={{ minHeight: "100vh", background: "#07070a" }}>
      <Toast message={toast} variant="gold" />

      <div style={{
        position: "sticky", top: 0, zIndex: 50, background: "rgba(7,7,10,.95)",
        backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(201,168,76,.18)", padding: "0 16px",
      }}>
        <div style={{ maxWidth: 720, margin: "0 auto", height: 54, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={onBack} style={{ background: "none", border: "none", color: "#7a6a4a", cursor: "pointer", fontSize: 16 }}>←</button>
            <span style={{ fontSize: 20 }}>🔒</span>
            <span style={{ fontFamily: "'Amiri',serif", color: "#c9a84c", fontWeight: 900, fontSize: 17 }}>{t("admin_title")}</span>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <LangSwitcher lang={lang} setLang={setLang} />
            <button onClick={() => setLogoutAsking(true)} title={t("logout")} style={{
              background: "rgba(212,80,58,.08)", border: "1px solid rgba(212,80,58,.3)",
              color: "#d47a4b", padding: "5px 10px", borderRadius: 8,
              fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>↩ {t("logout")}</button>
          </div>
        </div>
      </div>
      {logoutAsking && <LogoutConfirm t={t} onConfirm={doLogout} onCancel={() => setLogoutAsking(false)}/>}

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px 80px" }}>
        <div className="gold-card" style={{ marginBottom: 18, padding: "14px 18px",
          background: "rgba(255,180,80,.06)", border: "1px solid rgba(255,180,80,.2)" }}>
          <div style={{ fontSize: 12, color: "#f0c84c", fontWeight: 700 }}>⚠ {t("admin_warning")}</div>
        </div>

        {/* Admin sub-tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
          {[
            ["users",         "👥 " + t("admin_tab_users")],
            ["send",          "📨 " + t("admin_tab_send")],
            ["confirmations", "✓ " + t("admin_tab_confirmations") + (confirmations.length ? ` (${confirmations.length})` : "")],
            ["settings",      "⚙ " + t("admin_tab_settings")],
          ].map(([id, lbl]) => (
            <button key={id} onClick={() => setAdminTab(id)} style={{
              flex: "1 1 140px", padding: "10px 0", borderRadius: 10, cursor: "pointer",
              background: adminTab === id ? "rgba(201,168,76,.18)" : "rgba(255,255,255,.04)",
              border: `1px solid ${adminTab === id ? "rgba(201,168,76,.4)" : "rgba(255,255,255,.08)"}`,
              color: adminTab === id ? "#c9a84c" : "#7a6a4a",
              fontSize: 12, fontWeight: 800, fontFamily: "inherit", transition: "all .2s",
            }}>{lbl}</button>
          ))}
        </div>

        {adminTab === "users" && <AdminUsersTab />}
        {adminTab === "send" && <AdminSendTab />}
        {adminTab === "settings" && <AdminSettingsTab />}
        {adminTab === "confirmations" && <AdminConfirmationsTab />}
      </div>

      <EditConfirmationModal />
    </div>
  );
}
