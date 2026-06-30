// Application entry point — mounts the React tree into #root.
// MUST be first: wires the @dawa/core env + storage adapters before any
// service/config module is evaluated.
import "./initAdapters.js";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { initSentry } from "./utils/sentry.js";

initSentry(); // no-op unless VITE_SENTRY_DSN is configured

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);
