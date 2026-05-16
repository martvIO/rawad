// Portal entry — wraps the portal subtree in PortalProvider, then routes by
// auth state and user role to the login screen or one of the role portals.
//
// Each role's page is wrapped in a <RoleGuard> so the route is gated by an
// explicit role check, not just conditional rendering. This is convenience
// only — server-side enforcement lives in Cloud Functions (assertAdmin) and
// RTDB rules; even if a client somehow renders the wrong page, every
// privileged call will be rejected server-side.
import { PortalProvider, usePortal } from "../../context/PortalContext.jsx";
import { RoleGuard } from "../../components/RoleGuard.jsx";
import { LoginScreen } from "./LoginScreen.jsx";
import { AdminPortal } from "./admin/AdminPortal.jsx";
import { DriverPortal } from "./driver/DriverPortal.jsx";
import { GroomPortalView } from "./groom/GroomPortalView.jsx";

// Picks which view to render — must run inside <PortalProvider>.
function PortalRouter() {
  const { authed } = usePortal();
  if (!authed) return <LoginScreen />;
  // Each guard renders its child only when the current userType matches.
  // Exactly one branch ever resolves; the others render null.
  return (
    <>
      <RoleGuard roles={["admin"]}>  <AdminPortal />     </RoleGuard>
      <RoleGuard roles={["driver"]}> <DriverPortal />    </RoleGuard>
      <RoleGuard roles={["groom"]}>  <GroomPortalView /> </RoleGuard>
    </>
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
