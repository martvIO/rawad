// Groom mobile app entry point — mounts the React tree into #root.
//
// Mirrors frontend/src/main.jsx but: (1) renders MobileApp (groom-only router),
// (2) initializes the Capacitor native shell, and (3) skips Sentry (the web
// entry's optional, DSN-gated monitoring) to keep the native bundle lean.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ErrorBoundary } from "@app/components/ErrorBoundary.jsx";
import MobileApp from "./MobileApp.jsx";
import { initNative } from "./native.js";

initNative();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <MobileApp />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
