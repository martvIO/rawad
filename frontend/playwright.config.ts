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
  // Dawa is mobile-first and serves a large iOS-Safari (WebKit) share in the
  // Arab/Israeli market, where RTL + Safari quirks hide bugs Chromium never
  // shows. Run the full suite across desktop Chromium/Firefox/WebKit AND
  // emulated mobile viewports. For a fast local loop, target one project:
  //   npx playwright test --project=chromium
  // CI runs all of them (block-on-red). Emulation catches layout/CSS/RTL
  // regressions; real-device checks (docs/SMOKE_TEST.md §G) remain the source
  // of truth for camera / Face-Liveness / GPS, which can't be emulated.
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 14"] } },
  ],
});
