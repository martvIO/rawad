import { defineConfig, devices } from "@playwright/test";

// Tests run against the Vite dev server (http://localhost:5173) backed by the
// Firebase emulator suite. Start them with `npm run dev:full` (boots emulators
// + Vite together) or run them separately. Override the base URL via
// PLAYWRIGHT_BASE_URL when targeting the hosting emulator (localhost:5000) or
// the deployed site.
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e-results",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  retries: process.env.CI ? 2 : 1,
  fullyParallel: false,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 8_000,
    navigationTimeout: 20_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
