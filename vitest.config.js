import { defineConfig } from "vitest/config";

// Two test projects:
//   unit        — pure logic (utils, data, functions helpers). jsdom env, no
//                 emulators. Run with `npm run test:unit`.
//   integration — security-rule tests against the Firebase emulator. node env.
//                 Run with `npm test` (wrapped in `firebase emulators:exec`).
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
            "tests/functions/helpers.test.ts",
            "tests/functions/rateLimit.test.ts",
          ],
          environment: "jsdom",
          testTimeout: 10000,
        },
      },
      {
        test: {
          name: "integration",
          include: [
            "tests/database.test.js",
            "tests/rules/**/*.test.{js,ts}",
          ],
          environment: "node",
          testTimeout: 20000,
          hookTimeout: 30000,
        },
      },
    ],
  },
});
