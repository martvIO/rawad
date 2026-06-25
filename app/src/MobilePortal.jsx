// Groom-only portal router for the mobile app.
//
// This is a trimmed copy of frontend/src/pages/portal/Portal.jsx: it wires the
// auth screens + the GROOM view only. It deliberately does NOT import the admin
// or driver portals, so Rollup never bundles them into the app. Server-side
// enforcement (assertAdmin / RTDB rules / custom claims) remains authoritative;
// this is convenience routing only.
import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { PortalProvider, usePortal } from "@app/context/PortalContext.jsx";
import { RoleGuard } from "@app/components/RoleGuard.jsx";
import { BrandLogo } from "@app/components/BrandLogo.jsx";
import { LoginScreen } from "@app/pages/portal/LoginScreen.jsx";
import { ForgotPasswordPage } from "@app/pages/portal/ForgotPasswordPage.jsx";
import { LogoutPage } from "@app/pages/portal/LogoutPage.jsx";
import { PasswordChangeScreen } from "@app/pages/portal/PasswordChangeScreen.jsx";

// Code-split the groom dashboard (it pulls in the Three.js design editor); the
// login/auth screens stay in the main chunk so first paint is fast.
const GroomPortalView = lazy(() =>
  import("@app/pages/portal/groom/GroomPortalView.jsx").then((m) => ({ default: m.GroomPortalView })),
);

// Branded splash shown while the auth subscription resolves the session.
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

// Shown when a non-groom account (admin/driver) signs in. The mobile app is for
// grooms only; rather than loop-redirecting to an absent dashboard, explain and
// offer logout.
function NotAGroomNotice() {
  const navigate = useNavigate();
  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 18, padding: 28,
      textAlign: "center",
    }}>
      <BrandLogo size={56} />
      <p style={{ color: "#fff3c0", fontSize: 17, lineHeight: 1.7, margin: 0, maxWidth: 360 }}>
        هذا التطبيق مخصّص للعرسان فقط.<br />
        אפליקציה זו מיועדת לחתנים בלבד.
      </p>
      <button
        type="button"
        onClick={() => navigate("/portal/logout")}
        style={{
          marginTop: 6, padding: "11px 26px", borderRadius: 999,
          background: "rgba(201,168,76,.10)", border: "1px solid rgba(201,168,76,.35)",
          color: "#fff3c0", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer",
        }}
      >
        تسجيل الخروج / התנתקות
      </button>
    </div>
  );
}

function PortalRouter() {
  const { authed, authReady, userType, mustChangePassword } = usePortal();
  if (!authReady) return <AuthLoadingScreen />;

  // Signed out — only login + forgot-password are reachable.
  if (!authed) {
    return (
      <Routes>
        <Route path="login"           element={<LoginScreen />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="*"               element={<Navigate to="/portal/login" replace />} />
      </Routes>
    );
  }

  // Forced first-login password change (auto-provisioned groom).
  if (mustChangePassword) {
    return (
      <Routes>
        <Route path="logout" element={<LogoutPage />} />
        <Route path="*"      element={<PasswordChangeScreen />} />
      </Routes>
    );
  }

  // Groom-only app: any other role has no home here.
  if (userType !== "groom") {
    return (
      <Routes>
        <Route path="logout" element={<LogoutPage />} />
        <Route path="*"      element={<NotAGroomNotice />} />
      </Routes>
    );
  }

  // Signed-in groom.
  return (
    <Suspense fallback={<AuthLoadingScreen />}>
      <Routes>
        <Route index         element={<Navigate to="/portal/groom" replace />} />
        <Route path="login"  element={<Navigate to="/portal/groom" replace />} />
        <Route path="logout" element={<LogoutPage />} />
        <Route path="groom/*" element={
          <RoleGuard roles={["groom"]} fallback={<Navigate to="/portal/groom" replace />}>
            <GroomPortalView />
          </RoleGuard>
        } />
        <Route path="*" element={<Navigate to="/portal/groom" replace />} />
      </Routes>
    </Suspense>
  );
}

// `props` (onBack, t, lang, setLang) come from MobileApp and feed the provider.
export function MobilePortal(props) {
  return (
    <PortalProvider {...props}>
      <PortalRouter />
    </PortalProvider>
  );
}
