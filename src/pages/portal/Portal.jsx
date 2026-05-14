// Portal entry — wraps the portal subtree in PortalProvider, then routes by
// auth state and user role to the login screen or one of the role portals.
import { PortalProvider, usePortal } from "../../context/PortalContext.jsx";
import { LoginScreen } from "./LoginScreen.jsx";
import { AdminPortal } from "./admin/AdminPortal.jsx";
import { DriverPortal } from "./driver/DriverPortal.jsx";
import { GroomPortalView } from "./groom/GroomPortalView.jsx";

// Picks which view to render — must run inside <PortalProvider>.
function PortalRouter() {
  const { authed, userType } = usePortal();
  if (!authed) return <LoginScreen />;
  if (userType === "admin") return <AdminPortal />;
  if (userType === "driver") return <DriverPortal />;
  return <GroomPortalView />;
}

// `props` (onBack, t, lang, setLang) come from App and feed the provider.
export function Portal(props) {
  return (
    <PortalProvider {...props}>
      <PortalRouter />
    </PortalProvider>
  );
}
