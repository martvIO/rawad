// Native portal context — the trimmed, groom-only composition root.
//
// Unlike the web's usePortalState (which wires admin + driver + guests + geo +
// settings), the mobile app only needs auth: hydrate the session at boot, expose
// login/logout, and the current user + language. Everything reuses @dawa/core.
//
// NOTE: native storage (expo-secure-store) is async, so we hydrate via
// loadStoredTokensAsync() and deliberately do NOT use the web's subscribeAuth()
// (which calls the sync loadStoredTokens()).
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { makeT } from "@dawa/core/i18n/index.js";
import {
  loadStoredTokensAsync,
  getStoredUid,
} from "@dawa/core/utils/tokenManager.js";
import { signIn, fetchProfile, signOutNow } from "@dawa/core/services/auth.js";

const PortalContext = createContext(null);

export const usePortal = () => useContext(PortalContext);

function normalizeUser(u) {
  if (!u) return null;
  return {
    uid: u.uid,
    role: u.role,
    username: u.username,
    displayName: u.displayName ?? null,
    phoneE164: u.phoneE164 ?? null,
    mustChangePassword: u.mustChangePassword === true,
    // Feature flags (default ON when the server omits them), matching the web
    // auth service. Dashboard stats + the Guests status-badge lock gate on these.
    canSeeAttendance: u.canSeeAttendance !== false,
    canUsePhotographer: u.canUsePhotographer !== false,
    claims: u.claims ?? { role: u.role, username: u.username },
  };
}

export function PortalProvider({ children }) {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null);
  const [lang, setLang] = useState("ar");
  const t = makeT(lang);

  // Boot: hydrate tokens from secure-store (async), then resolve /auth/me.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadStoredTokensAsync();
        if (getStoredUid()) {
          const profile = await fetchProfile();
          if (!cancelled) setUser(normalizeUser(profile));
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username, password) => {
    const u = normalizeUser(await signIn(username, password));
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await signOutNow();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    setUser(normalizeUser(await fetchProfile()));
  }, []);

  const value = { authReady, user, lang, setLang, t, login, logout, refreshUser };
  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}
