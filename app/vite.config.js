import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Vite config for the GROOM MOBILE app (Capacitor).
//
// This package reuses the screens/services/hooks/styles/i18n from the sibling
// `frontend/` package via the `@app` alias, but ships ONLY the groom + auth +
// terms + help routes (see src/MobileApp.jsx / src/MobilePortal.jsx). Admin,
// driver, and the landing page are never imported, so Rollup never bundles them.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Reach into the web app's source. Shared files keep their own relative
      // imports (resolved within frontend/src); only this package uses `@app`.
      "@app": fileURLToPath(new URL("../frontend/src", import.meta.url)),
    },
    // Both app/node_modules and frontend/node_modules contain React; without
    // dedupe the build can bundle two copies and hooks break ("Invalid hook
    // call"). Force a single instance of the singleton libs.
    dedupe: ["react", "react-dom", "react-router-dom", "three"],
  },
  server: {
    // Allow the dev server to read files from the repo root (the `@app` alias
    // points outside this package's root into ../frontend/src).
    fs: { allow: [".."] },
  },
});
