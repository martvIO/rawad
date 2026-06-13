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
          include: [
            "tests/functions/helpers.test.ts",
            "tests/functions/rateLimit.test.ts",
            "tests/functions/stripApiPrefix.test.ts",
            "tests/functions/invitesAuthz.test.ts",
            "tests/functions/faceMatch.test.ts",
            "tests/functions/passwordCrypto.test.ts",
            "tests/functions/decryptPasswordFields.test.ts",
            "tests/functions/authPubkey.test.ts",
            "tests/functions/authPubkeyUnavailable.test.ts",
            "tests/functions/passwordEncryptionRoutes.test.ts",
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
