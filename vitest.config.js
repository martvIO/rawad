import { defineConfig } from "vitest/config";

// Vitest runs Node-side; no Vite plugins required for the rules tests.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    environment: "node",
    testTimeout: 20000,
    hookTimeout: 30000,
    globals: false,
  },
});
