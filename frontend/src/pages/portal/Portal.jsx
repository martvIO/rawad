// Portal entry — wraps the portal subtree in PortalProvider, then defers
// to <Routes> for role-based navigation. The default redirect lands the
// user on their role's primary tab right after login.
//
// Each role's subtree is wrapped in <RoleGuard> so the route is gated by
// an explicit role check, not just conditional rendering. This is
// convenience only — server-side enforcement lives in Cloud Functions
// (assertAdmin) and RTDB rules; even if a client somehow renders the
// wrong page, every privileged call will be rejected server-side.
import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { PortalProvider, usePortal } from "../../context/PortalContext.jsx";
import { RoleGuard } from "../../components/RoleGuard.jsx";
import { BrandLogo } from "../../components/BrandLogo.jsx";
import { LoginScreen } from "./LoginScreen.jsx";
import { ForgotPasswordPage } from "./ForgotPasswordPage.jsx";
import { LogoutPage } from "./LogoutPage.jsx";
import { PasswordChangeScreen } from "./PasswordChangeScreen.jsx";

// Role dashboards are code-split per role: a signed-in user only downloads the
// bundle for their own role instead of all three. Same lazy() idiom used for
// AdminAnalytics / DigitalYourPhotos (named export → { default }).
const AdminPortal = lazy(() =>
  import("./admin/AdminPortal.jsx").then((m) => ({ default: m.AdminPortal })),
);
const DriverPortal = lazy(() =>
  import("./driver/DriverPortal.jsx").then((m) => ({ default: m.DriverPortal })),
);
const GroomPortalView = lazy(() =>
  import("./groom/GroomPortalView.jsx").then((m) => ({ default: m.GroomPortalView })),
);

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
  const { authed, authReady, userType, mustChangePassword } = usePortal();
  // While the auth subscription resolves the session, show a branded
  // splash — avoids a blank screen and a login-flash for active sessions.
  if (!authReady) return <AuthLoadingScreen />;

  const defaultPath =
    userType === "admin"  ? "/portal/admin/users"
  : userType === "driver" ? "/portal/driver/pending"
  :                        "/portal/groom";

  // Signed out — /portal/login is the only reachable route; every other
  // /portal/* URL redirects to it so the address bar matches the screen.
  if (!authed) {
    return (
      <Routes>
        <Route path="login"           element={<LoginScreen />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="*"               element={<Navigate to="/portal/login" replace />} />
      </Routes>
    );
  }

  // Forced first-login password change (auto-provisioned groom). Block every
  // role dashboard until the temporary password is changed.
  if (mustChangePassword) {
    return (
      <Routes>
        <Route path="logout" element={<LogoutPage />} />
        <Route path="*" element={<PasswordChangeScreen />} />
      </Routes>
    );
  }

  // Signed in — role-based routing. The index, the now-stale login route,
  // and any unknown path redirect to the user's role dashboard. Suspense covers
  // the lazy role-dashboard chunk load (reuses the branded auth splash).
  return (
    <Suspense fallback={<AuthLoadingScreen />}>
      <Routes>
        <Route index           element={<Navigate to={defaultPath} replace />} />
        <Route path="login"    element={<Navigate to={defaultPath} replace />} />
        <Route path="logout"   element={<LogoutPage />} />
        <Route path="admin/*"  element={<RoleGuard roles={["admin"]}  fallback={<Navigate to={defaultPath} replace />}><AdminPortal />     </RoleGuard>} />
        <Route path="driver/*" element={<RoleGuard roles={["driver"]} fallback={<Navigate to={defaultPath} replace />}><DriverPortal />    </RoleGuard>} />
        <Route path="groom/*"  element={<RoleGuard roles={["groom"]}  fallback={<Navigate to={defaultPath} replace />}><GroomPortalView /> </RoleGuard>} />
        <Route path="*"        element={<Navigate to={defaultPath} replace />} />
      </Routes>
    </Suspense>
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
