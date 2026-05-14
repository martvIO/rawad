// Portal context — runs usePortalState() once at the portal root and exposes
// the result to every role view, so sub-views never have to prop-drill.
import { createContext, useContext } from "react";
import { usePortalState } from "../hooks/usePortalState.js";

const PortalContext = createContext(null);

// Wraps the portal subtree. `props` (onBack, t, lang, setLang) come from App.
export function PortalProvider({ children, ...props }) {
  const value = usePortalState(props);
  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}

// Consumer hook — any view inside <PortalProvider> can grab what it needs.
export function usePortal() {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error("usePortal() must be used inside <PortalProvider>");
  return ctx;
}
