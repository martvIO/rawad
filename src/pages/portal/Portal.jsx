// Portal entry — wraps the portal subtree in PortalProvider, then defers
// to <Routes> for role-based navigation. The default redirect lands the
// user on their role's primary tab right after login.
//
// Each role's subtree is wrapped in <RoleGuard> so the route is gated by
// an explicit role check, not just conditional rendering. This is
// convenience only — server-side enforcement lives in Cloud Functions
// (assertAdmin) and RTDB rules; even if a client somehow renders the
// wrong page, every privileged call will be rejected server-side.
import { Routes, Route, Navigate } from "react-router-dom";
import { PortalProvider, usePortal } from "../../context/PortalContext.jsx";
import { RoleGuard } from "../../components/RoleGuard.jsx";
import { BrandLogo } from "../../components/BrandLogo.jsx";
import { LoginScreen } from "./LoginScreen.jsx";
import { LogoutPage } from "./LogoutPage.jsx";
import { AdminPortal } from "./admin/AdminPortal.jsx";
import { DriverPortal } from "./driver/DriverPortal.jsx";
import { GroomPortalView } from "./groom/GroomPortalView.jsx";

// Branded splash shown while the auth subscription resolves the session.
// Replaces a blank screen — and prevents a login-flash for active sessions.
function AuthLoadingScreen() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 22,
    }}>
      <BrandLogo size={56} />
      <div style={{
        width: 30, height: 30,
        border: "3px solid rgba(201,168,76,.18)",
        borderTopColor: "#c9a84c",
        borderRadius: "50%",
        animation: "spin .7s linear infinite",
      }} />
    </div>
  );
}

// Picks which view to render — must run inside <PortalProvider>.
function PortalRouter() {
  const { authed, authReady, userType } = usePortal();
  // While the auth subscription resolves the session, show a branded
  // splash — avoids a blank screen and a login-flash for active sessions.
  if (!authReady) return <AuthLoadingScreen />;
  if (!authed) return <LoginScreen />;

  const defaultPath =
    userType === "admin"  ? "/portal/admin/users"
  : userType === "driver" ? "/portal/driver/pending"
  :                        "/portal/groom";

  return (
    <Routes>
      <Route index element={<Navigate to={defaultPath} replace />} />
      <Route path="logout"   element={<LogoutPage />} />
      <Route path="admin/*"  element={<RoleGuard roles={["admin"]}  fallback={<Navigate to={defaultPath} replace />}><AdminPortal />     </RoleGuard>} />
      <Route path="driver/*" element={<RoleGuard roles={["driver"]} fallback={<Navigate to={defaultPath} replace />}><DriverPortal />    </RoleGuard>} />
      <Route path="groom/*"  element={<RoleGuard roles={["groom"]}  fallback={<Navigate to={defaultPath} replace />}><GroomPortalView /> </RoleGuard>} />
      <Route path="*"        element={<Navigate to={defaultPath} replace />} />
    </Routes>
  );
}

// `props` (onBack, t, lang, setLang) come from App and feed the provider.
export function Portal(props) {
  return (
    <PortalProvider {...props}>
      <PortalRouter />
    </PortalProvider>
  );
}
