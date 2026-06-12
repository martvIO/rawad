import { defineConfig } from "vitest/config";

// Backend test projects (frontend unit tests live in frontend/vitest.config.js):
//   unit        — Cloud Functions pure-logic tests (helpers, rate limits,
//                 authz, face matching). node env, no emulators. Run via the
//                 root `npm run test:unit` alias.
//   integration — security-rule tests against the Firebase emulator. node env.
//                 Run with `npm test` (wrapped in `firebase emulators:exec`).
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: [
            "tests/functions/helpers.test.ts",
            "tests/functions/rateLimit.test.ts",
            "tests/functions/stripApiPrefix.test.ts",
            "tests/functions/invitesAuthz.test.ts",
            "tests/functions/faceMatch.test.ts",
          ],
          environment: "node",
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
