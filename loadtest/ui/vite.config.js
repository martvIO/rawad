import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Local-only dashboard UI. In dev mode, Vite proxies API + artifact traffic to
// the FastAPI backend on 127.0.0.1:8765. In production the same FastAPI process
// serves the built SPA from dist/, so these paths resolve same-origin there.
const BACKEND = "http://127.0.0.1:8765";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
  },
  server: {
    port: 5174,
    proxy: {
      "/api": { target: BACKEND, changeOrigin: true },
      "/artifacts": { target: BACKEND, changeOrigin: true },
    },
  },
});
