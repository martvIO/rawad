import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite config — React plugin only; the app is a client-side SPA.
export default defineConfig({
  plugins: [react()],
});
