import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { defineConfig } from "vitest/config";

// Backend test projects (frontend unit tests live in frontend/vitest.config.js):
//   unit        — Cloud Functions pure-logic tests (helpers, rate limits,
//                 authz, face matching). node env, no emulators. Run via the
//                 root `npm run test:unit` alias.
//   integration — security-rule tests against the Firebase emulator. node env.
//                 Run with `npm test` (wrapped in `firebase emulators:exec`).
// `root` is pinned to backend/ so include globs resolve correctly when vitest
// is invoked from the repo root with `-c backend/vitest.config.js`.
export default defineConfig({
  root: dirname(fileURLToPath(import.meta.url)),
  test: {
    projects: [
      {
        test: {
          name: "unit",
          // Glob (not an explicit list) so new pure-logic tests under
          // tests/functions/ are picked up automatically — an explicit list
          // silently dropped newly-added tests.
          include: ["tests/functions/**/*.test.{ts,js}"],
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
