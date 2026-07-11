// Portal auth/session domain — owns the Firebase-Auth-backed session state, the
// derived role/feature flags, the login form + handleLogin, and the logout
// primitives. Extracted from usePortalState (the "tangled center"); the
// composition root wires it to the other portal hooks and sequences the full
// cross-domain logout.
import { useEffect, useState } from "react";
import { ROLES } from "../../constants/roles.js";
import { subscribeAuth, signIn } from "../../services/auth.js";
import { setAuthChangeCallback } from "../../utils/apiClient.js";

export function usePortalAuth({ t, lang, navigate }) {
  // ── Auth (driven by Firebase Auth state) ────────────────────────────────────
  // Subscribe to BOTH auth-state changes (sign-in / sign-out) AND ID-token
  // refreshes — the token-refresh path makes a newly-granted role claim visible
  // to the UI without forcing a sign-out / sign-in.
  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  // Bumped after login/logout to re-run the subscription so it re-evaluates with
  // the freshly stored (or cleared) tokens.
  const [authKey, setAuthKey] = useState(0);
  useEffect(() => {
    const unsubAuth = subscribeAuth((u) => {
      setAuthUser(u);
      setAuthReady(true);
    });
    // When apiClient detects an unrecoverable 401 it fires this callback so the
    // portal can drop the local user state and route to login.
    setAuthChangeCallback(() => {
      setAuthUser(null);
      setAuthReady(true);
    });
    return () => {
      unsubAuth();
      setAuthChangeCallback(null);
    };
  }, [authKey]);

  const authed = !!authUser;
  const userType = authUser?.role ?? null;
  const currentUsername = authUser?.username ?? null;
  const currentUid = authUser?.uid ?? null;
  const isAdmin = authUser?.claims?.role === ROLES.ADMIN;
  // Per-groom feature flags (default ON when missing — legacy grooms).
  const canSeeAttendance = authUser?.canSeeAttendance !== false;
  const canUsePhotographer = authUser?.canUsePhotographer !== false;
  // Boarding-pass / wallet feature defaults OFF — admin enables per groom.
  const canUseBoardingPass = authUser?.canUseBoardingPass === true;
  // Forced first-login password change (auto-provisioned groom). Drives the gate
  // in PortalRouter that blocks every role dashboard until the password changes.
  const mustChangePassword = authUser?.mustChangePassword === true;
  // First-sign-in onboarding (couple bride/groom names). Groom-only; the gate in
  // PortalRouter shows the OnboardingScreen until the account carries onboardedAt.
  // markOnboarded flips it optimistically on submit so the gate clears at once.
  const needsOnboarding = userType === "groom" && !authUser?.onboardedAt;
  const markOnboarded = () => setAuthUser((u) => (u ? { ...u, onboardedAt: Date.now() } : u));

  // ── Login form (transient) ──────────────────────────────────────────────────
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Logout confirmation modal
  const [logoutAsking, setLogoutAsking] = useState(false);

  const handleLogin = async () => {
    const u = loginUser.trim();
    const p = loginPass;
    if (!u || !p) { setLoginError(t("login_error")); return; }
    setLoginLoading(true);
    try {
      const user = await signIn(u, p);
      // Apply the session immediately so PortalRouter flips to the authed tree
      // without waiting for the first /auth/me poll. Bumping authKey restarts the
      // subscription so it picks up the freshly stored tokens.
      setAuthUser(user);
      setAuthReady(true);
      setAuthKey((k) => k + 1);
      setLoginError("");
      const path =
        user.role === ROLES.ADMIN  ? "/portal/admin/users"
      : user.role === ROLES.DRIVER ? "/portal/driver/pending"
      :                              "/portal/groom";
      navigate(path, { replace: true });
    } catch (err) {
      // Distinguish the failure so the user isn't told "wrong password" when the
      // real cause is rate-limiting or a server error.
      const status = err?.status;
      if (status === 429) {
        setLoginError(lang === "he"
          ? "יותר מדי ניסיונות התחברות — נסה שוב בעוד מספר דקות."
          : "محاولات دخول كثيرة — يرجى المحاولة بعد عدة دقائق.");
      } else if (status >= 500) {
        setLoginError(lang === "he"
          ? "שגיאת שרת — נסה שוב בעוד רגע."
          : "خطأ في الخادم — يرجى المحاولة بعد قليل.");
      } else {
        setLoginError(t("login_error"));
      }
    } finally {
      setLoginLoading(false);
    }
  };

  // Logout PRIMITIVES — the composition root sequences the full cross-domain
  // logout (it also resets driver-serving-groom + shared-cities, then navigates).
  const resetLoginFields = () => { setLoginUser(""); setLoginPass(""); };
  const applySignedOut = () => {
    // Drop the local session and restart the subscription (it now fires cb(null)
    // since tokens are gone).
    setAuthUser(null);
    setAuthReady(true);
    setAuthKey((k) => k + 1);
  };

  return {
    authUser,
    authed, authReady, userType, currentUid, currentUsername, isAdmin,
    canSeeAttendance, canUsePhotographer, canUseBoardingPass, mustChangePassword,
    needsOnboarding, markOnboarded,
    loginUser, setLoginUser, loginPass, setLoginPass,
    loginError, setLoginError, loginLoading,
    handleLogin,
    logoutAsking, setLogoutAsking,
    resetLoginFields, applySignedOut,
  };
}
