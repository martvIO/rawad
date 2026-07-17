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

// Post-deploy self-heal (BP-01). A deploy replaces the hashed chunks, so a tab
// opened before it 404s the moment it lazy-loads a route — and the SPA rewrite
// answers that 404 with index.html under a 1-year immutable header, so the tab
// caches HTML-as-JS and stays broken until a hard refresh. Vite fires
// `vite:preloadError` for exactly this; reloading fetches the new index.html and
// its new chunk hashes, which is the fix the user would otherwise have to guess.
const PRELOAD_RELOAD_AT = "dawa_preload_reload_at";
// Rate-limit rather than once-per-tab: a bare boolean would never let a
// long-lived tab heal a SECOND deploy, and clearing it on a successful boot
// would defeat the guard entirely (the retry after a failed reload is itself a
// successful boot). Ageing the timestamp out gives both. 30 s is the deciding
// gap: a reload re-enters the same URL and re-attempts the same import, so a
// genuinely-missing chunk re-fires within ~1 s, while a real second deploy is
// minutes or hours away.
const PRELOAD_RELOAD_COOLDOWN_MS = 30_000;

window.addEventListener("vite:preloadError", (event) => {
  let lastAttempt = 0;
  try { lastAttempt = Number(sessionStorage.getItem(PRELOAD_RELOAD_AT)) || 0; } catch {}

  // Already reloaded and the chunk is STILL unreachable — a genuinely broken
  // deploy, not deploy churn. Reloading again would only loop, so let Vite throw:
  // the ErrorBoundary renders its recovery screen (with a manual reload button),
  // and logErr records it. This repeat is the signal worth keeping — the routine
  // first error is expected of every deploy and reporting it would be pure noise.
  if (Date.now() - lastAttempt < PRELOAD_RELOAD_COOLDOWN_MS) return;

  // Only reload if the guard actually persisted. With sessionStorage unavailable
  // (private-mode quota) nothing rate-limits us, and an unguarded reload on a
  // broken deploy is a tight infinite loop — much worse than the broken nav.
  try { sessionStorage.setItem(PRELOAD_RELOAD_AT, String(Date.now())); }
  catch { return; }

  event.preventDefault(); // we're reloading — don't also surface the module error
  window.location.reload();
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);
