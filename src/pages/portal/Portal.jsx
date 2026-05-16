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
import { LoginScreen } from "./LoginScreen.jsx";
import { AdminPortal } from "./admin/AdminPortal.jsx";
import { DriverPortal } from "./driver/DriverPortal.jsx";
import { GroomPortalView } from "./groom/GroomPortalView.jsx";

// Picks which view to render — must run inside <PortalProvider>.
function PortalRouter() {
  const { authed, authReady, userType } = usePortal();
  // While Firebase Auth is still resolving, render nothing — avoids a
  // login-flash for users with an active session.
  if (!authReady) return null;
  if (!authed) return <LoginScreen />;

  const defaultPath =
    userType === "admin"  ? "/portal/admin/users"
  : userType === "driver" ? "/portal/driver/pending"
  :                        "/portal/groom/dashboard";

  return (
    <Routes>
      <Route index element={<Navigate to={defaultPath} replace />} />
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
