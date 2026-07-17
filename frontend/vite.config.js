import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// @dawa/core — the shared DOM-free core (REST client, services, utils, i18n,
// theme tokens) — lives at ../shared/src. We resolve it via an alias rather
// than an npm workspace so we don't disturb the Firebase Functions deploy
// bundling or the repo's Windows npm install workaround. The Expo app resolves
// the same package via Metro config.
const corePath = fileURLToPath(new URL("../shared/src", import.meta.url));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const reactPath = fileURLToPath(new URL("./node_modules/react", import.meta.url));
const reactDomPath = fileURLToPath(new URL("./node_modules/react-dom", import.meta.url));

// Vite config — React plugin only; the app is a client-side SPA.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@dawa/core": corePath,
      // Shared-core files (e.g. searchFilter's hook) import `react` by bare name.
      // Since shared/ lives outside frontend/node_modules, point react/react-dom
      // at the frontend's copy so they resolve, and dedupe to a single instance.
      react: reactPath,
      "react-dom": reactDomPath,
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    rollupOptions: {
      output: {
        // Split ONLY the React platform out of the entry chunk. It never changes
        // between app deploys, so it keeps its hash — and with /assets/** served
        // immutable, returning visitors re-download just the app code.
        //
        // Deliberately NOT a blanket "everything in node_modules" vendor chunk:
        // three, recharts and aws-amplify already sit in their own lazy route
        // chunks, and hoisting them here would drag all three into the initial
        // download for every visitor.
        manualChunks(id) {
          if (/node_modules[/\\](react|react-dom|scheduler|react-router|react-router-dom)[/\\]/.test(id)) {
            return "vendor-react";
          }
        },
      },
    },
  },
  // Let the dev server serve files from ../shared (outside the frontend root).
  server: { fs: { allow: [repoRoot] } },
});
