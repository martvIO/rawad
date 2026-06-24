import { defineConfig } from "vitest/config";

// Frontend unit tests — pure logic (utils, data, services). jsdom env, no
// emulators. Run with `npm run test:unit` (here or via the root alias).
// Backend unit + integration tests live in backend/vitest.config.js.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: [
            "src/__tests__/utils/**/*.test.{js,ts}",
            "src/__tests__/data/**/*.test.{js,ts}",
            "src/__tests__/services/**/*.test.{js,ts}",
            "src/__tests__/i18n/**/*.test.{js,ts}",
            "src/__tests__/components/**/*.test.{js,jsx,ts,tsx}",
          ],
          environment: "jsdom",
          // jest-dom matchers (toBeDisabled, toBeInTheDocument, …) for RTL tests.
          setupFiles: ["./src/__tests__/setup.js"],
          testTimeout: 10000,
        },
      },
    ],
  },
});
