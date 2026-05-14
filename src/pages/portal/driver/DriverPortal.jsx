// Driver portal shell — gates on picking a groom, then shows the sticky header
// with the two driver tabs (delivery route / shared cities).
import { LangSwitcher } from "../../../components/LangSwitcher.jsx";
import { LogoutConfirm } from "../../../components/LogoutConfirm.jsx";
import { Toast } from "../../../components/Toast.jsx";
import { usePortal } from "../../../context/PortalContext.jsx";
import { DriverPickGroom } from "./DriverPickGroom.jsx";
import { DriverDeliveryList } from "./DriverDeliveryList.jsx";
import { SharedCities } from "./SharedCities.jsx";

export function DriverPortal() {
  const {
    onBack, t, lang, setLang, toast,
    logoutAsking, setLogoutAsking, doLogout,
    tab, setTab, myGuests,
    driverServingGroom, setDriverServingGroom,
  } = usePortal();

  // Pick-groom screen is required before showing the dashboard.
  if (!driverServingGroom) return <DriverPickGroom />;

  const done = myGuests.filter(g => g.status === "delivered");

  return (
    <div style={{ minHeight: "100vh", background: "#07070a" }}>
      <Toast message={toast} variant="green" />

      {/* Header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50, background: "rgba(7,7,10,.95)",
        backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(75,159,212,.15)",
        padding: "12px 16px",
      }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <button onClick={onBack} style={{ background: "none", border: "none", color: "#7a6a4a", cursor: "pointer", fontSize: 16 }}>←</button>
            <div style={{ fontSize: 22 }}>🚗</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 900, color: "#4b9fd4", fontSize: 15 }}>{t("driver_title")}</div>
              <div style={{ fontSize: 10, color: "#5a5040", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {t("driver_serving_for")} <span style={{ color: "#c9a84c", fontWeight: 700 }}>{driverServingGroom}</span>
              </div>
            </div>
            <LangSwitcher lang={lang} setLang={setLang} />
            <button onClick={() => setLogoutAsking(true)} title={t("logout")} style={{
              background: "rgba(212,80,58,.08)", border: "1px solid rgba(212,80,58,.3)",
              color: "#d47a4b", padding: "5px 10px", borderRadius: 8,
              fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>↩</button>
          </div>
          {/* Driver tabs */}
          <div style={{ display: "flex", gap: 6 }}>
            {[
              ["pending", "📋 " + t("driver_subtitle")],
              ["shared",  "🏘 " + t("tab_shared")],
            ].map(([id, lbl]) => (
              <button key={id} onClick={() => setTab(id)} style={{
                flex: 1, padding: "8px 0", borderRadius: 10, cursor: "pointer",
                background: tab === id ? "rgba(75,159,212,.18)" : "rgba(255,255,255,.04)",
                border: `1px solid ${tab === id ? "rgba(75,159,212,.4)" : "rgba(255,255,255,.08)"}`,
                color: tab === id ? "#4b9fd4" : "#7a6a4a",
                fontSize: 12, fontWeight: 800, fontFamily: "inherit", transition: "all .2s",
              }}>{lbl}</button>
            ))}
            <button onClick={() => setDriverServingGroom(null)} title={t("driver_pick_groom_change")} style={{
              padding: "8px 12px", borderRadius: 10, cursor: "pointer",
              background: "rgba(201,168,76,.08)", border: "1px solid rgba(201,168,76,.25)",
              color: "#c9a84c", fontSize: 14, fontWeight: 800, fontFamily: "inherit",
            }}>⇄</button>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "#4cc97a", textAlign: "left" }}>
            {done.length.toLocaleString("en")}/{myGuests.length.toLocaleString("en")} {t("driver_completed")}
          </div>
        </div>
      </div>

      {logoutAsking && <LogoutConfirm t={t} onConfirm={doLogout} onCancel={() => setLogoutAsking(false)}/>}

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "16px 16px 80px" }}>
        {(tab === "pending" || tab !== "shared") && <DriverDeliveryList />}
        {tab === "shared" && <SharedCities />}
      </div>
    </div>
  );
}
